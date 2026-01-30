use dialoguer::{theme::ColorfulTheme, Confirm, Input, MultiSelect, Select};
use indicatif::{ProgressBar, ProgressStyle};
use regex::Regex;
use std::{
    env,
    ffi::OsStr,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
};
use walkdir::WalkDir;

const EXTENSIONS: [&str; 5] = ["mp4", "mov", "webm", "avi", "mkv"];

#[derive(Clone, Copy, Debug)]
enum ConflictPolicy {
    Overwrite,
    Skip,
    AutoRename,
}

#[derive(Clone, Debug)]
struct Settings {
    output_dir: PathBuf,
    output_format: OutputFormat,
    preset: Preset,
    quality: u16,
    fps: Option<u32>,
    dimensions: Option<(u32, u32)>,
    mute_audio: bool,
    conflict_policy: ConflictPolicy,
}

#[derive(Clone, Copy, Debug)]
enum OutputFormat {
    SameAsSource,
    Fixed(&'static str),
}

#[derive(Clone, Copy, Debug)]
enum Preset {
    Default,
    Thunderbolt,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("Error: {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let theme = ColorfulTheme::default();

    let ffmpeg_path = resolve_ffmpeg_path()?;
    println!("Using ffmpeg: {}", ffmpeg_path.display());

    let input_mode = Select::with_theme(&theme)
        .with_prompt("Choose input mode")
        .items(&["Batch convert all videos in a folder", "Pick specific videos"])
        .default(0)
        .interact()
        .map_err(|e| e.to_string())?;

    let input_dir = prompt_dir(&theme, "Input folder")?;
    let recursive = if input_mode == 0 {
        Confirm::with_theme(&theme)
            .with_prompt("Scan subfolders recursively?")
            .default(true)
            .interact()
            .map_err(|e| e.to_string())?
    } else {
        false
    };

    let mut files = collect_video_files(&input_dir, recursive)?;
    if files.is_empty() {
        return Err("No supported video files found.".to_string());
    }

    if input_mode == 1 {
        let selections = prompt_file_selection(&theme, &input_dir, &files)?;
        files = selections;
        if files.is_empty() {
            return Err("No files selected.".to_string());
        }
    }

    let output_dir = prompt_output_dir(&theme, &input_dir)?;

    let output_format = prompt_output_format(&theme)?;

    let preset = prompt_preset(&theme)?;

    let quality = prompt_quality(&theme)?;

    let fps = prompt_fps(&theme)?;

    let dimensions = prompt_dimensions(&theme)?;

    let mute_audio = Confirm::with_theme(&theme)
        .with_prompt("Mute audio?")
        .default(false)
        .interact()
        .map_err(|e| e.to_string())?;

    let conflict_policy = prompt_conflict_policy(&theme)?;

    let settings = Settings {
        output_dir,
        output_format,
        preset,
        quality,
        fps,
        dimensions,
        mute_audio,
        conflict_policy,
    };

    print_summary(&settings, files.len());

    let proceed = Confirm::with_theme(&theme)
        .with_prompt("Start batch conversion?")
        .default(true)
        .interact()
        .map_err(|e| e.to_string())?;

    if !proceed {
        return Ok(());
    }

    let mut succeeded = 0u32;
    let mut failed = 0u32;
    let mut skipped = 0u32;

    for (index, input_path) in files.iter().enumerate() {
        println!(
            "\nProcessing {}/{}: {}",
            index + 1,
            files.len(),
            input_path.display()
        );

        let output_path = match build_output_path(input_path, &settings) {
            Ok(path) => path,
            Err(ConflictPolicy::Skip) => {
                println!("Skipped (output exists).");
                skipped += 1;
                continue;
            }
            Err(_) => {
                failed += 1;
                println!("Failed to resolve output path.");
                continue;
            }
        };

        match convert_file(&ffmpeg_path, input_path, &output_path, &settings) {
            Ok(()) => {
                succeeded += 1;
                println!("Saved to {}", output_path.display());
            }
            Err(err) => {
                failed += 1;
                println!("Failed: {err}");
            }
        }
    }

    println!(
        "\nDone. Succeeded: {succeeded}, Failed: {failed}, Skipped: {skipped}",
    );

    Ok(())
}

fn prompt_dir(theme: &ColorfulTheme, label: &str) -> Result<PathBuf, String> {
    let input: String = Input::with_theme(theme)
        .with_prompt(label)
        .interact_text()
        .map_err(|e| e.to_string())?;
    let path = PathBuf::from(input.trim());
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    Ok(path)
}

fn prompt_output_dir(theme: &ColorfulTheme, default_dir: &Path) -> Result<PathBuf, String> {
    let default_str = default_dir.display().to_string();
    let input: String = Input::with_theme(theme)
        .with_prompt("Output folder")
        .default(default_str)
        .interact_text()
        .map_err(|e| e.to_string())?;
    let path = PathBuf::from(input.trim());
    if !path.exists() {
        let create = Confirm::with_theme(theme)
            .with_prompt("Output folder does not exist. Create it?")
            .default(true)
            .interact()
            .map_err(|e| e.to_string())?;
        if create {
            fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        } else {
            return Err("Output folder is required.".to_string());
        }
    }
    Ok(path)
}

fn prompt_output_format(theme: &ColorfulTheme) -> Result<OutputFormat, String> {
    let options = [
        "Same as source",
        "mp4",
        "mov",
        "webm",
        "avi",
        "mkv",
    ];
    let selection = Select::with_theme(theme)
        .with_prompt("Output format")
        .items(&options)
        .default(0)
        .interact()
        .map_err(|e| e.to_string())?;
    let format = match selection {
        0 => OutputFormat::SameAsSource,
        1 => OutputFormat::Fixed("mp4"),
        2 => OutputFormat::Fixed("mov"),
        3 => OutputFormat::Fixed("webm"),
        4 => OutputFormat::Fixed("avi"),
        _ => OutputFormat::Fixed("mkv"),
    };
    Ok(format)
}

fn prompt_preset(theme: &ColorfulTheme) -> Result<Preset, String> {
    let options = ["Default (slow)", "Thunderbolt (fast)"];
    let selection = Select::with_theme(theme)
        .with_prompt("Preset")
        .items(&options)
        .default(0)
        .interact()
        .map_err(|e| e.to_string())?;
    Ok(if selection == 0 {
        Preset::Default
    } else {
        Preset::Thunderbolt
    })
}

fn prompt_quality(theme: &ColorfulTheme) -> Result<u16, String> {
    let quality: u16 = Input::with_theme(theme)
        .with_prompt("Quality (0-100, higher is better)")
        .default(70)
        .interact_text()
        .map_err(|e| e.to_string())?;
    if quality > 100 {
        return Err("Quality must be between 0 and 100.".to_string());
    }
    Ok(quality)
}

fn prompt_fps(theme: &ColorfulTheme) -> Result<Option<u32>, String> {
    let input: String = Input::with_theme(theme)
        .with_prompt("FPS (blank to keep original)")
        .allow_empty(true)
        .interact_text()
        .map_err(|e| e.to_string())?;
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let fps = trimmed
        .parse::<u32>()
        .map_err(|_| "FPS must be a number.".to_string())?;
    Ok(Some(fps))
}

fn prompt_dimensions(theme: &ColorfulTheme) -> Result<Option<(u32, u32)>, String> {
    let resize = Confirm::with_theme(theme)
        .with_prompt("Resize video?")
        .default(false)
        .interact()
        .map_err(|e| e.to_string())?;
    if !resize {
        return Ok(None);
    }
    let width: u32 = Input::with_theme(theme)
        .with_prompt("Width")
        .interact_text()
        .map_err(|e| e.to_string())?;
    let height: u32 = Input::with_theme(theme)
        .with_prompt("Height")
        .interact_text()
        .map_err(|e| e.to_string())?;
    Ok(Some((width, height)))
}

fn prompt_conflict_policy(theme: &ColorfulTheme) -> Result<ConflictPolicy, String> {
    let options = ["Overwrite", "Skip", "Auto-rename"];
    let selection = Select::with_theme(theme)
        .with_prompt("If output file exists")
        .items(&options)
        .default(2)
        .interact()
        .map_err(|e| e.to_string())?;
    let policy = match selection {
        0 => ConflictPolicy::Overwrite,
        1 => ConflictPolicy::Skip,
        _ => ConflictPolicy::AutoRename,
    };
    Ok(policy)
}

fn prompt_file_selection(
    theme: &ColorfulTheme,
    base_dir: &Path,
    files: &[PathBuf],
) -> Result<Vec<PathBuf>, String> {
    let items: Vec<String> = files
        .iter()
        .map(|path| {
            path.strip_prefix(base_dir)
                .unwrap_or(path)
                .display()
                .to_string()
        })
        .collect();

    let selections = MultiSelect::with_theme(theme)
        .with_prompt("Select videos")
        .items(&items)
        .interact()
        .map_err(|e| e.to_string())?;

    let mut selected = Vec::new();
    for index in selections {
        if let Some(path) = files.get(index) {
            selected.push(path.clone());
        }
    }
    Ok(selected)
}

fn collect_video_files(base_dir: &Path, recursive: bool) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();

