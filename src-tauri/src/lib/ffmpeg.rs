use crate::domain::{
    CancelInProgressCompressionPayload, CompressionResult, CustomEvents, TauriEvents,
    QualityPreviewResult, VideoCompressionProgress, VideoInfo, VideoThumbnail,
};
use crossbeam_channel::{Receiver, Sender};
use nanoid::nanoid;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use shared_child::SharedChild;
use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};
use strum::EnumProperty;
use tauri::{AppHandle, Emitter, Listener, Manager};
use tauri_plugin_shell::ShellExt;

// Static regex patterns compiled once at first use
static OUT_TIME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"out_time=(?P<out_time>.*?)\n").expect("out_time regex pattern is invalid"));
static DURATION_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"Duration: (?P<duration>.*?),").expect("duration regex pattern is invalid"));
static DIMENSION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"Video:.*?,.*? (?P<width>\d{2,5})x(?P<height>\d{2,5})")
        .expect("dimension regex pattern is invalid")
});
static FPS_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?P<fps>\d+(\.\d+)?) fps").expect("fps regex pattern is invalid"));

fn get_out_time_re() -> &'static Regex {
    &OUT_TIME_RE
}

fn get_duration_re() -> &'static Regex {
    &DURATION_RE
}

fn get_dimension_re() -> &'static Regex {
    &DIMENSION_RE
}

fn get_fps_re() -> &'static Regex {
    &FPS_RE
}

fn parse_duration_to_seconds(duration: &str) -> Option<f64> {
    let mut parts = duration.split(':');
    let hours = parts.next()?.trim().parse::<f64>().ok()?;
    let minutes = parts.next()?.trim().parse::<f64>().ok()?;
    let seconds = parts.next()?.trim().parse::<f64>().ok()?;
    Some((hours * 3600.0) + (minutes * 60.0) + seconds)
}

pub struct FFMPEG {
    app: AppHandle,
    ffmpeg: Command,
    assets_dir: PathBuf,
}

const EXTENSIONS: [&str; 5] = ["mp4", "mov", "webm", "avi", "mkv"];

type VideoInfoTaskResult = (u8, Option<String>, Option<(u32, u32)>, Option<f32>);

impl FFMPEG {
    pub fn new(app: &tauri::AppHandle) -> Result<Self, String> {
        match app.shell().sidecar("compresso_ffmpeg") {
            Ok(command) => {
                let app_data_dir = match app.path().app_data_dir() {
                    Ok(path_buf) => path_buf,
                    Err(_) => {
                        return Err(String::from(
                            "Application app directory is not setup correctly.",
                        ));
                    }
                };
                let assets_dir: PathBuf = [PathBuf::from(&app_data_dir), PathBuf::from("assets")]
                    .iter()
                    .collect();

                Ok(Self {
                    app: app.to_owned(),
                    ffmpeg: Command::from(command),
                    assets_dir,
                })
            }
            Err(err) => Err(format!("[ffmpeg-sidecar]: {:?}", err.to_string())),
        }
    }

