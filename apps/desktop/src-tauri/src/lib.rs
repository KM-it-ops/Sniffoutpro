#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            run_nmap,
            get_fixture_nmap_xml
        ])
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

/// Validate a single target token: IPv4, CIDR (/0-/32), or hostname.
/// Rejects anything starting with `-` (nmap option injection).
fn is_valid_target_token(token: &str) -> bool {
    if token.is_empty() || token.starts_with('-') {
        return false;
    }

    // IPv4 or IPv4/CIDR
    if let Some((ip, prefix)) = token.split_once('/') {
        if !is_ipv4(ip) {
            return false;
        }
        return prefix.parse::<u8>().map(|p| p <= 32).unwrap_or(false);
    }

    if is_ipv4(token) {
        return true;
    }

    // Hostname / localhost
    if token.eq_ignore_ascii_case("localhost") {
        return true;
    }

    is_hostname(token)
}

fn is_ipv4(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    parts
        .iter()
        .all(|p| p.parse::<u8>().is_ok() && !(p.len() > 1 && p.starts_with('0')))
        || parts.iter().all(|p| p.parse::<u8>().is_ok())
}

fn is_hostname(s: &str) -> bool {
    if s.len() > 253 || s.is_empty() {
        return false;
    }
    s.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    })
}

fn validate_targets(targets: &str) -> Result<Vec<String>, String> {
    let tokens: Vec<String> = targets
        .split(|c: char| c.is_whitespace() || c == ',')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect();

    if tokens.is_empty() {
        return Err("At least one scan target is required".into());
    }

    for token in &tokens {
        if !is_valid_target_token(token) {
            return Err(format!(
                "Invalid or disallowed target \"{token}\" (IPv4/CIDR/hostname only; must not start with -)"
            ));
        }
    }

    Ok(tokens)
}

fn build_nmap_args(target_tokens: &[String], intensity: &str) -> Vec<String> {
    let mut args = vec!["-sV".to_string(), "-oX".to_string(), "-".to_string()];

    match intensity {
        "light" => args.push("-T4".to_string()),
        "deep" => {
            args.push("-O".to_string());
            args.push("--script=ssl-enum-ciphers".to_string());
        }
        _ => {}
    }

    // Stop option parsing so targets cannot inject nmap flags.
    args.push("--".to_string());
    for t in target_tokens {
        args.push(t.clone());
    }
    args
}

/// Spawn nmap with XML output (-oX -). Caller must have authorization for targets.
/// Targets are validated here — do not trust the renderer.
#[tauri::command]
async fn run_nmap(targets: String, intensity: Option<String>) -> Result<NmapRunResult, String> {
    let intensity = intensity.unwrap_or_else(|| "standard".to_string());
    let target_tokens = validate_targets(&targets)?;

    tauri::async_runtime::spawn_blocking(move || {
        use std::process::Command;

        let args = build_nmap_args(&target_tokens, &intensity);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_flag_injection() {
        assert!(validate_targets("--script=vuln 127.0.0.1").is_err());
        assert!(validate_targets("-oN /tmp/out 8.8.8.8").is_err());
    }

    #[test]
    fn accepts_ipv4_and_cidr() {
        assert!(validate_targets("8.8.8.8").is_ok());
        assert!(validate_targets("192.168.1.0/24").is_ok());
        assert!(validate_targets("localhost").is_ok());
    }

    #[test]
    fn args_include_double_dash_terminator() {
        let args = build_nmap_args(&["8.8.8.8".into()], "light");
        assert!(args.iter().any(|a| a == "--"));
        let dash = args.iter().position(|a| a == "--").unwrap();
        assert_eq!(args[dash + 1], "8.8.8.8");
    }
}