    if recursive {
        for entry in WalkDir::new(base_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let path = entry.path();
                if is_video_file(path) {
                    files.push(path.to_path_buf());
                }
            }
        }
    } else {
        for entry in fs::read_dir(base_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() && is_video_file(&path) {
                files.push(path);
            }
        }
    }

    files.sort();
    Ok(files)
}

fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|ext| EXTENSIONS.iter().any(|val| val.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}

fn build_output_path(input_path: &Path, settings: &Settings) -> Result<PathBuf, ConflictPolicy> {
    let output_ext = match settings.output_format {
        OutputFormat::SameAsSource => input_path
            .extension()
            .and_then(OsStr::to_str)
            .unwrap_or("mp4"),
        OutputFormat::Fixed(ext) => ext,
    };

    let stem = input_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("output");

    let base_name = format!("{stem}_compressed.{output_ext}");
    let mut candidate = settings.output_dir.join(base_name);

    if !candidate.exists() {
        return Ok(candidate);
    }

    match settings.conflict_policy {
        ConflictPolicy::Overwrite => Ok(candidate),
        ConflictPolicy::Skip => Err(ConflictPolicy::Skip),
        ConflictPolicy::AutoRename => {
            let mut index = 1u32;
            loop {
                let name = format!("{stem}_compressed_{index}.{output_ext}");
                candidate = settings.output_dir.join(name);
                if !candidate.exists() {
                    return Ok(candidate);
                }
                index += 1;
            }
        }
    }
}

