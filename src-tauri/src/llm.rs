use anyhow::{Result, anyhow};
use futures_util::StreamExt;

pub async fn server_alive(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/v1/models");
    reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Calls llama-server's OpenAI-compatible endpoint and streams deltas.
/// Returns the final accumulated content (expected to be JSON).
pub async fn generate_json_streaming<F>(
    port: u16,
    prompt: String,
    mut on_token: F,
) -> Result<String>
where
    F: FnMut(String) + Send + 'static,
{
    if !server_alive(port).await {
        return Err(anyhow!(
            "Cannot reach llama-server on http://127.0.0.1:{port}.\n\
       The server is probably not running or exited immediately.\n\
       Fix: update the spawn args to use -m <model.gguf> (many builds do not support --model)."
        ));
    }

    let url = format!("http://127.0.0.1:{port}/v1/chat/completions");

    let sys = r#"You are an advanced AI productivity assistant. Your task is to help the user manage their tasks and projects efficiently.
    
    CAPABILITIES:
    - Task Decomposition: Break down complex goals into smaller, actionable steps.
    - Prioritization: Suggest which tasks are most urgent or important.
    - Categorization: Suggest relevant tags and categories for tasks.
    - Insights: Provide helpful observations about the user's productivity and habits.

    INTERACTION FORMAT:
    When the user asks you to manage tasks, you should respond with a natural language message and, if appropriate, a list of suggested actions in a structured format.
    
    JSON SCHEMA FOR SUGGESTIONS:
    {
        "message": "Your conversational response",
        "suggested_actions": [
            { "type": "CreateTask", "data": { "title": "...", "description": "...", "priority": "High|Medium|Low", "tags": ["..."] } },
            { "type": "UpdateTask", "data": { "id": "...", ... } },
            { "type": "DeleteTask", "data": "id" }
        ]
    }
    
    Always ensure your JSON is valid."#;

    let body = serde_json::json!({
      "model": "local-model",
      "stream": true,
      "temperature": 0.7,
      "frequency_penalty": 1.1,
      "presence_penalty": 1.1,
      "max_tokens": 16384,
      "messages": [
        {"role":"system","content": sys},
        {"role":"user","content": prompt}
      ]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to call llama-server at {url}: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let t = resp.text().await.unwrap_or_default();
        return Err(anyhow!("llama-server error {}: {}", status, t));
    }

    let mut out = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item?;
        let s = String::from_utf8_lossy(&chunk);

        for line in s.lines() {
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let data = line.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                return Ok(out);
            }

            let v: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let content = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
            if !content.is_empty() {
                out.push_str(content);
                on_token(content.to_string());
            }
        }
    }

    Ok(out)
}

/// Calls llama-server's OpenAI-compatible endpoint for generic chat and streams deltas.
/// Emits raw markdown tokens back via the closure.
pub async fn chat_streaming<F>(
    port: u16,
    messages: Vec<serde_json::Value>,
    mut on_token: F,
) -> Result<String>
where
    F: FnMut(String) + Send + 'static,
{
    if !server_alive(port).await {
        return Err(anyhow!(
            "Cannot reach llama-server on http://127.0.0.1:{port}."
        ));
    }

    let url = format!("http://127.0.0.1:{port}/v1/chat/completions");

    let body = serde_json::json!({
      "model": "local-model",
      "stream": true,
      "temperature": 0.7,
      "max_tokens": 16384,
      "messages": messages
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to call llama-server at {url}: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let t = resp.text().await.unwrap_or_default();
        return Err(anyhow!("llama-server error {}: {}", status, t));
    }

    let mut out = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item?;
        let s = String::from_utf8_lossy(&chunk);

        for line in s.lines() {
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let data = line.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                return Ok(out);
            }

            let v: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let content = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
            if !content.is_empty() {
                out.push_str(content);
                on_token(content.to_string());
            }
        }
    }

    Ok(out)
}
