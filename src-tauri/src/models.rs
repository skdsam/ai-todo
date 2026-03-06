use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: String,
    pub filename: String,
    pub size_gb: f32,
    pub params: String,
}

pub fn get_curated_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "llama-3-2-1b".into(),
            name: "Llama 3.2 1B".into(),
            description: "Meta's smallest model. Fast and capable for very basic storytelling and dialogue.".into(),
            url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q8_0.gguf".into(),
            filename: "Llama-3.2-1B-Instruct-Q8_0.gguf".into(),
            size_gb: 1.3,
            params: "1B".into(),
        },
        ModelInfo {
            id: "qwen-2-5-1-5b".into(),
            name: "Qwen 2.5 1.5B".into(),
            description: "Alibaba's efficient small model. Excellent balance of speed and logic for its size.".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q8_0.gguf".into(),
            filename: "qwen2.5-1.5b-instruct-q8_0.gguf".into(),
            size_gb: 1.7,
            params: "1.5B".into(),
        },
        ModelInfo {
            id: "gemma-2-2b".into(),
            name: "Gemma 2 2B".into(),
            description: "Google's lightweight model. High quality reasoning for its size class.".into(),
            url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q6_K.gguf".into(),
            filename: "gemma-2-2b-it-Q6_K.gguf".into(),
            size_gb: 1.9,
            params: "2B".into(),
        },
        ModelInfo {
            id: "llama-3-2-3b".into(),
            name: "Llama 3.2 3B".into(),
            description: "Meta's highly capable small model. Great default choice for most users.".into(),
            url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q6_K.gguf".into(),
            filename: "Llama-3.2-3B-Instruct-Q6_K.gguf".into(),
            size_gb: 2.8,
            params: "3B".into(),
        },
        ModelInfo {
            id: "qwen-2-5-3b".into(),
            name: "Qwen 2.5 3B".into(),
            description: "A highly competent 3B model that regularly punches above its weight class.".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q6_k.gguf".into(),
            filename: "qwen2.5-3b-instruct-q6_k.gguf".into(),
            size_gb: 2.7,
            params: "3B".into(),
        },
        ModelInfo {
            id: "phi-3-5-mini-3-8b".into(),
            name: "Phi-3.5-mini 3.8B".into(),
            description: "Microsoft's tiny powerhouse. Exceptionally good logic and instruction following.".into(),
            url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q6_K.gguf".into(),
            filename: "Phi-3.5-mini-instruct-Q6_K.gguf".into(),
            size_gb: 3.2,
            params: "3.8B".into(),
        },
        ModelInfo {
            id: "llama-3-1-8b".into(),
            name: "Llama 3.1 8B".into(),
            description: "The gold standard for local LLMs. Incredible versatility and storytelling capability.".into(),
            url: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q6_K.gguf".into(),
            filename: "Meta-Llama-3.1-8B-Instruct-Q6_K.gguf".into(),
            size_gb: 6.6,
            params: "8B".into(),
        },
        ModelInfo {
            id: "qwen-2-5-7b".into(),
            name: "Qwen 2.5 7B".into(),
            description: "Alibaba's flagship 7B model. Phenomenal logic and narrative depth.".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q6_k.gguf".into(),
            filename: "qwen2.5-7b-instruct-q6_k.gguf".into(),
            size_gb: 6.2,
            params: "7B".into(),
        },
        ModelInfo {
            id: "mistral-7b-v03".into(),
            name: "Mistral 7B v0.3".into(),
            description: "The classic flagship. Reliability and performance unified in a medium spirit.".into(),
            url: "https://huggingface.co/maziyarpanahi/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3.Q6_K.gguf".into(),
            filename: "Mistral-7B-Instruct-v0.3.Q6_K.gguf".into(),
            size_gb: 5.9,
            params: "7B".into(),
        },
    ]
}

#[derive(Debug, Deserialize)]
struct HFModel {
    id: String,
    #[serde(default)]
    likes: i32,
    #[serde(default)]
    downloads: i32,
}

#[derive(Debug, Deserialize)]
struct HFFile {
    path: String,
    size: u64,
}

