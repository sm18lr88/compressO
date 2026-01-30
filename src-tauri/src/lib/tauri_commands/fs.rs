use crate::{domain::FileMetadata, domain::ResolveVideoFilesResult, ffmpeg, fs};
use std::{collections::HashSet, path::Path};
use walkdir::WalkDir;

const VIDEO_EXTENSIONS: [&str; 5] = ["mp4", "mov", "webm", "avi", "mkv"];

fn is_supported_video_extension(ext: &str) -> bool {
    VIDEO_EXTENSIONS
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(ext))
}

fn is_supported_video_file(path: &Path) -> bool {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) => is_supported_video_extension(ext),
        None => false,
    }
}

#[tauri::command]
pub async fn get_file_metadata(file_path: &str) -> Result<FileMetadata, String> {
    fs::get_file_metadata(file_path)
}

#[tauri::command]
pub async fn get_image_dimension(image_path: &str) -> Result<(u32, u32), String> {
    fs::get_image_dimension(image_path)
}

#[tauri::command]
pub async fn move_file(from: &str, to: &str) -> Result<(), String> {
    if let Err(err) = fs::copy_file(from, to).await {
        return Err(err.to_string());
    }

    if let Err(err) = fs::delete_file(from).await {
        return Err(err.to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_file(path: &str) -> Result<(), String> {
    if let Err(err) = fs::delete_file(path).await {
        return Err(err.to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_cache(app: tauri::AppHandle) -> Result<(), String> {
    let ffmpeg = ffmpeg::FFMPEG::new(&app)?;
    if let Err(err) = fs::delete_stale_files(&ffmpeg.get_asset_dir(), 0).await {
        return Err(err.to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn resolve_video_files(
    paths: Vec<String>,
    recursive: Option<bool>,
) -> Result<ResolveVideoFilesResult, String> {
    let mut files: Vec<FileMetadata> = Vec::new();
    let mut invalid_paths: Vec<String> = Vec::new();
    let mut skipped_paths: Vec<String> = Vec::new();
    let mut ignored_count: u64 = 0;
    let mut seen_paths: HashSet<String> = HashSet::new();

    let should_recursive = recursive.unwrap_or(true);

    for path_str in paths {
        let path = Path::new(&path_str);
        if !path.exists() {
            invalid_paths.push(path_str);
            continue;
        }

        if path.is_file() {
            if is_supported_video_file(path) {
                let normalized = path.display().to_string();
                if !seen_paths.contains(&normalized) {
                    if let Ok(metadata) = fs::get_file_metadata(&normalized) {
                        seen_paths.insert(normalized);
                        files.push(metadata);
                    } else {
                        invalid_paths.push(path_str);
                    }
                }
            } else {
                skipped_paths.push(path_str);
            }
            continue;
        }

        if path.is_dir() {
            if should_recursive {
                for entry in WalkDir::new(path)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.file_type().is_file() {
                        let entry_path = entry.path();
                        if is_supported_video_file(entry_path) {
                            let normalized = entry_path.display().to_string();
                            if !seen_paths.contains(&normalized) {
                                if let Ok(metadata) = fs::get_file_metadata(&normalized) {
                                    seen_paths.insert(normalized);
                                    files.push(metadata);
                                }
                            }
                        } else {
                            ignored_count += 1;
                        }
                    }
                }
            } else if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if entry_path.is_file() {
                        if is_supported_video_file(&entry_path) {
                            let normalized = entry_path.display().to_string();
                            if !seen_paths.contains(&normalized) {
                                if let Ok(metadata) = fs::get_file_metadata(&normalized) {
                                    seen_paths.insert(normalized);
                                    files.push(metadata);
                                }
                            }
                        } else {
                            ignored_count += 1;
                        }
                    }
                }
            }
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(ResolveVideoFilesResult {
        files,
        invalid_paths,
        skipped_paths,
        ignored_count,
    })
}
