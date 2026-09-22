use std::process::Command;

/// How this build was installed, which decides how it can update itself.
#[tauri::command]
pub fn install_kind() -> String {
    if !cfg!(target_os = "linux") {
        return "native".into();
    }
    if std::env::var("APPIMAGE").is_ok() {
        return "appimage".into();
    }
    "package".into()
}

fn run(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("{program} não pôde ser executado: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("{program} falhou")
    } else {
        stderr
    })
}

/// Writes the downloaded package to a temporary file and installs it.
///
/// A package install needs root, so this asks the desktop for authorisation
/// through polkit and falls back to handing the file to the system installer.
#[tauri::command]
pub fn install_package(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("download vazio".into());
    }
    let safe = file_name
        .rsplit('/')
        .next()
        .unwrap_or("update.deb")
        .replace(
            |c: char| !c.is_ascii_alphanumeric() && !"._-".contains(c),
            "_",
        );
    let path = std::env::temp_dir().join(safe);
    std::fs::write(&path, bytes).map_err(|e| format!("não consegui gravar o pacote: {e}"))?;
    let path_str = path.to_string_lossy().to_string();

    if which("pkexec") && run("pkexec", &["apt-get", "install", "-y", &path_str]).is_ok() {
        return Ok("installed".into());
    }
    // No polkit, or the user dismissed it: let the desktop open the package.
    run("xdg-open", &[&path_str])?;
    Ok("handed-off".into())
}

fn which(program: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {program}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
