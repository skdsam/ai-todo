use crate::schema::TodoItem;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))
}

fn load_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_json<T: serde::Serialize>(path: &Path, data: &Vec<T>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn load_todos(app: &AppHandle) -> Result<Vec<TodoItem>, String> {
    let path = get_data_dir(app)?.join("todos.json");
    load_json(&path)
}

pub fn save_todos(app: &AppHandle, data: &Vec<TodoItem>) -> Result<(), String> {
    let path = get_data_dir(app)?.join("todos.json");
    save_json(&path, data)
}