async fn fetch_repo_files(repo_id: &str) -> Result<Vec<HFFile>, String> {
    let url = format!("https://huggingface.co/api/models/{repo_id}/tree/main");
    let client = reqwest::Client::builder()
        .user_agent("dnd-quest-ai/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let files: Vec<HFFile> = res.json().await.map_err(|e| e.to_string())?;
    Ok(files)
}

pub async fn get_available_models() -> Vec<ModelInfo> {
    let mut models = get_curated_models();

    // Fetch popular and recent models
    let mut hf_repos = Vec::new();
    if let Ok(popular) = fetch_hf_models("downloads", 20).await {
        hf_repos.extend(popular);
    }
    if let Ok(recent) = fetch_hf_models("lastModified", 20).await {
        hf_repos.extend(recent);
    }

    for hf_m in hf_repos {
        // Avoid duplicates
        if models
            .iter()
            .any(|m| m.id.contains(&hf_m.id) || hf_m.id.contains(&m.id))
        {
            continue;
        }

        let id_lower = hf_m.id.to_lowercase();

        // STRICT Filter: 8B limit. Skip 9b, 10b, 12b, etc.
        if id_lower.contains("9b")
            || id_lower.contains("10b")
            || id_lower.contains("12b")
            || id_lower.contains("14b")
            || id_lower.contains("27b")
            || id_lower.contains("32b")
            || id_lower.contains("70b")
            || id_lower.contains("72b")
        {
            continue;
        }

        // Only include "instruct", "chat", or "story" models
        if !id_lower.contains("instruct")
            && !id_lower.contains("chat")
            && !id_lower.contains("story")
        {
            continue;
        }

        // Fetch files to find a good GGUF
        if let Ok(files) = fetch_repo_files(&hf_m.id).await {
            // Priority: Q6_K, Q5_K_M, Q8_0, then any GGUF
            let best_file = files
                .iter()
                .filter(|f| f.path.to_lowercase().ends_with(".gguf"))
                .find(|f| {
                    f.path.contains("Q6_K") || f.path.contains("Q5_K_M") || f.path.contains("Q8_0")
                })
                .or_else(|| {
                    files
                        .iter()
                        .find(|f| f.path.to_lowercase().ends_with(".gguf"))
                });

            if let Some(f) = best_file {
                let filename = f.path.clone();
                let url = format!(
                    "https://huggingface.co/{}/resolve/main/{}",
                    hf_m.id, filename
                );

                // Guess params from ID
                let params = if id_lower.contains("1b") {
                    "1B"
                } else if id_lower.contains("1.5b") {
                    "1.5B"
                } else if id_lower.contains("2b") {
                    "2B"
                } else if id_lower.contains("3b") {
                    "3B"
                } else if id_lower.contains("4b") {
                    "4B"
                } else if id_lower.contains("7b") {
                    "7B"
                } else if id_lower.contains("8b") {
                    "8B"
                } else {
                    "Unknown"
                };

                models.push(ModelInfo {
                    id: hf_m.id.clone(),
                    name: hf_m.id.split('/').last().unwrap_or(&hf_m.id).into(),
                    description: format!(
                        "Dynamically discovered model from Hugging Face. ({} downloads)",
                        hf_m.downloads
                    ),
                    url,
                    filename,
                    size_gb: (f.size as f32) / (1024.0 * 1024.0 * 1024.0),
                    params: params.into(),
                });
            }
        }
    }

    models
}

async fn fetch_hf_models(sort: &str, limit: i32) -> Result<Vec<HFModel>, String> {
    let url = format!(
        "https://huggingface.co/api/models?library=gguf&sort={}&direction=-1&limit={}",
        sort, limit
    );
    let client = reqwest::Client::builder()
        .user_agent("dnd-quest-ai/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let models: Vec<HFModel> = res.json().await.map_err(|e| e.to_string())?;
    Ok(models)
}

#[derive(Clone, Serialize)]
struct DownloadPayload {
    model_id: String,
    progress: f64,
}

#[tauri::command]
pub async fn get_models_status(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let models = get_available_models().await;
    let models_dir = app.path().app_data_dir().unwrap().join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    let mut status = Vec::new();
    let mut processed_filenames = std::collections::HashSet::new();

    // Add known models
    for m in models {
        let path = models_dir.join(&m.filename);
        let installed = path.exists();
        processed_filenames.insert(m.filename.clone());
        status.push(serde_json::json!({
            "info": m,
            "installed": installed,
            "path": if installed { Some(path.to_string_lossy()) } else { None }
        }));
    }

    // Add orphaned models (files on disk not in manifest)
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("gguf") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                if !processed_filenames.contains(&filename) {
                    let name = filename
                        .replace(".gguf", "")
                        .replace("-", " ")
                        .replace("_", " ");
                    status.push(serde_json::json!({
                        "info": ModelInfo {
                            id: format!("legacy-{}", filename),
                            name: format!("Legacy: {}", name),
                            description: "A manifested mind from an older version of the forge or an external source.".into(),
                            url: "".into(),
                            filename: filename.clone(),
                            size_gb: (entry.metadata().map(|m| m.len()).unwrap_or(0) as f32) / (1024.0 * 1024.0 * 1024.0),
                            params: "Unknown".into(),
                        },
                        "installed": true,
                        "path": Some(path.to_string_lossy())
                    }));
                }
            }
        }
    }

    Ok(status)
}

#[tauri::command]
pub async fn download_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let models = get_available_models().await;
    let model = models
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| "Model not found".to_string())?;

    let models_dir = app.path().app_data_dir().unwrap().join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    let dest_path = models_dir.join(&model.filename);
    if dest_path.exists() {
        return Ok(());
    }

    let client = reqwest::Client::new();
    let res = client
        .get(&model.url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let total_size = res.content_length().ok_or("Failed to get content length")?;

    let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let progress = (downloaded as f64 / total_size as f64) * 100.0;
        app.emit(
            "download-progress",
            DownloadPayload {
                model_id: model_id.clone(),
                progress,
            },
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_downloaded_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let models = get_available_models().await;
    let model = models
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| "Model not found".to_string())?;

    let models_dir = app.path().app_data_dir().unwrap().join("models");
    let dest_path = models_dir.join(&model.filename);

    if dest_path.exists() {
        std::fs::remove_file(dest_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
