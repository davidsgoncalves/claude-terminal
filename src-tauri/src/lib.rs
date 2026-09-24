mod db;
mod files;
mod git;
mod hooks;
mod install;
mod mcp;
mod paths;
mod permissions;
mod pty;
mod sessions;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pty::PtyState::default())
        .manage(permissions::Permissions::default())
        .manage(mcp::Editors::default())
        .setup(|app| {
            app.manage(db::open().map_err(|e| format!("database unavailable: {e}"))?);
            if let Err(e) = hooks::write_scripts() {
                eprintln!("[setup] could not write hook scripts: {e}");
            }
            hooks::start_server(app.handle().clone());
            Ok(())
        })
        // The mini panel and detached terminals are asked to close with the
        // main window, but each has to close itself, and on Linux one could
        // linger and keep the process alive. The main window going away ends
        // the app outright.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            hooks::hooks_setup,
            permissions::permission_decide,
            sessions::sessions_list,
            sessions::sessions_search,
            sessions::session_titles,
            db::state_load,
            db::state_save,
            db::metrics_summary,
            git::git_info,
            files::link_open,
            files::path_exists,
            files::drop_save,
            paths::path_check,
            paths::home_dir,
            install::install_kind,
            install::package_update_check,
            install::package_update_install,
            install::restart_app,
            mcp::editor_submit,
            mcp::editor_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
