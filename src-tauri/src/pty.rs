use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

pub struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(pub Mutex<HashMap<String, PtyHandle>>);

#[derive(Clone, serde::Serialize)]
struct PtyData {
    id: String,
    /// Raw bytes, base64-encoded so multibyte sequences survive chunk boundaries.
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct PtyExit {
    id: String,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: tauri::State<PtyState>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    if state.0.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");

    // If the app itself was launched from inside a Claude Code session, its
    // session markers leak into every tab. A `claude` started here would then
    // consider itself a child session and stop saving transcripts, which the
    // session list and resume depend on. Drop them so each tab is top level.
    let mut scrubbed: Vec<String> = Vec::new();
    for (key, _) in std::env::vars() {
        let leaked = key.starts_with("CLAUDE_CODE_")
            || matches!(key.as_str(), "CLAUDECODE" | "CLAUDE_PID" | "CLAUDE_EFFORT");
        if leaked {
            cmd.env_remove(&key);
            scrubbed.push(key);
        }
    }
    if !scrubbed.is_empty() {
        eprintln!(
            "[pty] scrubbed inherited Claude Code vars: {}",
            scrubbed.join(", ")
        );
    }

    // Put the `claude` shim ahead of the real binary for this shell.
    if let Some(bin) = crate::hooks::shim_dir() {
        let current = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{}:{}", bin.to_string_lossy(), current));
    }

    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // Programs that detect hyperlink support (Claude Code included) then print
    // file paths and URLs as OSC 8 links, which the terminal makes clickable.
    cmd.env("FORCE_HYPERLINK", "1");
    cmd.env("CLAUDE_TERMINAL_TAB_ID", &id);
    if let Some(dir) = cwd.map(PathBuf::from).or_else(dirs::home_dir) {
        cmd.cwd(dir);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // A PATH entry alone is not enough: the shell's startup files can reorder
    // PATH and zsh caches command lookups. A function is resolved before both,
    // so every `claude` typed in this tab reaches the shim.
    if let Some(shim) = crate::hooks::shim_dir().map(|d| d.join("claude")) {
        let quoted = format!("'{}'", shim.to_string_lossy().replace('\'', "'\\''"));
        let init = format!("claude() {{ {quoted} \"$@\"; }}; hash -r 2>/dev/null; clear\n");
        let _ = writer.write_all(init.as_bytes());
        let _ = writer.flush();
    }

    let reader_app = app.clone();
    let reader_id = id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = reader_app.emit(
                        "pty-data",
                        PtyData {
                            id: reader_id.clone(),
                            data: B64.encode(&buf[..n]),
                        },
                    );
                }
            }
        }
        let _ = reader_app.emit("pty-exit", PtyExit { id: reader_id });
    });

    state.0.lock().unwrap().insert(
        id,
        PtyHandle {
            master: pair.master,
            writer,
            child,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn pty_write(state: tauri::State<PtyState>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let handle = map.get_mut(&id).ok_or("pty not found")?;
    handle
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    handle.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let handle = map.get(&id).ok_or("pty not found")?;
    handle
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<PtyState>, id: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(mut handle) = map.remove(&id) {
        let _ = handle.child.kill();
    }
    Ok(())
}
