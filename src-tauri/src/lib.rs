#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod llm;
mod models;
mod persistence;
mod schema;

use std::{
    path::PathBuf,
    process::{Child, Command},
    sync::Mutex,
    time::Duration,
};

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::time::sleep;

struct LlamaState(Mutex<Option<Child>>);

fn resolve_resource(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(rel, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve resource '{rel}': {e}"))
}

// Repo path to src-tauri (compile-time).
fn repo_src_tauri_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn find_llama_server_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut looked: Vec<PathBuf> = Vec::new();

    // 1) dev sidecar next to current exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let dev_bin = exe_dir.join("bin");

            let c1 = dev_bin.join("llama-server-x86_64-pc-windows-msvc.exe");
            let c2 = dev_bin.join("llama-server.exe");
            looked.push(c1.clone());
            looked.push(c2.clone());

            if c1.exists() {
                return Ok(c1);
            }
            if c2.exists() {
                return Ok(c2);
            }
        }
    }

    // 2) repo src-tauri/bin fallback
    let repo_bin = repo_src_tauri_dir().join("bin");
    let r1 = repo_bin.join("llama-server-x86_64-pc-windows-msvc.exe");
    let r2 = repo_bin.join("llama-server.exe");
    looked.push(r1.clone());
    looked.push(r2.clone());

    if r1.exists() {
        return Ok(r1);
    }
    if r2.exists() {
        return Ok(r2);
    }

    // 3) packaged resources (release)
    if let Ok(p1) = resolve_resource(app, "bin/llama-server-x86_64-pc-windows-msvc.exe") {
        looked.push(p1.clone());
        if p1.exists() {
            return Ok(p1);
        }
    }
    if let Ok(p2) = resolve_resource(app, "bin/llama-server.exe") {
        looked.push(p2.clone());
        if p2.exists() {
            return Ok(p2);
        }
    }

    let msg = looked
        .iter()
        .map(|p| format!("- {}", p.display()))
        .collect::<Vec<_>>()
        .join("\n");

    Err(format!("llama-server not found. Looked in:\n{msg}"))
}

#[tauri::command]
async fn start_llama_server(
    app: AppHandle,
    state: State<'_, LlamaState>,
    port: Option<u16>,
    model_rel: Option<String>,
    custom_model_path: Option<String>,
) -> Result<u16, String> {
    let port = port.unwrap_or(11435);

    // stop any existing server
    if let Some(mut child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
    }

    let server_path = find_llama_server_path(&app)?;

    let model_path = if let Some(path) = custom_model_path {
        PathBuf::from(path)
    } else if let Some(rel) = model_rel {
        resolve_resource(&app, &rel)?
    } else {
        return Err("No model selected. Visit the AI Forge to manifest a new mind.".to_string());
    };

    if !server_path.exists() {
        return Err(format!("llama-server not found: {}", server_path.display()));
    }
    if !model_path.exists() {
        return Err(format!("Model not found: {}", model_path.display()));
    }

    // Spawn llama-server without window on Windows
    let mut cmd = Command::new(&server_path);
    cmd.args([
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "-m",
        model_path.to_string_lossy().as_ref(),
    ]);

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn llama-server: {e}"))?;

    *state.0.lock().unwrap() = Some(child);

    sleep(Duration::from_millis(300)).await;

    Ok(port)
}

#[tauri::command]
async fn send_chat_message(
    app: AppHandle,
    port: Option<u16>,
    messages: Vec<serde_json::Value>,
    event_name: String,
) -> Result<String, String> {
    let port = port.unwrap_or(11435);

    let app2 = app.clone();
    let event2 = event_name.clone();

    let text = llm::chat_streaming(port, messages, move |tok| {
        let _ = app2.emit(&event2, tok);
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(text)
}

// --- Persistence Commands ---

#[tauri::command]
async fn get_todos(app: AppHandle) -> Result<Vec<schema::TodoItem>, String> {
    persistence::load_todos(&app)
}

#[tauri::command]
async fn save_todo(app: AppHandle, todo: schema::TodoItem) -> Result<(), String> {
    let mut todos = persistence::load_todos(&app)?;
    if let Some(pos) = todos.iter().position(|t| t.id == todo.id) {
        todos[pos] = todo;
    } else {
        todos.push(todo);
    }
    persistence::save_todos(&app, &todos)
}

#[tauri::command]
async fn delete_todo(app: AppHandle, id: String) -> Result<(), String> {
    let mut todos = persistence::load_todos(&app)?;
    todos.retain(|t| t.id != id);
    persistence::save_todos(&app, &todos)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LlamaState(Mutex::new(None)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_llama_server,
            send_chat_message,
            get_todos,
            save_todo,
            delete_todo,
            models::get_models_status,
            models::download_model,
            models::delete_downloaded_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