    /// Compresses a video from a path
    #[allow(clippy::too_many_arguments)]
    pub async fn compress_video(
        &mut self,
        video_path: &str,
        convert_to_extension: &str,
        preset_name: Option<&str>,
        video_id: Option<&str>,
        should_mute_video: bool,
        quality: u16,
        dimensions: Option<(u32, u32)>,
        fps: Option<&str>,
        transforms_history: Option<&Vec<Value>>,
    ) -> Result<CompressionResult, String> {
        if !EXTENSIONS.contains(&convert_to_extension) {
            return Err(String::from("Invalid convert to extension."));
        }

        let id = match video_id {
            Some(id) => String::from(id),
            None => nanoid!(),
        };
        let id_clone1 = id.clone();
        let id_clone2 = id.clone();

        let file_name = format!("{}.{}", id, convert_to_extension);
        let file_name_clone = file_name.clone();

        let output_file: PathBuf = [self.assets_dir.clone(), PathBuf::from(&file_name)]
            .iter()
            .collect();

        let output_path = &output_file.display().to_string();

        let max_crf: u16 = 36;
        let min_crf: u16 = 24; // Lower the CRF, higher the quality
        let default_crf: u16 = 28;
        let compression_quality = if (0..=100).contains(&quality) {
            let diff = (max_crf - min_crf) - ((max_crf - min_crf) * quality) / 100;
            format!("{}", min_crf + diff)
        } else {
            format!("{default_crf}")
        };
        let compression_quality_str = compression_quality.as_str();

        let codec = "libx264";

        let mut preset = match preset_name {
            Some(preset) => match preset {
                "thunderbolt" => {
                    let args = vec![
                        "-i",
                        &video_path,
                        "-hide_banner",
                        "-progress",
                        "-",
                        "-nostats",
                        "-loglevel",
                        "error",
                        "-c:v",
                        codec,
                        "-crf",
                        compression_quality_str,
                    ];
                    args
                }
                _ => {
                    let args = vec![
                        "-i",
                        &video_path,
                        "-hide_banner",
                        "-progress",
                        "-",
                        "-nostats",
                        "-loglevel",
                        "error",
                        "-pix_fmt",
                        "yuv420p",
                        "-c:v",
                        codec,
                        "-b:v",
                        "0",
                        "-movflags",
                        "+faststart",
                        "-preset",
                        "slow",
                        "-qp",
                        "0",
                        "-crf",
                        compression_quality_str,
                    ];
                    args
                }
            },
            None => {
                let args = vec![
                    "-i",
                    &video_path,
                    "-hide_banner",
                    "-progress",
                    "-",
                    "-nostats",
                    "-loglevel",
                    "error",
                    "-c:v",
                    codec,
                    "-crf",
                    compression_quality_str,
                ];
                args
            }
        };
        // Transforms
        let transform_filters = if let Some(transforms) = transforms_history {
            self.build_ffmpeg_filters(transforms)
        } else {
            String::from("")
        };

        // Dimensions
        let padding = "pad=ceil(iw/2)*2:ceil(ih/2)*2";
        let pad_filter = if let Some((width, height)) = dimensions {
            format!("scale={}:{},{}", width, height, padding)
        } else {
            padding.to_string()
        };

        let mut vf_filter = String::new();

        if !transform_filters.is_empty() {
            vf_filter.push_str(&transform_filters);
            vf_filter.push(',')
        }

        vf_filter.push_str(&pad_filter);

        println!(">>>>>Final vf filter {}", vf_filter);

        preset.push("-vf");
        preset.push(&vf_filter);

        // FPS
        if let Some(fps_val) = fps {
            preset.push("-r");
            preset.push(fps_val);
        }

        // Webm
        if convert_to_extension == "webm" {
            preset.push("-c:v");
            preset.push("libvpx-vp9");
        }

        // Mute Audio
        if should_mute_video {
            preset.push("-an")
        }

        preset.push(output_path);
        preset.push("-y");

        let command = self
            .ffmpeg
            .args(preset)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        match SharedChild::spawn(command) {
            Ok(child) => {
                let cp = Arc::new(child);
                #[cfg(debug_assertions)]
                let cp_clone1 = cp.clone();
                let cp_clone2 = cp.clone();
                let cp_clone3 = cp.clone();
                let cp_clone4 = cp.clone();

                let window = match self.app.get_webview_window("main") {
                    Some(window) => window,
                    None => return Err(String::from("Could not attach to main window")),
                };
                let destroy_event_id = if let Some(event_key) = TauriEvents::Destroyed.get_str("key") {
                    Some(window.listen(event_key, move |_| {
                        log::info!("[tauri] window destroyed");
                        match cp.kill() {
                            Ok(_) => {
                                log::info!("child process killed.");
                            }
                            Err(err) => {
                                log::error!(
                                    "child process could not be killed {}",
                                    err.to_string()
                                );
                            }
                        }
                    }))
                } else {
                    log::error!("TauriEvents::Destroyed missing 'key' property");
                    None
                };

                let should_cancel = Arc::new(Mutex::new(false));
                let should_cancel_clone = Arc::clone(&should_cancel);

                let cancel_event_id = window.listen(
                    CustomEvents::CancelInProgressCompression.as_ref(),
                    move |evt| {
                        let payload_str = evt.payload();
                        let payload_opt: Option<CancelInProgressCompressionPayload> =
                            serde_json::from_str(payload_str).ok();
                        if let Some(payload) = payload_opt {
                            let video_id = id_clone2.as_str();
                            if payload.video_id == video_id {
                                log::info!("compression requested to cancel.");
                                match cp_clone4.kill() {
                                    Ok(_) => {
                                        log::info!("child process killed.");
                                    }
                                    Err(err) => {
                                        log::error!(
                                            "child process could not be killed {}",
                                            err.to_string()
                                        );
                                    }
                                };
                                if let Ok(mut guard) = should_cancel_clone.lock() {
                                    *guard = true;
                                } else {
                                    log::error!("Failed to acquire should_cancel mutex lock");
                                }
                            }
                        }
                    },
                );

                #[cfg(debug_assertions)]
                tokio::spawn(async move {
                    if let Some(stderr) = cp_clone1.take_stderr() {
                        let mut reader = BufReader::new(stderr);

                        loop {
                            let mut buf: Vec<u8> = Vec::new();
                            match tauri::utils::io::read_line(&mut reader, &mut buf) {
                                Ok(n) => {
                                    if n == 0 {
                                        break;
                                    }
                                    if let Ok(val) = std::str::from_utf8(&buf) {
                                        log::debug!("stderr: {:?}", val);
                                    }
                                }
                                Err(_) => {
                                    break;
                                }
                            }
                        }
                    }
                });

                let (tx, rx): (Sender<String>, Receiver<String>) = crossbeam_channel::unbounded();

                let thread: tokio::task::JoinHandle<u8> = tokio::spawn(async move {
                    if let Some(stdout) = cp_clone2.take_stdout() {
                        let mut reader = BufReader::new(stdout);
                        let out_time_re = get_out_time_re();
                        loop {
                            let mut buf: Vec<u8> = Vec::new();
                            match tauri::utils::io::read_line(&mut reader, &mut buf) {
                                Ok(n) => {
                                    if n == 0 {
                                        break;
                                    }
                                    if let Ok(output) = std::str::from_utf8(&buf) {
                                        log::debug!("stdout: {:?}", output);
                                        if let Some(cap) = out_time_re.captures(output) {
                                            let out_time = &cap["out_time"];
                                            if !out_time.is_empty() {
                                                tx.try_send(String::from(out_time)).ok();
                                            }
                                        }
                                    }
                                }
                                Err(_) => {
                                    break;
                                }
                            }
                        }
                    }

                    if cp_clone2.wait().is_ok() {
                        return 0;
                    }
                    1
                });

                let app_clone = self.app.clone();
                tokio::spawn(async move {
                    let file_name_clone_str = file_name_clone.as_str();
                    let id_clone_str = id_clone1.as_str();

                    while let Ok(current_duration) = rx.recv() {
                        let video_progress = VideoCompressionProgress {
                            video_id: String::from(id_clone_str),
                            file_name: String::from(file_name_clone_str),
                            current_duration,
                        };
                        if let Some(window) = app_clone.get_webview_window("main") {
                            window
                                .emit(
                                    CustomEvents::VideoCompressionProgress.as_ref(),
                                    video_progress,
                                )
                                .ok();
                        }
                    }
                });

                let message: String = match thread.await {
                    Ok(exit_status) => {
                        if exit_status == 1 {
                            String::from("Video is corrupted.")
                        } else {
                            String::from("")
                        }
                    }
                    Err(err) => err.to_string(),
                };

                // Cleanup
                if let Some(event_id) = destroy_event_id {
                    window.unlisten(event_id);
                }
                window.unlisten(cancel_event_id);
                match cp_clone3.kill() {
                    Ok(_) => {
                        log::info!("child process killed.");
                    }
                    Err(err) => {
                        log::error!("child process could not be killed {}", err.to_string());
                    }
                }

                let is_cancelled = if let Ok(guard) = should_cancel.lock() {
                    *guard
                } else {
                    log::error!("Failed to acquire should_cancel mutex lock");
                    false
                };
                if is_cancelled {
                    return Err(String::from("CANCELLED"));
                }

                if !message.is_empty() {
                    return Err(message);
                }
            }
            Err(err) => {
                return Err(err.to_string());
            }
        };

        Ok(CompressionResult {
            file_name,
            file_path: output_file.display().to_string(),
        })
    }

