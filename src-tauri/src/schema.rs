use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TodoItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub completed: bool,
    pub priority: String, // Low, Medium, High
    pub tags: Vec<String>,
    pub created_at: i64,
    pub due_date: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TodoList {
    pub items: Vec<TodoItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIChatResponse {
    pub message: String,
    pub suggested_actions: Vec<AISuggestion>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum AISuggestion {
    CreateTask(TodoItem),
    UpdateTask(TodoItem),
    DeleteTask(String),
    BulkCategorize { ids: Vec<String>, tag: String },
}

pub fn repair_json_text(raw: &str) -> String {
    let mut s: String = raw
        .chars()
        .map(|c| {
            let b = c as u32;
            if b < 32 {
                ' '
            } else {
                c
            }
        })
        .collect();

    if let Some(first_brace) = s.find('{') {
        s = s[first_brace..].to_string();
    }

    auto_close_json(s)
}

fn auto_close_json(mut json: String) -> String {
    let mut stack = Vec::new();
    let mut in_string = false;
    let mut escaped = false;

    for (_, c) in json.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
        } else {
            match c {
                '"' => in_string = true,
                '{' => stack.push('}'),
                '[' => stack.push(']'),
                '}' => {
                    if stack.last() == Some(&'}') {
                        stack.pop();
                    }
                }
                ']' => {
                    if stack.last() == Some(&']') {
                        stack.pop();
                    }
                }
                _ => {}
            }
        }
    }

    if in_string {
        json.push('"');
    }

    while let Some(closing) = stack.pop() {
        json.push(closing);
    }

    json
}
