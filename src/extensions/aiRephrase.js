import { StateEffect } from "@codemirror/state";

import { ViewPlugin } from "@codemirror/view";

// ===============
// Utility to create DOM elements with props and children
// ===============

function createElement(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (key === "style" && typeof val === "object") {
      Object.assign(el.style, val);
    } else if (key.startsWith("on") && typeof val === "function") {
      el.addEventListener(key.substring(2).toLowerCase(), val);
    } else if (key === "textContent") {
      el.textContent = val;
    } else {
      el.setAttribute(key, val);
    }
  }
  children.forEach(child => el.appendChild(child));
  return el;
}

// ===============
// Modal Creation Functions
// ===============

function createSettingsModal() {
  const modal = createElement("div", {
    id: "ollama-ai-rephrase-settings-modal",
    style: {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.4)",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "9999",
      fontFamily: "system-ui, sans-serif",
    },
  });

  const content = createElement("div", {
    style: {
      background: "white",
      borderRadius: "10px",
      padding: "16px",
      minWidth: "320px",
      maxWidth: "600px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    },
  });

  modal.appendChild(content);
  document.body.appendChild(modal);

  // Create UI controls inside content:

  // Prompt textarea
  const textarea = createElement("textarea", {
    rows: 4,
    style: {
      height: "100px",
      fontFamily: "system-ui",
      fontSize: "14px",
      resize: "vertical",
      padding: "6px",
    },
    spellcheck: "false",
  });
  content.appendChild(textarea);

  // Model selection row
  const modelRow = createElement("div", {
    style: { display: "flex", alignItems: "center", gap: "8px" },
  });
  const modelLabel = createElement("label", {
    textContent: "Model:",
    style: { minWidth: "70px" },
  });
  const modelSelect = createElement("select", { style: { flexGrow: "1" } });
  modelRow.appendChild(modelLabel);
  modelRow.appendChild(modelSelect);
  content.appendChild(modelRow);

  // Ollama host input row
  const hostRow = createElement("div", {
    style: { display: "flex", alignItems: "center", gap: "8px" },
  });
  const hostLabel = createElement("label", {
    textContent: "Ollama Host:",
    style: { minWidth: "70px" },
  });
  const hostInput = createElement("input", {
    type: "text",
    style: { flexGrow: "1", fontFamily: "system-ui", fontSize: "14px", padding: "6px" },
  });
  const closeButton = createElement("button", {
    textContent: "Close",
    type: "button",
    style: { flexShrink: "0", cursor: "pointer", padding: "6px 12px", width: "auto" },
  });
  hostRow.appendChild(hostLabel);
  hostRow.appendChild(hostInput);
  hostRow.appendChild(closeButton);
  content.appendChild(hostRow);

  // Error message area
  const errorMsg = createElement("div", {
    style: { color: "red", fontWeight: "bold", minHeight: "1.2em" },
  });
  content.appendChild(errorMsg);

  // Load / Save keys
  const PROMPT_KEY = "ollama-rephrase-prompt";
  const MODEL_KEY = "ollama-last-model";
  const HOST_KEY = "ollama-host";

  // Defaults
  const defaultPrompt =
    "Paraphrase the highlighted text by rewriting it without significantly changing its length. Try to keep the original meaning and details intact while making the text clearer, more informative, and easier to understand.";
  textarea.value = localStorage.getItem(PROMPT_KEY) || defaultPrompt;
  hostInput.value = localStorage.getItem(HOST_KEY) || "http://localhost:11434";

  // Model list fetching and population
  function fetchModels() {
    errorMsg.textContent = "";
    modelSelect.innerHTML = "";
    const host = hostInput.value.trim();
    if (!host) {
      errorMsg.textContent = "Please enter a valid Ollama host URL.";
      return;
    }
    fetch(`${host}/api/tags`)
      .then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!data.models || !Array.isArray(data.models)) {
          throw new Error("Invalid model list response");
        }
        data.models.forEach(m => {
          const option = createElement("option", { value: m.name, textContent: m.name });
          modelSelect.appendChild(option);
        });
        const savedModel = localStorage.getItem(MODEL_KEY);
        if (savedModel && [...modelSelect.options].some(o => o.value === savedModel)) {
          modelSelect.value = savedModel;
        } else if (modelSelect.options.length > 0) {
          modelSelect.selectedIndex = 0;
        }
      })
      .catch(err => {
        errorMsg.textContent = "Failed to fetch models from Ollama: " + err.message;
      });
  }

  fetchModels();

  // Save to localStorage on changes
  textarea.addEventListener("input", () => localStorage.setItem(PROMPT_KEY, textarea.value));
  modelSelect.addEventListener("change", () => localStorage.setItem(MODEL_KEY, modelSelect.value));
  hostInput.addEventListener("input", () => {
    localStorage.setItem(HOST_KEY, hostInput.value);
    // Re-fetch models on host change (debounce)
    clearTimeout(hostInput._fetchTimeout);
    hostInput._fetchTimeout = setTimeout(fetchModels, 800);
  });

  // Close modal handler
  function closeModal() {
    modal.style.display = "none";
    errorMsg.textContent = "";
  }
  closeButton.addEventListener("click", closeModal);

  // Close modal on outside click
  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });

  // Close on Escape key
  function onKeyDown(e) {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", onKeyDown);
    }
  }
  modal.addEventListener("mousedown", () => {
    document.addEventListener("keydown", onKeyDown);
  });

  return {
    modal,
    getValues: () => ({
      prompt: textarea.value,
      model: modelSelect.value,
      host: hostInput.value,
    }),
    show: () => {
      modal.style.display = "flex";
      textarea.focus();
    },
    hide: closeModal,
  };
}

