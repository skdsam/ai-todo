const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let todos = [];
let cachedModels = [];
let downloadingModelId = null;
let currentModelId = localStorage.getItem("ai_todo_model_id");

const chatBox = document.getElementById("chat-box");
const aiInput = document.getElementById("sidebar-ai-input");
const sendBtn = document.getElementById("sidebar-send-btn");
const todoContainer = document.getElementById("todo-container");
const aiStatusDot = document.getElementById("ai-status-dot");
const aiStatusText = document.getElementById("ai-status-text");
const aiModelName = document.getElementById("ai-model-name");

const forgeModal = document.getElementById("forge-modal");
const openForgeBtn = document.getElementById("open-forge-btn");
const closeForgeBtn = document.getElementById("close-forge-btn");
const forgeList = document.getElementById("forge-list");

const themeModal = document.getElementById("theme-modal");
const openThemeBtn = document.getElementById("open-theme-btn");
const closeThemeBtn = document.getElementById("close-theme-btn");
const saveCustomThemeBtn = document.getElementById("save-custom-theme-btn");

const taskModal = document.getElementById("task-modal");
const taskTitleInput = document.getElementById("task-input-title");
const taskDescInput = document.getElementById("task-input-desc");
const taskPriorityInput = document.getElementById("task-input-priority");
const taskDueInput = document.getElementById("task-input-due");
const taskTagsInput = document.getElementById("task-input-tags");
const saveTaskBtn = document.getElementById("save-task-btn");
const closeTaskBtn = document.getElementById("close-task-btn");

// --- UI / Resize Logic ---

const resizer = document.getElementById("resizer");
const app = document.getElementById("app");
let isResizing = false;

resizer.addEventListener("mousedown", () => {
  isResizing = true;
  document.body.classList.add("resizing");
});

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  const newWidth = Math.max(250, Math.min(600, e.clientX));
  app.style.setProperty("--sidebar-width", `${newWidth}px`);
});

document.addEventListener("mouseup", () => {
  isResizing = false;
  document.body.classList.remove("resizing");
});

// --- Core Functions ---

async function loadTodos() {
  todos = await invoke("get_todos");
  renderTodos();
}