    /// Generates a .jpeg thumbnail image from a video path
    pub async fn generate_video_thumbnail(
        &mut self,
        video_path: &str,
    ) -> Result<VideoThumbnail, String> {
        if !Path::exists(Path::new(video_path)) {
            return Err(String::from("File does not exist in given path."));
        }
        let id = nanoid!();
        let file_name = format!("{}.jpg", id);
        let output_path: PathBuf = [self.assets_dir.clone(), PathBuf::from(&file_name)]
            .iter()
            .collect();

        let command = self.ffmpeg.args([
            "-i",
            video_path,
            "-ss",
            "00:00:01.00",
            "-vframes",
            "1",
            &output_path.display().to_string(),
            "-y",
        ]);

        match SharedChild::spawn(command) {
            Ok(child) => {
                let cp = Arc::new(child);
                let cp_clone1 = cp.clone();
                let cp_clone2 = cp.clone();

                let window = match self.app.get_webview_window("main") {
                    Some(window) => window,
                    None => return Err(String::from("Could not attach to main window")),
                };
                let destroy_event_id = if let Some(event_key) = TauriEvents::Destroyed.get_str("key") {
                    Some(window.listen(event_key, move |_| match cp.kill() {
                        Ok(_) => {
                            log::info!("child process killed.");
                        }
                        Err(err) => {
                            log::error!("child process could not be killed {}", err.to_string());
                        }
                    }))
                } else {
                    log::error!("TauriEvents::Destroyed missing 'key' property");
                    None
                };

                let thread: tokio::task::JoinHandle<u8> = tokio::spawn(async move {
                    if cp_clone1.wait().is_ok() {
                        return 0;
                    }
                    1
                });

                let message: String = match thread.await {
                    Ok(exit_status) => {
                        if exit_status == 1 {
                            String::from("Video is corrupted.")
                        } else {
                            String::from("")
                        }
                    }
                    Err(err) => err.to_string(),
                };

                // Cleanup
                if let Some(event_id) = destroy_event_id {
                    window.unlisten(event_id);
                }
                match cp_clone2.kill() {
                    Ok(_) => {
                        log::info!("child process killed.");
                    }
                    Err(err) => {
                        log::error!("child process could not be killed {}", err.to_string());
                    }
                }
                if !message.is_empty() {
                    return Err(message);
                }
            }
            Err(err) => return Err(err.to_string()),
        };
        Ok(VideoThumbnail {
            id,
            file_name,
            file_path: output_path.display().to_string(),
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn generate_quality_preview(
        &mut self,
        video_path: &str,
        convert_to_extension: &str,
        preset_name: Option<&str>,
        should_mute_video: bool,
        quality: u16,
        dimensions: Option<(u32, u32)>,
        fps: Option<&str>,
        transforms_history: Option<&Vec<Value>>,
        preview_seconds: Option<u16>,
    ) -> Result<QualityPreviewResult, String> {
        if !Path::exists(Path::new(video_path)) {
            return Err(String::from("File does not exist in given path."));
        }

        if !EXTENSIONS.contains(&convert_to_extension) {
            return Err(String::from("Invalid convert to extension."));
        }

        let preview_seconds_value = preview_seconds.unwrap_or(20).clamp(1, 120);
        let preview_duration_arg = preview_seconds_value.to_string();
        let preview_duration_f64 = f64::from(preview_seconds_value);

        let middle_seek_seconds = self
            .get_video_info(video_path)
            .await
            .ok()
            .and_then(|info| info.duration)
            .and_then(|duration| parse_duration_to_seconds(duration.as_str()))
            .map(|total_seconds| {
                if total_seconds > preview_duration_f64 {
                    ((total_seconds / 2.0) - (preview_duration_f64 / 2.0)).max(0.0)
                } else {
                    0.0
                }
            })
            .unwrap_or(0.0);
        let seek_arg = format!("{middle_seek_seconds:.3}");

        let id = nanoid!();

        let source_file_name = format!("{}-preview-source.mp4", id);
        let compressed_preview_extension = if convert_to_extension == "webm" {
            "webm"
        } else {
            "mp4"
        };
        let compressed_file_name = format!(
            "{}-preview-compressed.{}",
            id, compressed_preview_extension
        );

        let source_output: PathBuf = [self.assets_dir.clone(), PathBuf::from(&source_file_name)]
            .iter()
            .collect();
        let compressed_output: PathBuf =
            [self.assets_dir.clone(), PathBuf::from(&compressed_file_name)]
                .iter()
                .collect();

        let max_crf: u16 = 36;
        let min_crf: u16 = 24;
        let default_crf: u16 = 28;
        let compression_quality = if (0..=100).contains(&quality) {
            let diff = (max_crf - min_crf) - ((max_crf - min_crf) * quality) / 100;
            format!("{}", min_crf + diff)
        } else {
            format!("{default_crf}")
        };

        let transform_filters = if let Some(transforms) = transforms_history {
            self.build_ffmpeg_filters(transforms)
        } else {
            String::from("")
        };

        let padding = "pad=ceil(iw/2)*2:ceil(ih/2)*2";
        let pad_filter = if let Some((width, height)) = dimensions {
            format!("scale={}:{},{}", width, height, padding)
        } else {
            padding.to_string()
        };

        let mut vf_filter = String::new();
        if !transform_filters.is_empty() {
            vf_filter.push_str(&transform_filters);
            vf_filter.push(',');
        }
        vf_filter.push_str(&pad_filter);

        let mut source_args: Vec<String> = vec![
            String::from("-i"),
            String::from(video_path),
            String::from("-hide_banner"),
            String::from("-nostats"),
            String::from("-loglevel"),
            String::from("error"),
            String::from("-ss"),
            seek_arg.clone(),
            String::from("-t"),
            preview_duration_arg.clone(),
            String::from("-pix_fmt"),
            String::from("yuv420p"),
            String::from("-c:v"),
            String::from("libx264"),
            String::from("-preset"),
            String::from("veryfast"),
            String::from("-crf"),
            String::from("18"),
            String::from("-movflags"),
            String::from("+faststart"),
            String::from("-vf"),
            vf_filter.clone(),
        ];
        if let Some(fps_val) = fps {
            source_args.push(String::from("-r"));
            source_args.push(String::from(fps_val));
        }
        source_args.push(String::from("-an"));
        source_args.push(source_output.display().to_string());
        source_args.push(String::from("-y"));

        let mut source_command = Command::from(
            self.app
                .shell()
                .sidecar("compresso_ffmpeg")
                .map_err(|err| format!("[ffmpeg-sidecar]: {:?}", err))?,
        );
        source_command.args(source_args);
        let source_status = source_command.status().map_err(|err| err.to_string())?;
        if !source_status.success() {
            let _ = std::fs::remove_file(&source_output);
            return Err(String::from("Could not generate source preview."));
        }

        let mut compressed_args: Vec<String> = match preset_name {
            Some("thunderbolt") => vec![
                String::from("-i"),
                String::from(video_path),
                String::from("-hide_banner"),
                String::from("-nostats"),
                String::from("-loglevel"),
                String::from("error"),
                String::from("-ss"),
                seek_arg.clone(),
                String::from("-t"),
                preview_duration_arg.clone(),
                String::from("-c:v"),
                String::from("libx264"),
                String::from("-crf"),
                compression_quality.clone(),
            ],
            Some(_) => vec![
                String::from("-i"),
                String::from(video_path),
                String::from("-hide_banner"),
                String::from("-nostats"),
                String::from("-loglevel"),
                String::from("error"),
                String::from("-ss"),
                seek_arg.clone(),
                String::from("-t"),
                preview_duration_arg.clone(),
                String::from("-pix_fmt"),
                String::from("yuv420p"),
                String::from("-c:v"),
                String::from("libx264"),
                String::from("-b:v"),
                String::from("0"),
                String::from("-movflags"),
                String::from("+faststart"),
                String::from("-preset"),
                String::from("slow"),
                String::from("-qp"),
                String::from("0"),
                String::from("-crf"),
                compression_quality.clone(),
            ],
            None => vec![
                String::from("-i"),
                String::from(video_path),
                String::from("-hide_banner"),
                String::from("-nostats"),
                String::from("-loglevel"),
                String::from("error"),
                String::from("-ss"),
                seek_arg,
                String::from("-t"),
                preview_duration_arg,
                String::from("-c:v"),
                String::from("libx264"),
                String::from("-crf"),
                compression_quality.clone(),
            ],
        };

        compressed_args.push(String::from("-vf"));
        compressed_args.push(vf_filter);

        if let Some(fps_val) = fps {
            compressed_args.push(String::from("-r"));
            compressed_args.push(String::from(fps_val));
        }

        if compressed_preview_extension == "webm" {
            compressed_args.push(String::from("-c:v"));
            compressed_args.push(String::from("libvpx-vp9"));
        }

        if should_mute_video {
            compressed_args.push(String::from("-an"));
        }

        compressed_args.push(compressed_output.display().to_string());
        compressed_args.push(String::from("-y"));

        let mut compressed_command = Command::from(
            self.app
                .shell()
                .sidecar("compresso_ffmpeg")
                .map_err(|err| format!("[ffmpeg-sidecar]: {:?}", err))?,
        );
        compressed_command.args(compressed_args);
        let compressed_status = compressed_command
            .status()
            .map_err(|err| err.to_string())?;
        if !compressed_status.success() {
            let _ = std::fs::remove_file(&source_output);
            let _ = std::fs::remove_file(&compressed_output);
            return Err(String::from("Could not generate compressed preview."));
        }

        Ok(QualityPreviewResult {
            source_file_name,
            source_file_path: source_output.display().to_string(),
            compressed_file_name,
            compressed_file_path: compressed_output.display().to_string(),
        })
    }

    pub fn get_asset_dir(&self) -> String {
        self.assets_dir.display().to_string()
    }

    pub async fn get_video_info(&mut self, video_path: &str) -> Result<VideoInfo, String> {
        if !Path::exists(Path::new(video_path)) {
            return Err(String::from("File does not exist in given path."));
        }

        let command = self
            .ffmpeg
            .args(["-i", video_path, "-hide_banner"])
            .stderr(Stdio::piped()); // Capture stderr for metadata parsing

        match SharedChild::spawn(command) {
            Ok(child) => {
                let cp = Arc::new(child);
                let cp_clone1 = cp.clone();
                let cp_clone2 = cp.clone();

                let window = match self.app.get_webview_window("main") {
                    Some(window) => window,
                    None => return Err(String::from("Could not attach to main window")),
                };

                let destroy_event_id = if let Some(event_key) = TauriEvents::Destroyed.get_str("key") {
                    Some(window.listen(event_key, move |_| match cp.kill() {
                        Ok(_) => log::info!("child process killed."),
                        Err(err) => log::error!("child process could not be killed {}", err),
                    }))
                } else {
                    log::error!("TauriEvents::Destroyed missing 'key' property");
                    None
                };

                let thread: tokio::task::JoinHandle<VideoInfoTaskResult> =
                    tokio::task::spawn(async move {
                    let mut duration: Option<String> = None;
                    let mut dimensions: Option<(u32, u32)> = None;
                    let mut fps: Option<f32> = None;

                    if let Some(stderr) = cp_clone1.take_stderr() {
                        let reader = BufReader::new(stderr);
                        let duration_re = get_duration_re();
                        let dimension_re = get_dimension_re();
                        let fps_re = get_fps_re();

                        for line_res in reader.lines() {
                            if let Ok(line) = line_res {
                                if duration.is_none() {
                                    if let Some(cap) = duration_re.captures(&line) {
                                        duration = Some(cap["duration"].to_string());
                                    }
                                }
                                if dimensions.is_none() {
                                    if let Some(cap) = dimension_re.captures(&line) {
                                        if let (Ok(w), Ok(h)) = (
                                            cap["width"].parse::<u32>(),
                                            cap["height"].parse::<u32>(),
                                        ) {
                                            dimensions = Some((w, h));
                                        }
                                    }
                                }
                                if fps.is_none() {
                                    if let Some(cap) = fps_re.captures(&line) {
                                        if let Ok(parsed_fps) = cap["fps"].parse::<f32>() {
                                            fps = Some(parsed_fps);
                                        }
                                    }
                                }
                                if duration.is_some() && dimensions.is_some() && fps.is_some() {
                                    break;
                                }
                            } else {
                                break;
                            }
                        }
                    }

                    if cp_clone1.wait().is_ok() {
                        (0, duration, dimensions, fps)
                    } else {
                        (1, duration, dimensions, fps)
                    }
                });

                let result = match thread.await {
                    Ok((exit_status, duration, dimensions, fps)) => {
                        if exit_status == 1 {
                            Err("Video file is corrupted".to_string())
                        } else {
                            Ok(VideoInfo {
                                duration,
                                dimensions,
                                fps,
                            })
                        }
                    }
                    Err(err) => Err(err.to_string()),
                };

                // Cleanup
                if let Some(event_id) = destroy_event_id {
                    window.unlisten(event_id);
                }
                if let Err(err) = cp_clone2.kill() {
                    log::error!("child process could not be killed {}", err);
                }

                result
            }
            Err(err) => Err(err.to_string()),
        }
    }

    fn build_ffmpeg_filters(&self, actions: &Vec<Value>) -> String {
        let mut filters: Vec<String> = Vec::new();
        let mut latest_crop: Option<&Value> = None;

        for action in actions {
            let action_type = action["type"].as_str().unwrap_or("");

            match action_type {
                "rotate" => {
                    let angle = action["value"].as_i64().unwrap_or(0);
                    match angle % 360 {
                        -90 | 270 => filters.push("transpose=2".to_string()),
                        90 | -270 => filters.push("transpose=1".to_string()),
                        180 | -180 => filters.push("hflip,vflip".to_string()),
                        _ => {}
                    }
                }
                "flip" => {
                    if let Some(flip_obj) = action["value"].as_object() {
                        if flip_obj.get("horizontal").and_then(|v| v.as_bool()) == Some(true) {
                            filters.push("hflip".to_string());
                        }
                        if flip_obj.get("vertical").and_then(|v| v.as_bool()) == Some(true) {
                            filters.push("vflip".to_string());
                        }
                    }
                }
                "crop" => {
                    latest_crop = Some(&action["value"]);
                }
                _ => {}
            }
        }

        // Apply only the last crop
        if let Some(c) = latest_crop {
            let w = c["width"].as_f64().unwrap_or(0.0).round() as i64;
            let h = c["height"].as_f64().unwrap_or(0.0).round() as i64;
            let x = c["left"].as_f64().unwrap_or(0.0).round() as i64;
            let y = c["top"].as_f64().unwrap_or(0.0).round() as i64;

            filters.push(format!("crop={}:{}:{}:{}", w, h, x, y));
        }

        filters.join(",")
    }
}
