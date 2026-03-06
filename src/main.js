const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let todos = [];
let cachedModels = [];
let downloadingModelId = null;
let currentModelId = localStorage.getItem("ai_todo_model_id");
let currentEditId = null;
let currentFilter = "inbox";
let sortByPriority = false;
let sortByAlpha = false;

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

const viewTaskModal = document.getElementById("view-task-modal");
const closeViewBtn = document.getElementById("close-view-btn");
const viewTaskTitle = document.getElementById("view-task-title");
const viewTaskMeta = document.getElementById("view-task-meta");
const viewTaskDesc = document.getElementById("view-task-desc");
const viewTaskEditBtn = document.getElementById("view-task-edit-btn");
let currentViewId = null;

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

function updateBadges() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startOfToday = now.getTime();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  let inboxCount = 0;
  let todayCount = 0;
  let upcomingCount = 0;
  let missedCount = 0;
  let completedCount = 0;

  todos.forEach(t => {
      if (t.completed) {
          completedCount++;
      } else {
          inboxCount++; // Inbox contains absolutely all incomplete tasks
          
          if (t.due_date) {
            if (t.due_date < startOfToday) {
                missedCount++;
            } else if (t.due_date >= startOfToday && t.due_date <= endOfToday.getTime()) {
                todayCount++;
            } else {
                upcomingCount++;
            }
          }
      }
  });

  document.getElementById("badge-inbox").innerText = inboxCount;
  document.getElementById("badge-today").innerText = todayCount;
  document.getElementById("badge-upcoming").innerText = upcomingCount;
  document.getElementById("badge-missed").innerText = missedCount;
  document.getElementById("badge-completed").innerText = completedCount;
}

