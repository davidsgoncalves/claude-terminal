use std::path::Path;

#[derive(serde::Serialize)]
pub struct PathCheck {
    pub exists: bool,
    pub is_dir: bool,
    pub name: Option<String>,
    pub expanded: String,
}

/// Resolves `~` and reports whether the path is usable as a session folder.
#[tauri::command]
pub fn path_check(path: String) -> PathCheck {
    let expanded = if let Some(rest) = path.strip_prefix("~/") {
        dirs::home_dir()
            .map(|h| h.join(rest).to_string_lossy().to_string())
            .unwrap_or(path.clone())
    } else if path == "~" {
        dirs::home_dir()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or(path.clone())
    } else {
        path.clone()
    };

    let p = Path::new(&expanded);
    let meta = std::fs::metadata(p).ok();
    PathCheck {
        exists: meta.is_some(),
        is_dir: meta.map(|m| m.is_dir()).unwrap_or(false),
        name: p.file_name().map(|n| n.to_string_lossy().to_string()),
        expanded,
    }
}

/// Home directory, used as the fallback folder for a new session.
#[tauri::command]
pub fn home_dir() -> String {
    dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".into())
}