function renderTodos() {
  todoContainer.innerHTML = todos.map(todo => {
    const dueStr = todo.due_date ? new Date(todo.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    const isMagic = todo.tags.some(t => t.toLowerCase() === 'magic' || t.toLowerCase() === 'ai');

    return `
      <div class="task-item ${isMagic ? 'magic-task' : ''} ${todo.completed ? 'opacity-50 grayscale' : ''}">
        <div class="custom-checkbox ${todo.completed ? 'checked' : ''}" onclick="toggleTodo('${todo.id}')"></div>
        
        <div style="flex: 1; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1rem; font-weight: 500; ${todo.completed ? 'text-decoration: line-through' : ''}">${todo.title}</span>
            ${isMagic ? `<span class="magic-badge"><span class="material-symbols-outlined" style="font-size: 12px; font-variation-settings: 'FILL' 1;">magic_button</span> Magic</span>` : ''}
          </div>
          
          <div style="display: flex; align-items: center; gap: 1rem; margin-top: 4px;">
            ${dueStr ? `
              <span style="font-size: 0.75rem; color: #64748b; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 14px;">schedule</span> Due ${dueStr}
              </span>
            ` : ''}
            
            <span style="font-size: 0.75rem; font-weight: 700; color: ${todo.priority === 'High' ? '#e11d48' : '#64748b'};">
               ${todo.priority.toUpperCase()}
            </span>

            ${todo.tags.filter(t => !['magic','ai'].includes(t.toLowerCase())).map(tag => `
              <span style="font-size: 0.75rem; color: #64748b; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 14px;">sell</span> ${tag}
              </span>
            `).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 0.25rem;">
           <button class="btn-ghost" onclick="editTodo('${todo.id}')" title="Edit"><span class="material-symbols-outlined">edit</span></button>
           <button class="btn-ghost" onclick="deleteTodo('${todo.id}')" title="Delete"><span class="material-symbols-outlined" style="color: #ef4444;">delete</span></button>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleTodo = async (id) => {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    await invoke("save_todo", { todo });
    renderTodos();
  }
};

window.deleteTodo = async (id) => {
  if (confirm("Delete this task?")) {
    await invoke("delete_todo", { id });
    todos = todos.filter(t => t.id !== id);
    renderTodos();
  }
};

// --- Modal Logic ---

const openTaskModal = () => {
    taskModal.style.display = "flex";
    taskTitleInput.focus();
};

const closeTaskModal = () => {
    taskModal.style.display = "none";
    taskTitleInput.value = "";
    taskDescInput.value = "";
    taskPriorityInput.value = "Medium";
    taskDueInput.value = "";
    taskTagsInput.value = "";
};

// --- Theme Logic ---

let customThemes = JSON.parse(localStorage.getItem("ai_todo_custom_themes") || "[]");
const themeSelector = document.getElementById("theme-selector");
const themeCustomNameInput = document.getElementById("theme-custom-name");

function renderThemeOptions() {
    const selected = localStorage.getItem("selected_theme") || "theme-dark";
    
    let html = `
        <option value="theme-dark" ${selected === 'theme-dark' ? 'selected' : ''}>Dark Mode (Default)</option>
        <option value="theme-light" ${selected === 'theme-light' ? 'selected' : ''}>Light Mode</option>
    `;
    
    customThemes.forEach(t => {
        html += `<option value="${t.id}" ${selected === t.id ? 'selected' : ''}>${t.name}</option>`;
    });
    
    themeSelector.innerHTML = html;
}

function applyTheme(themeId) {
    const root = document.documentElement;
    // Clear custom overrides from root first
    const props = ["--bg-dark", "--bg-card", "--accent", "--accent-hover", "--text-primary"];
    props.forEach(p => root.style.removeProperty(p));

    const custom = customThemes.find(t => t.id === themeId);
    
    if (custom) {
        document.body.className = "theme-custom";
        root.style.setProperty("--bg-dark", custom.colors.bg);
        root.style.setProperty("--bg-card", custom.colors.card);
        root.style.setProperty("--accent", custom.colors.accent);
        root.style.setProperty("--text-primary", custom.colors.text);
        root.style.setProperty("--accent-hover", custom.colors.accent + "dd");
    } else {
        document.body.className = themeId; // theme-light or theme-dark
    }
    
    localStorage.setItem("selected_theme", themeId);
    // Ensure dropdown matches
    themeSelector.value = themeId;

    // Update color pickers to match current theme
    // We use document.body because presets are applied there
    const style = getComputedStyle(document.body);
    
    const toHex = (color) => {
        if (color.startsWith('#')) return color;
        const rgb = color.match(/\d+/g);
        if (!rgb) return "#000000";
        return "#" + rgb.slice(0, 3).map(x => {
            const hex = parseInt(x).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("");
    };

    document.getElementById("theme-color-bg").value = toHex(style.getPropertyValue("--bg-dark").trim());
    document.getElementById("theme-color-card").value = toHex(style.getPropertyValue("--bg-card").trim());
    document.getElementById("theme-color-accent").value = toHex(style.getPropertyValue("--accent").trim());
    document.getElementById("theme-color-text").value = toHex(style.getPropertyValue("--text-primary").trim());
}

themeSelector.onchange = (e) => {
    applyTheme(e.target.value);
};

saveCustomThemeBtn.onclick = () => {
    const name = themeCustomNameInput.value.trim() || "Untitled Theme";
    const colors = {
        bg: document.getElementById("theme-color-bg").value,
        card: document.getElementById("theme-color-card").value,
        accent: document.getElementById("theme-color-accent").value,
        text: document.getElementById("theme-color-text").value,
    };
    
    const newTheme = {
        id: "custom-" + Date.now(),
        name,
        colors
    };
    
    customThemes.push(newTheme);
    localStorage.setItem("ai_todo_custom_themes", JSON.stringify(customThemes));
    
    applyTheme(newTheme.id);
    renderThemeOptions();
    themeCustomNameInput.value = "";
    themeModal.style.display = "none";
};

function initThemes() {
    renderThemeOptions();
    const saved = localStorage.getItem("selected_theme") || "theme-dark";
    applyTheme(saved);
}

openThemeBtn.onclick = () => { themeModal.style.display = "flex"; };
closeThemeBtn.onclick = () => { themeModal.style.display = "none"; };

saveTaskBtn.onclick = async () => {
    const title = taskTitleInput.value.trim();
    if (!title) {
        alert("Please enter a title");
        return;
    }

    const dueDateValue = taskDueInput.value;
    const due_date = dueDateValue ? new Date(dueDateValue).getTime() : null;

    const newTodo = {
        id: crypto.randomUUID(),
        title,
        description: taskDescInput.value.trim(),
        completed: false,
        priority: taskPriorityInput.value,
        tags: taskTagsInput.value.split(',').map(t => t.trim()).filter(t => t !== ""),
        created_at: Date.now(),
        due_date
    };

    await invoke("save_todo", { todo: newTodo });
    await loadTodos();
    closeTaskModal();
};

// --- AI Logic ---

const appendMessage = (role, content) => {
    const msg = document.createElement("div");
    msg.className = `message ${role}`;
    msg.innerText = content;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msg;
};

async function sendToAI() {
  const text = aiInput.value;
  if (!text) return;

  appendMessage("user", text);
  aiInput.value = "";
  aiInput.style.height = "auto"; // Reset height

  const now = new Date();
  const systemPrompt = `You are a productivity expert. Current local time: ${now.toLocaleString()}.
Current tasks:
${JSON.stringify(todos, null, 2)}

If the user wants to create, update, or delete a task, you MUST include a 'suggested_actions' array in your JSON response.
JSON SCHEMA:
{
  "message": "Conversational response",
  "suggested_actions": [
    { "type": "CreateTask", "data": { "title": "...", "description": "...", "priority": "High|Medium|Low", "tags": [], "due_date": "ISO8601 string or null" } },
    { "type": "UpdateTask", "data": { "id": "...", "completed": true, "due_date": "..." } },
    { "type": "DeleteTask", "data": "id" }
  ]
}
Always reply in valid JSON if actions are needed. Otherwise, just reply with a "message" field in JSON.`;

  try {
    const thinkingMsg = appendMessage("ai", "Assistant is thinking");
    thinkingMsg.classList.add("thinking", "thinking-msg");
    
    const rawResponse = await invoke("send_chat_message", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      eventName: "ai-response-token"
    });

    thinkingMsg.remove();

    try {
      const data = JSON.parse(rawResponse);
      if (data.message) appendMessage("ai", data.message);

      if (data.suggested_actions && Array.isArray(data.suggested_actions)) {
        for (const action of data.suggested_actions) {
          if (action.type === "CreateTask") {
            const due_date = action.data.due_date ? new Date(action.data.due_date).getTime() : null;
            const newTodo = {
              id: crypto.randomUUID(),
              title: action.data.title,
              description: action.data.description || "",
              completed: false,
              priority: action.data.priority || "Medium",
              tags: action.data.tags || [],
              created_at: Date.now(),
              due_date
            };
            await invoke("save_todo", { todo: newTodo });
          } else if (action.type === "UpdateTask") {
            const existing = todos.find(t => t.id === action.data.id);
            if (existing) {
              const updateData = { ...action.data };
              if (updateData.due_date) updateData.due_date = new Date(updateData.due_date).getTime();
              const updated = { ...existing, ...updateData };
              await invoke("save_todo", { todo: updated });
            }
          } else if (action.type === "DeleteTask") {
            await invoke("delete_todo", { id: action.data });
          }
        }
        await loadTodos();
      }
    } catch {
      appendMessage("ai", rawResponse);
    }
  } catch (e) {
    appendMessage("ai", "❌ AI server is offline. Select a model in the Forge.");
    console.error(e);
  }
}

// --- Model Logic ---

async function checkModelStatus() {
  cachedModels = await invoke("get_models_status");
  const active = cachedModels.find(m => m.info.id === currentModelId && m.installed);
  
  if (active) {
    aiStatusDot.style.background = "#10b981"; // green
    aiStatusText.innerText = "READY";
    aiModelName.innerText = `Connected to ${active.info.name}`;
    await invoke("start_llama_server", { customModelPath: active.path }).catch(() => {
        aiStatusDot.style.background = "#f59e0b"; // yellow error 
        aiStatusText.innerText = "ERROR";
        aiModelName.innerText = "Failed to start server";
    });
  } else {
    aiStatusDot.style.background = "#ef4444"; // red
    aiStatusText.innerText = "OFFLINE";
    aiModelName.innerText = "No model selected";
  }
  renderForge();
}

function renderForge() {
  forgeList.innerHTML = cachedModels.map(ms => {
    const isDownloading = downloadingModelId === ms.info.id;
    const isActive = currentModelId === ms.info.id && ms.installed;
    return `
      <div class="model-card">
        <div class="model-header">
          <div class="model-title">${ms.info.name} <span style="font-weight: 500; color: var(--text-muted); font-size: 0.8em; margin-left: 4px;">${ms.info.params}</span></div>
          <div class="model-size">${ms.info.size_gb.toFixed(1)} GB</div>
        </div>
        <div class="model-desc">${ms.info.description}</div>
        ${isDownloading ? `
          <div style="height: 6px; background: var(--border); border-radius: 4px; overflow: hidden; margin-top: 0.5rem;">
            <div id="progress-bar-${ms.info.id}" style="height: 100%; background: var(--primary); width: 0%; transition: width 0.3s ease;"></div>
          </div>
        ` : `
          <div class="model-actions">
            ${ms.installed ? `
              <button class="${isActive ? 'btn-success' : 'btn-outline'} select-model-btn" data-id="${ms.info.id}" ${isActive ? 'disabled style="opacity: 0.8; cursor: default;"' : ''}>
                ${isActive ? '<span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span> Selected' : 'Select'}
              </button>
              <button class="btn-outline delete-model-btn" data-id="${ms.info.id}" style="color: #ef4444; border-color: #fca5a5;">
                 <span class="material-symbols-outlined" style="font-size: 16px;">delete</span> Remove
              </button>
            ` : `
              <button class="btn-primary download-model-btn" data-id="${ms.info.id}">
                <span class="material-symbols-outlined" style="font-size: 16px;">download</span> Download
              </button>
            `}
          </div>
        `}
      </div>
    `;
  }).join('');

  forgeList.querySelectorAll('.download-model-btn').forEach(b => b.onclick = () => downloadModel(b.dataset.id));
  forgeList.querySelectorAll('.select-model-btn').forEach(b => b.onclick = () => selectModel(b.dataset.id));
  forgeList.querySelectorAll('.delete-model-btn').forEach(b => b.onclick = () => deleteModel(b.dataset.id));
}

async function downloadModel(id) {
  downloadingModelId = id;
  renderForge();
  try {
    await invoke("download_model", { modelId: id });
    downloadingModelId = null;
    await checkModelStatus();
  } catch (e) {
    alert("Download failed: " + e);
    downloadingModelId = null;
    renderForge();
  }
}

async function selectModel(id) {
  currentModelId = id;
  localStorage.setItem("ai_todo_model_id", id);
  await checkModelStatus();
  forgeModal.style.display = "none";
}

async function deleteModel(id) {
  if (confirm("Delete model?")) {
    await invoke("delete_downloaded_model", { modelId: id });
    if (currentModelId === id) { currentModelId = null; localStorage.removeItem("ai_todo_model_id"); }
    await checkModelStatus();
  }
}

// --- Event Wireup ---

document.getElementById("add-todo-btn")?.addEventListener("click", openTaskModal);
document.getElementById("close-task-btn")?.addEventListener("click", closeTaskModal);

if(openForgeBtn) {
    openForgeBtn.addEventListener("click", () => {
        forgeModal.style.display = "flex";
        renderForge();
        console.log("Opened Forge");
    });
}
if(closeForgeBtn) {
    closeForgeBtn.addEventListener("click", () => {
        forgeModal.style.display = "none";
    });
}

if(openThemeBtn) {
    openThemeBtn.addEventListener("click", () => {
        themeModal.style.display = "flex";
    });
}
if(closeThemeBtn) {
    closeThemeBtn.addEventListener("click", () => {
        themeModal.style.display = "none";
    });
}

if(sendBtn) {
    sendBtn.addEventListener("click", sendToAI);
}

aiInput.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = (this.scrollHeight) + "px";
  this.style.overflowY = this.scrollHeight > 200 ? "auto" : "hidden";
});

aiInput.onkeypress = (e) => { 
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToAI(); } 
};

listen("download-progress", (event) => {
  const { model_id, progress } = event.payload;
  const bar = document.getElementById(`progress-bar-${model_id}`);
  if (bar) bar.style.width = `${progress}%`;
});

// --- Init ---
loadTodos();
checkModelStatus();
initThemes();