function renderTodos() {
  updateBadges();

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startOfToday = now.getTime();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  let filteredTodos = todos.filter(todo => {
      if (currentFilter === "completed") return todo.completed;
      if (todo.completed) return false;

      if (currentFilter === "inbox") return true;
      if (currentFilter === "missed") return todo.due_date && todo.due_date < startOfToday;
      if (currentFilter === "today") return todo.due_date && todo.due_date >= startOfToday && todo.due_date <= endOfToday.getTime();
      if (currentFilter === "upcoming") return todo.due_date && todo.due_date > endOfToday.getTime();
      return true;
  });

  if (sortByPriority) {
      const priorityLevels = { 'High': 3, 'Medium': 2, 'Low': 1 };
      filteredTodos = filteredTodos.sort((a, b) => {
          const valA = priorityLevels[a.priority] || 0;
          const valB = priorityLevels[b.priority] || 0;
          return sortByPriority === 'desc' ? (valB - valA) : (valA - valB);
      });
  } else if (sortByAlpha) {
      filteredTodos = filteredTodos.sort((a, b) => {
          return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      });
  }

  if (filteredTodos.length === 0) {
      todoContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">No tasks found for this view.</div>`;
      return;
  }

  todoContainer.innerHTML = filteredTodos.map((todo, index) => {
    let dueStr = null;
    if (todo.due_date) {
        const dObj = new Date(todo.due_date);
        const isOverdue = dObj.getTime() < now.getTime();
        const isToday = dObj.getTime() >= now.getTime() && dObj.getTime() <= endOfToday.getTime();
        
        if (isToday) {
            dueStr = "Today";
        } else if (isOverdue) {
            dueStr = "Overdue";
        } else {
            dueStr = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
    }
    
    const isMagic = todo.tags.some(t => t.toLowerCase() === 'magic' || t.toLowerCase() === 'ai');

    return `
      <div class="task-item ${isMagic ? 'magic-task' : ''} ${todo.completed ? 'opacity-50 grayscale' : ''}">
        <div class="custom-checkbox ${todo.completed ? 'checked' : ''}" onclick="toggleTodo('${todo.id}')"></div>
        
        <div style="flex: 1; display: flex; align-items: center; gap: 2rem; cursor: pointer; padding: 4px 0;" onclick="viewTodo('${todo.id}')">
          <div style="min-width: 300px; max-width: 400px; display: flex; flex-direction: column;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1rem; font-weight: 500; ${todo.completed ? 'text-decoration: line-through' : ''}">${todo.title}</span>
              ${isMagic ? `<span class="magic-badge"><span class="material-symbols-outlined" style="font-size: 12px; font-variation-settings: 'FILL' 1;">magic_button</span> Magic</span>` : ''}
            </div>
            
            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 4px;">
              ${dueStr ? `
                <span style="font-size: 0.75rem; color: #64748b; display: flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 14px;">schedule</span> Due ${dueStr}
                </span>
              ` : ''}
              
              <span style="font-size: 0.75rem; font-weight: 700;" class="prio-${todo.priority.toLowerCase()}">
                 ${todo.priority.toUpperCase()}
              </span>

              ${todo.tags.filter(t => !['magic','ai'].includes(t.toLowerCase())).map(tag => `
                <span style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 14px;">sell</span> ${tag}
                </span>
              `).join('')}
            </div>
          </div>
          
          <div style="flex: 1; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; mix-blend-mode: multiply; opacity: 0.8;">
            ${todo.description || ''}
          </div>
        </div>

        <div style="display: flex; gap: 0.25rem;">
           <button class="btn-ghost" onclick="editTodo('${todo.id}')" title="Edit"><span class="material-symbols-outlined">edit</span></button>
           <button class="btn-ghost" onclick="deleteTodo('${todo.id}')" title="Delete"><span class="material-symbols-outlined text-error">delete</span></button>
        </div>
      </div>
      ${index < filteredTodos.length - 1 ? '<div style="height: 1px; background: var(--border); margin: 0.25rem 1rem; opacity: 0.5;"></div>' : ''}
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
    currentEditId = null;
    document.getElementById("task-modal-title").innerText = "New Task";
    saveTaskBtn.innerText = "Create Task";
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
    currentEditId = null;
};

window.editTodo = (id) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    currentEditId = id;
    document.getElementById("task-modal-title").innerText = "Edit Task";
    saveTaskBtn.innerText = "Save Changes";
    
    taskTitleInput.value = todo.title;
    taskDescInput.value = todo.description || "";
    taskPriorityInput.value = todo.priority;
    if (todo.due_date) {
        const dateObj = new Date(todo.due_date);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        taskDueInput.value = `${year}-${month}-${day}`;
    } else {
        taskDueInput.value = "";
    }
    taskTagsInput.value = todo.tags.join(", ");
    
    taskModal.style.display = "flex";
    taskTitleInput.focus();
};

window.viewTodo = (id) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    currentViewId = id;
    viewTaskTitle.innerText = todo.title;
    viewTaskDesc.innerText = todo.description || "No description provided.";
    
    let metaHtml = "";
    if (todo.due_date) {
        const dueStr = new Date(todo.due_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        metaHtml += `<span style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; background: var(--bg-card); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px;"><span class="material-symbols-outlined" style="font-size: 14px;">calendar_today</span> ${dueStr}</span>`;
    }
    
    metaHtml += `<span style="font-size: 0.75rem; font-weight: 700; padding: 4px 8px; border-radius: 6px;" class="prio-badge-${todo.priority.toLowerCase()}">${todo.priority.toUpperCase()}</span>`;
    
    todo.tags.forEach(tag => {
        metaHtml += `<span style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; background: var(--bg-card); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px;"><span class="material-symbols-outlined" style="font-size: 14px;">sell</span> ${tag}</span>`;
    });
    
    viewTaskMeta.innerHTML = metaHtml;
    viewTaskModal.style.display = "flex";
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
    const props = ["--bg-app", "--bg-sidebar", "--bg-card", "--primary", "--text-main", "--text-inverse"];
    props.forEach(p => root.style.removeProperty(p));

    const custom = customThemes.find(t => t.id === themeId);
    
    if (custom) {
        document.body.className = "theme-custom";
        root.style.setProperty("--bg-app", custom.colors.bg);
        root.style.setProperty("--bg-sidebar", custom.colors.card); // sidebar matches card in custom by default
        root.style.setProperty("--bg-card", custom.colors.card);
        root.style.setProperty("--primary", custom.colors.accent);
        root.style.setProperty("--text-main", custom.colors.text);
    } else {
        document.body.className = themeId; // theme-light or theme-dark
    }
    
    localStorage.setItem("selected_theme", themeId);
    themeSelector.value = themeId;

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

    document.getElementById("theme-color-bg").value = toHex(style.getPropertyValue("--bg-app").trim() || '#ffffff');
    document.getElementById("theme-color-card").value = toHex(style.getPropertyValue("--bg-card").trim() || '#ffffff');
    document.getElementById("theme-color-accent").value = toHex(style.getPropertyValue("--primary").trim() || '#1717cf');
    document.getElementById("theme-color-text").value = toHex(style.getPropertyValue("--text-main").trim() || '#000000');
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

    let due_date = null;
    if (taskDueInput.value) {
        const [y, m, d] = taskDueInput.value.split('-');
        const dateObj = new Date(y, m - 1, d);
        // Store as midnight properly local time
        due_date = dateObj.getTime();
    }

    if (currentEditId) {
        const existing = todos.find(t => t.id === currentEditId);
        if (existing) {
            existing.title = title;
            existing.description = taskDescInput.value.trim();
            existing.priority = taskPriorityInput.value;
            existing.tags = taskTagsInput.value.split(',').map(t => t.trim()).filter(t => t !== "");
            existing.due_date = due_date;
            await invoke("save_todo", { todo: existing });
        }
    } else {
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
    }

    currentEditId = null;
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
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' };
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISO = new Date(now - tzOffset).toISOString().split('T')[0];

  const systemPrompt = `You are a productivity AI.
Current Date/Time: ${now.toLocaleString(undefined, options)}
Today's Date: ${localISO}

Current tasks:
${JSON.stringify(todos.map(t => ({id: t.id, title: t.title, completed: t.completed})), null, 2)}

OUTPUT FORMAT RULES:
You must ALWAYS respond with ONLY valid JSON matching this exact structure:
{
  "message": "A brief conversational reply.",
  "suggested_actions": [
    {
      "type": "CreateTask",
      "data": {
        "title": "Task title",
        "description": "Any requested description or null",
        "priority": "High|Medium|Low",
        "tags": [],
        "due_date": "YYYY-MM-DD or null"
      }
    },
    { "type": "UpdateTask", "data": { "id": "task_id", "completed": true } },
    { "type": "DeleteTask", "data": "task_id" }
  ]
}

CRITICAL RULES:
1. "title" MUST BE derived exactly from the user's request. Do NOT embellish, reword, or add extra context.
2. "description" MUST ALWAYS BE EMPTY ("") unless the user explicitly gave you a long paragraph to use as a description. Do NOT invent descriptions!
3. "due_date" MUST BE exactly "YYYY-MM-DD" based on counting days from Today (${localISO}). If no date is mentioned, use "".
4. Return ONLY valid JSON. No markdown formatting.

EXAMPLE:
User: Add a task to buy groceries 3 days from now priority high
Assistant: {"message": "I have added a task to buy groceries in 3 days.", "suggested_actions": [{"type": "CreateTask", "data": {"title": "Buy groceries", "description": "", "priority": "High", "tags": ["groceries"], "due_date": "2026-03-09"}}]}
`;

  try {
    const thinkingMsg = appendMessage("ai", "Assistant is thinking");
    thinkingMsg.classList.add("thinking", "thinking-msg");
    
    const rawResponse = await invoke("send_chat_message", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text + "\n\nRespond ONLY with valid JSON." }
      ],
      eventName: "ai-response-token"
    });

    thinkingMsg.remove();

    try {
      let jsonString = rawResponse.trim();
      // Remove any markdown code block wrappings that small LLMs might output
      if (jsonString.startsWith("```json")) {
          jsonString = jsonString.slice(7).trim();
          if (jsonString.endsWith("```")) {
              jsonString = jsonString.slice(0, -3).trim();
          }
      } else if (jsonString.startsWith("```")) {
          jsonString = jsonString.slice(3).trim();
          if (jsonString.endsWith("```")) {
              jsonString = jsonString.slice(0, -3).trim();
          }
      }

      const data = JSON.parse(jsonString);
      if (data.message) appendMessage("ai", data.message);

      if (data.suggested_actions && Array.isArray(data.suggested_actions)) {
        for (const action of data.suggested_actions) {
          if (action.type === "CreateTask") {
            let due_date = null;
            if (action.data.due_date && typeof action.data.due_date === 'string' && action.data.due_date.trim() !== "null") {
                const val = action.data.due_date.trim();
                // Attempt to parse YYYY-MM-DD safely into local midnight
                if (val.length >= 10) { 
                    const [y, m, d] = val.substring(0, 10).split('-');
                    if (y && m && d) {
                        due_date = new Date(y, m - 1, d).getTime();
                    } else {
                        due_date = new Date(val).getTime(); // fallback
                    }
                } else {
                    due_date = new Date(val).getTime();
                }
                
                if (isNaN(due_date)) due_date = null;
            }

            let processedDesc = action.data.description || "";
            if (processedDesc.toLowerCase() === "null") processedDesc = "";

            const newTodo = {
              id: crypto.randomUUID(),
              title: action.data.title,
              description: processedDesc,
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
              if (updateData.due_date && typeof updateData.due_date === 'string' && updateData.due_date.trim() !== "null") {
                  const val = updateData.due_date.trim();
                  let newTime = null;
                  if (val.length >= 10) {
                      const [y, m, d] = val.substring(0, 10).split('-');
                      if (y && m && d) {
                          newTime = new Date(y, m - 1, d).getTime();
                      } else {
                          newTime = new Date(val).getTime();
                      }
                  } else {
                      newTime = new Date(val).getTime();
                  }
                  updateData.due_date = isNaN(newTime) ? null : newTime;
              } else if (updateData.due_date === null || updateData.due_date === "null") {
                  updateData.due_date = null;
              }
              const updated = { ...existing, ...updateData };
              await invoke("save_todo", { todo: updated });
            }
          } else if (action.type === "DeleteTask") {
            await invoke("delete_todo", { id: action.data });
          }
        }
        await loadTodos();
      }
    } catch (parseError) {
      console.error("Failed to parse AI JSON response. Raw string from AI:", rawResponse, parseError);
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

function setFilter(filterName, title) {
    currentFilter = filterName;
    
    // Update active class on nav items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
        item.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 0";
    });
    
    const activeItem = document.getElementById(`nav-${filterName}`);
    if (activeItem) {
        activeItem.classList.add('active');
        activeItem.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
    }
    
    // Update Main Title
    document.getElementById("main-header-title").innerText = title;
    
    renderTodos();
}

