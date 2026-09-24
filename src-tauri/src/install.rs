use std::process::Command;

use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

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

/// Entry of the .deb build in the updater manifest.
const DEB_TARGET: &str = "linux-x86_64-deb";

/// Looks up the .deb entry of the manifest through the updater, which fetches
/// from Rust: the webview cannot read release files, GitHub sends no CORS
/// headers for them.
async fn find_package_update(
    app: &AppHandle,
) -> Result<Option<tauri_plugin_updater::Update>, String> {
    app.updater_builder()
        .target(DEB_TARGET)
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())
}

/// Version of a newer .deb, or None when this one is current.
#[tauri::command]
pub async fn package_update_check(app: AppHandle) -> Result<Option<String>, String> {
    Ok(find_package_update(&app).await?.map(|u| u.version))
}

/// Downloads the newer .deb, checks its signature and installs it, reporting
/// progress as `package-update-progress` in percent.
#[tauri::command]
pub async fn package_update_install(app: AppHandle) -> Result<String, String> {
    let update = find_package_update(&app)
        .await?
        .ok_or("nenhuma atualização disponível")?;
    let file_name = update
        .download_url
        .path_segments()
        .and_then(|mut s| s.next_back())
        .unwrap_or("update.deb")
        .to_string();
    let progress = app.clone();
    let mut got: u64 = 0;
    let bytes = update
        .download(
            move |chunk, total| {
                got += chunk as u64;
                if let Some(total) = total.filter(|t| *t > 0) {
                    let _ = progress.emit("package-update-progress", got * 100 / total);
                }
            },
            || {},
        )
        .await
        .map_err(|e| format!("download falhou: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || install_package(file_name, bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// Writes the downloaded package to a temporary file and installs it.
///
/// A package install needs root, so this asks the desktop for authorisation
/// through polkit and falls back to handing the file to the system installer.
fn install_package(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
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

/// Restarts the app after an update.
///
/// On macOS the updater replaces the whole bundle, which leaves the running
/// executable path pointing at a file that no longer exists, so re-executing it
/// does nothing. Asking the system to open the bundle again works instead.
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        // .../Claude Terminal.app/Contents/MacOS/<bin>
        let bundle = exe
            .ancestors()
            .find(|p| p.extension().is_some_and(|e| e == "app"));
        if let Some(bundle) = bundle {
            Command::new("open")
                .arg("-n")
                .arg(bundle)
                .spawn()
                .map_err(|e| format!("não consegui reabrir o app: {e}"))?;
            app.exit(0);
            return Ok(());
        }
    }
    tauri::process::restart(&tauri::Manager::env(&app));
}