function createWaitModal() {
  const modal = createElement("div", {
    id: "ollama-ai-rephrase-wait-modal",
    style: {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.4)",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10000",
      fontFamily: "system-ui, sans-serif",
    },
  });

  const content = createElement("div", {
    style: {
      background: "white",
      borderRadius: "10px",
      padding: "20px 30px",
      minWidth: "240px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      fontSize: "16px",
      textAlign: "center",
    },
    textContent: "Wait for rephrase to complete...",
  });

  modal.appendChild(content);
  document.body.appendChild(modal);

  return {
    modal,
    show: () => (modal.style.display = "flex"),
    hide: () => (modal.style.display = "none"),
  };
}

// ===============
// Modal Instances
// ===============
const settingsModal = createSettingsModal();
const waitModal = createWaitModal();

// ===============
// Run Rephrase function
// ===============
async function runAIRephrase(view) {
  const { prompt, model, host } = settingsModal.getValues();

  const state = view.state;
  const selection = state.selection.main;
  const selectedText = state.sliceDoc(selection.from, selection.to);

  if (!selectedText.trim()) {
    alert("No text selected for rephrasing.");
    return;
  }
  if (!prompt.trim() || !model || !host.trim()) {
    alert("Missing settings. Please configure in settings popup.");
    return;
  }

  waitModal.show();

  try {
    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `${prompt}\n\n${selectedText}`,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();

    if (data.response) {
      const clean = data.response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: clean },
      });
    }
  } catch (err) {
    alert("AI Rephrase failed: " + err.message);
  } finally {
    waitModal.hide();
  }
}

// ===============
// StateEffect triggers & Plugin
// ===============


const showSettingsEffect = StateEffect.define();
const runRephraseEffect = StateEffect.define();

const aiRephrasePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
    }
    update(update) {
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(showSettingsEffect)) {
            settingsModal.show();
          } else if (e.is(runRephraseEffect)) {
            runAIRephrase(this.view);
          }
        }
      }
    }
  }
);

// ===============
// Exported API
// ===============
export function showAIRephrasePopup(view, options = {}) {
  const { type = "settings" } = options;
  if (type === "settings") {
    view.v.dispatch({ effects: showSettingsEffect.of(null) });
  } else if (type === "rephrase") {
    view.v.dispatch({ effects: runRephraseEffect.of(null) });
  }
}

export const aiRephraseExtension = [aiRephrasePlugin];