fn convert_file(
    ffmpeg_path: &Path,
    input_path: &Path,
    output_path: &Path,
    settings: &Settings,
) -> Result<(), String> {
    let total_us = probe_duration_us(ffmpeg_path, input_path).ok().flatten();
    let progress = match total_us {
        Some(total) => {
            let pb = ProgressBar::new(total);
            pb.set_style(
                ProgressStyle::with_template(
                    "{spinner} [{elapsed_precise}] {bar:40.cyan/blue} {percent}% {msg}",
                )
                .map_err(|e| e.to_string())?,
            );
            pb
        }
        None => {
            let pb = ProgressBar::new_spinner();
            pb.enable_steady_tick(Duration::from_millis(120));
            pb
        }
    };

    let message = input_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    progress.set_message(message);

    let mut args = build_ffmpeg_args(input_path, output_path, settings);

    let mut child = Command::new(ffmpeg_path)
        .args(&mut args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to read ffmpeg output")?;
    let stderr = child.stderr.take().ok_or("Failed to read ffmpeg error")?;

    let stderr_handle = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut buffer = String::new();
        for line in reader.lines().map_while(Result::ok) {
            buffer.push_str(&line);
            buffer.push('\n');
        }
        buffer
    });

    let stdout_reader = BufReader::new(stdout);
    for line in stdout_reader.lines().map_while(Result::ok) {
        if let Some(out_time) = parse_out_time_us(&line) {
            if let Some(total) = total_us {
                progress.set_position(out_time.min(total));
            }
        }
        if line.starts_with("progress=end") {
            if let Some(total) = total_us {
                progress.set_position(total);
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr_output = stderr_handle.join().unwrap_or_default();

    progress.finish_and_clear();

    if status.success() {
        Ok(())
    } else {
        Err(stderr_output.trim().to_string())
    }
}

fn build_ffmpeg_args(input_path: &Path, output_path: &Path, settings: &Settings) -> Vec<String> {
    let mut args = vec![
        "-i".to_string(),
        input_path.display().to_string(),
        "-hide_banner".to_string(),
        "-progress".to_string(),
        "-".to_string(),
        "-nostats".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
    ];

    let mut codec = "libx264".to_string();
    let output_ext = match settings.output_format {
        OutputFormat::SameAsSource => output_path
            .extension()
            .and_then(OsStr::to_str)
            .unwrap_or("mp4"),
        OutputFormat::Fixed(ext) => ext,
    };

    if output_ext.eq_ignore_ascii_case("webm") {
        codec = "libvpx-vp9".to_string();
    }

    let crf = quality_to_crf(settings.quality);

    match settings.preset {
        Preset::Thunderbolt => {
            args.push("-c:v".to_string());
            args.push(codec.clone());
            args.push("-crf".to_string());
            args.push(crf.to_string());
        }
        Preset::Default => {
            args.extend([
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
                "-c:v".to_string(),
                codec.clone(),
                "-b:v".to_string(),
                "0".to_string(),
                "-movflags".to_string(),
                "+faststart".to_string(),
                "-preset".to_string(),
                "slow".to_string(),
                "-qp".to_string(),
                "0".to_string(),
                "-crf".to_string(),
                crf.to_string(),
            ]);
        }
    }

    let padding = "pad=ceil(iw/2)*2:ceil(ih/2)*2".to_string();
    let vf_filter = if let Some((width, height)) = settings.dimensions {
        format!("scale={width}:{height},{padding}")
    } else {
        padding
    };

    args.push("-vf".to_string());
    args.push(vf_filter);

    if let Some(fps) = settings.fps {
        args.push("-r".to_string());
        args.push(fps.to_string());
    }

    if settings.mute_audio {
        args.push("-an".to_string());
    }

    args.push(output_path.display().to_string());
    args.push("-y".to_string());

    args
}

fn quality_to_crf(quality: u16) -> u16 {
    let max_crf: u16 = 36;
    let min_crf: u16 = 24;
    let diff = (max_crf - min_crf) - ((max_crf - min_crf) * quality) / 100;
    min_crf + diff
}

fn probe_duration_us(ffmpeg_path: &Path, input_path: &Path) -> Result<Option<u64>, String> {
    let input_arg = input_path.display().to_string();
    let output = Command::new(ffmpeg_path)
        .args(["-i", &input_arg])
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let re = Regex::new(r"Duration: (?P<duration>\d{2}:\d{2}:\d{2}\.\d+)")
        .map_err(|e| e.to_string())?;
    for line in stderr.lines() {
        if let Some(caps) = re.captures(line) {
            if let Some(duration) = caps.name("duration") {
                return Ok(parse_time_to_us(duration.as_str()));
            }
        }
    }

    Ok(None)
}

fn parse_out_time_us(line: &str) -> Option<u64> {
    if let Some(value) = line.strip_prefix("out_time_ms=") {
        return value.trim().parse::<u64>().ok();
    }
    if let Some(value) = line.strip_prefix("out_time=") {
        return parse_time_to_us(value.trim());
    }
    None
}

fn parse_time_to_us(value: &str) -> Option<u64> {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours = parts[0].parse::<u64>().ok()?;
    let minutes = parts[1].parse::<u64>().ok()?;
    let seconds = parts[2].parse::<f64>().ok()?;
    let total_seconds = (hours * 3600) as f64 + (minutes * 60) as f64 + seconds;
    Some((total_seconds * 1_000_000.0) as u64)
}

fn resolve_ffmpeg_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("COMPRESSO_FFMPEG_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    let exe_suffix = if cfg!(windows) { ".exe" } else { "" };

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let direct = exe_dir.join(format!("compresso_ffmpeg{exe_suffix}"));
            if direct.exists() {
                return Ok(direct);
            }

            let bin_sidecar = exe_dir.join("bin").join(format!("compresso_ffmpeg{exe_suffix}"));
            if bin_sidecar.exists() {
                return Ok(bin_sidecar);
            }
        }
    }

    if let Ok(cwd) = env::current_dir() {
        let target = format!("compresso_ffmpeg-{}{}", target_triple(), exe_suffix);
        let repo_sidecar = cwd.join("src-tauri").join("bin").join(&target);
        if repo_sidecar.exists() {
            return Ok(repo_sidecar);
        }

        let local_sidecar = cwd.join("bin").join(&target);
        if local_sidecar.exists() {
            return Ok(local_sidecar);
        }
    }

    if let Some(path) = find_in_path("ffmpeg") {
        return Ok(path);
    }

    Err("Could not locate ffmpeg binary. Set COMPRESSO_FFMPEG_PATH or place compresso_ffmpeg alongside the CLI.".to_string())
}