document.getElementById("nav-inbox")?.addEventListener("click", () => setFilter("inbox", "Inbox"));
document.getElementById("nav-today")?.addEventListener("click", () => setFilter("today", "Today"));
document.getElementById("nav-upcoming")?.addEventListener("click", () => setFilter("upcoming", "Upcoming"));
document.getElementById("nav-missed")?.addEventListener("click", () => setFilter("missed", "Missed"));
document.getElementById("nav-completed")?.addEventListener("click", () => setFilter("completed", "Completed"));

document.getElementById("add-todo-btn")?.addEventListener("click", openTaskModal);
document.getElementById("close-task-btn")?.addEventListener("click", closeTaskModal);

const filterPriorityBtn = document.getElementById("filter-priority-btn");
const sortAlphaBtn = document.getElementById("sort-alpha-btn");

if (filterPriorityBtn) {
    filterPriorityBtn.addEventListener("click", () => {
        if (!sortByPriority) {
            sortByPriority = 'desc';
        } else if (sortByPriority === 'desc') {
            sortByPriority = 'asc';
        } else {
            sortByPriority = false;
        }

        const b1 = document.getElementById("prio-bar-1");
        const b2 = document.getElementById("prio-bar-2");
        const b3 = document.getElementById("prio-bar-3");

        if (sortByPriority) {
            sortByAlpha = false;
            filterPriorityBtn.style.backgroundColor = "var(--bg-sidebar)";
            if (sortAlphaBtn) {
                sortAlphaBtn.style.color = "var(--text-secondary)";
                sortAlphaBtn.style.backgroundColor = "transparent";
            }
            
            if (sortByPriority === 'desc') {
                if (b1) b1.style.fill = "var(--error)";
                if (b2) b2.style.fill = "var(--warning)";
                if (b3) b3.style.fill = "var(--success)";
            } else {
                if (b1) b1.style.fill = "var(--success)";
                if (b2) b2.style.fill = "var(--warning)";
                if (b3) b3.style.fill = "var(--error)";
            }
        } else {
            filterPriorityBtn.style.backgroundColor = "transparent";
            if (b1) b1.style.fill = "";
            if (b2) b2.style.fill = "";
            if (b3) b3.style.fill = "";
        }
        renderTodos();
    });
}

