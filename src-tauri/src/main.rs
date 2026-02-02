// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lib::fs::{self as file_system};
use tauri_plugin_log::Target as LogTarget;
#[cfg(debug_assertions)]
use tauri_plugin_log::TargetKind as LogTargetKind;

use lib::tauri_commands::{
    ffmpeg::{
        __cmd__compress_video, __cmd__generate_quality_preview, __cmd__generate_video_thumbnail,
        __cmd__get_video_info, compress_video, generate_quality_preview, generate_video_thumbnail,
        get_video_info,
    },
    file_manager::{__cmd__show_item_in_file_manager, show_item_in_file_manager},
    fs::{
        __cmd__delete_cache, __cmd__delete_file, __cmd__get_file_metadata,
        __cmd__get_image_dimension, __cmd__move_file, __cmd__resolve_video_files, delete_cache,
        delete_file, get_file_metadata, get_image_dimension, move_file, resolve_video_files,
    },
    system::{
        __cmd__cancel_system_shutdown, __cmd__schedule_system_shutdown,
        cancel_system_shutdown, schedule_system_shutdown,
    },
};

#[cfg(target_os = "linux")]
use lib::tauri_commands::file_manager::DbusState;
#[cfg(target_os = "linux")]
use std::sync::Mutex;
#[cfg(target_os = "linux")]
use tauri::Manager;

#[cfg(debug_assertions)]
const LOG_TARGETS: [LogTarget; 1] = [LogTarget::new(LogTargetKind::Stdout)];

#[cfg(not(debug_assertions))]
const LOG_TARGETS: [LogTarget; 0] = [];

#[tokio::main]
async fn main() {
    if let Err(err) = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets(LOG_TARGETS)
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            app.manage(DbusState(Mutex::new(
                dbus::blocking::SyncConnection::new_session().ok(),
            )));

            file_system::setup_app_data_dir(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            compress_video,
            generate_quality_preview,
            generate_video_thumbnail,
            get_video_info,
            get_image_dimension,
            get_file_metadata,
            move_file,
            delete_file,
            delete_cache,
            resolve_video_files,
            show_item_in_file_manager,
            schedule_system_shutdown,
            cancel_system_shutdown
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
    }
}
