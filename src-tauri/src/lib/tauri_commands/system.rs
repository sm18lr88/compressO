use std::process::Command;

#[tauri::command]
pub async fn schedule_system_shutdown(delay_seconds: u64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let result = Command::new("shutdown")
            .args(["/s", "/t", &delay_seconds.to_string()])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Failed to schedule shutdown: {}",
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("Failed to execute shutdown command: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let minutes = (delay_seconds + 59) / 60; // Round up to nearest minute
        let result = Command::new("shutdown")
            .args(["-h", &format!("+{}", minutes)])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Failed to schedule shutdown: {}",
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("Failed to execute shutdown command: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        let minutes = (delay_seconds + 59) / 60; // Round up to nearest minute
        let result = Command::new("shutdown")
            .args(["-h", &format!("+{}", minutes)])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Failed to schedule shutdown: {}",
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("Failed to execute shutdown command: {}", e)),
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Shutdown not supported on this platform".to_string())
    }
}

#[tauri::command]
pub async fn cancel_system_shutdown() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let result = Command::new("shutdown").args(["/a"]).output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Failed to cancel shutdown: {}",
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("Failed to execute shutdown cancel command: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let result = Command::new("killall").args(["shutdown"]).output();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to cancel shutdown: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        let result = Command::new("shutdown").args(["-c"]).output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Failed to cancel shutdown: {}",
                        String::from_utf8_lossy(&output.stderr)
                    ))
                }
            }
            Err(e) => Err(format!("Failed to cancel shutdown: {}", e)),
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Shutdown cancellation not supported on this platform".to_string())
    }
}