fn target_triple() -> String {
    let arch = match env::consts::ARCH {
        "x86" => "i686",
        other => other,
    };

    match env::consts::OS {
        "windows" => format!("{arch}-pc-windows-msvc"),
        "macos" => format!("{arch}-apple-darwin"),
        "linux" => format!("{arch}-unknown-linux-gnu"),
        other => format!("{arch}-{other}"),
    }
}

fn find_in_path(command: &str) -> Option<PathBuf> {
    let paths = env::var_os("PATH")?;
    let separator = if cfg!(windows) { ';' } else { ':' };

    for dir in paths.to_string_lossy().split(separator) {
        let candidate = Path::new(dir).join(if cfg!(windows) {
            format!("{command}.exe")
        } else {
            command.to_string()
        });
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

fn print_summary(settings: &Settings, total_files: usize) {
    println!("\nBatch summary");
    println!("Files: {total_files}");
    println!("Output folder: {}", settings.output_dir.display());
    println!(
        "Format: {}",
        match settings.output_format {
            OutputFormat::SameAsSource => "same as source",
            OutputFormat::Fixed(ext) => ext,
        }
    );
    println!(
        "Preset: {}",
        match settings.preset {
            Preset::Default => "default",
            Preset::Thunderbolt => "thunderbolt",
        }
    );
    println!("Quality: {}", settings.quality);
    println!(
        "FPS: {}",
        settings
            .fps
            .map(|fps| fps.to_string())
            .unwrap_or_else(|| "original".to_string())
    );
    println!(
        "Resize: {}",
        settings
            .dimensions
            .map(|(w, h)| format!("{w}x{h}"))
            .unwrap_or_else(|| "no".to_string())
    );
    println!("Mute audio: {}", if settings.mute_audio { "yes" } else { "no" });
    println!(
        "On conflict: {}",
        match settings.conflict_policy {
            ConflictPolicy::Overwrite => "overwrite",
            ConflictPolicy::Skip => "skip",
            ConflictPolicy::AutoRename => "auto-rename",
        }
    );
}