if (sortAlphaBtn) {
    sortAlphaBtn.addEventListener("click", () => {
        sortByAlpha = !sortByAlpha;
        if (sortByAlpha) {
            sortByPriority = false;
            sortAlphaBtn.style.color = "var(--primary)";
            sortAlphaBtn.style.backgroundColor = "var(--bg-sidebar)";
            if (filterPriorityBtn) {
                filterPriorityBtn.style.color = "var(--text-secondary)";
                filterPriorityBtn.style.backgroundColor = "transparent";
                const b1 = document.getElementById("prio-bar-1");
                const b2 = document.getElementById("prio-bar-2");
                const b3 = document.getElementById("prio-bar-3");
                if (b1) b1.style.fill = "";
                if (b2) b2.style.fill = "";
                if (b3) b3.style.fill = "";
            }
        } else {
            sortAlphaBtn.style.color = "var(--text-secondary)";
            sortAlphaBtn.style.backgroundColor = "transparent";
        }
        renderTodos();
    });
}

if (closeViewBtn) {
    closeViewBtn.addEventListener("click", () => {
        viewTaskModal.style.display = "none";
    });
}
if (viewTaskEditBtn) {
    viewTaskEditBtn.addEventListener("click", () => {
        viewTaskModal.style.display = "none";
        if (currentViewId) {
            editTodo(currentViewId);
        }
    });
}

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
