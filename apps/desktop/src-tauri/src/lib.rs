#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, run_nmap, get_fixture_nmap_xml])
        .run(tauri::generate_context!())
        .expect("error while running SniffOutPro desktop");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! Ready to scan authorized targets.")
}

#[derive(serde::Serialize)]
pub struct NmapRunResult {
    pub xml: String,
    pub exit_code: i32,
}

fn resolve_nmap_executable() -> std::path::PathBuf {
    use std::path::PathBuf;

    #[cfg(windows)]
    {
        for candidate in [
            r"C:\Program Files (x86)\Nmap\nmap.exe",
            r"C:\Program Files\Nmap\nmap.exe",
        ] {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return path;
            }
        }
    }

    PathBuf::from("nmap")
}

fn build_nmap_args(targets: &str, intensity: &str) -> Vec<String> {
    let mut args = vec!["-sV".to_string(), "-oX".to_string(), "-".to_string()];

    match intensity {
        "light" => args.push("-T4".to_string()),
        "deep" => {
            args.push("-O".to_string());
            args.push("--script=ssl-enum-ciphers".to_string());
        }
        _ => {}
    }

    args.push(targets.to_string());
    args
}

/// Spawn nmap with XML output (-oX -). Caller must have authorization for targets.
#[tauri::command]
async fn run_nmap(targets: String, intensity: Option<String>) -> Result<NmapRunResult, String> {
    let intensity = intensity.unwrap_or_else(|| "standard".to_string());

    tauri::async_runtime::spawn_blocking(move || {
        use std::process::Command;

        let args = build_nmap_args(&targets, &intensity);
        let nmap = resolve_nmap_executable();
        let output = Command::new(&nmap)
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to spawn nmap at {}: {e}", nmap.display()))?;

        let xml = String::from_utf8_lossy(&output.stdout).into_owned();
        let exit_code = output.status.code().unwrap_or(-1);

        if !output.status.success() && xml.is_empty() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("nmap failed (code {exit_code}): {stderr}"));
        }

        Ok(NmapRunResult { xml, exit_code })
    })
    .await
    .map_err(|e| format!("nmap task join error: {e}"))?
}

/// Lab fixture for CI and offline dev when nmap is unavailable.
#[tauri::command]
fn get_fixture_nmap_xml() -> String {
    include_str!("../../../../packages/scan-engine/fixtures/nmap-sample.xml").to_string()
}
