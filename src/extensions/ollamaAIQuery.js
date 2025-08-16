import { StateEffect } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";

class OllamaPopupWidget extends WidgetType {
  constructor(editorView, from, to) {
    super();
    this.editorView = editorView;
    this.from = from;
    this.to = to;
    this.abortController = null;
    this.responseHistory = [];
    this.currentIndex = -1;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.id = "ollama-ai";
    wrapper.style.position = "relative";
    wrapper.style.minWidth = "200px";
    wrapper.style.background = "white";
    wrapper.style.border = "1px solid #ccc";
    wrapper.style.boxShadow = "0 4px 10px rgba(0,0,0,0.1)";
    wrapper.style.padding = "10px";
    wrapper.style.borderRadius = "8px";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "8px";

    // Prevent editor interaction
    wrapper.addEventListener("mousedown", e => e.stopPropagation());
    wrapper.addEventListener("keydown", e => e.stopPropagation());

    const selectionText = this.editorView.state.sliceDoc(this.from, this.to);

    // --- Create prompt textarea ---
    const promptInput = document.createElement("textarea");
    promptInput.rows = 2;
    promptInput.placeholder = "Enter prompt...";
    promptInput.style.fontFamily = "system-ui";
    promptInput.style.resize = "vertical";
    promptInput.style.fontSize = "13px";
    promptInput.style.padding = "2px";

    // --- Model select ---
    const modelSelect = document.createElement("select");
    modelSelect.style.fontFamily = "system-ui";

    // --- Buttons ---
    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "Stop";
    stopBtn.style.display = "none";

    // --- Response textarea ---
    const responseArea = document.createElement("textarea");
    responseArea.rows = 6;
    responseArea.readOnly = true;
    responseArea.style.fontFamily = "system-ui";
    responseArea.style.resize = "vertical";
    responseArea.style.overflowY = "auto";
    responseArea.style.fontSize = "13px";
    responseArea.style.padding = "2px";
    responseArea.style.color = "#999";

    // --- History nav ---
    const navDiv = document.createElement("div");
    navDiv.style.display = "flex";
    navDiv.style.justifyContent = "left";
    navDiv.style.alignItems = "center";
    navDiv.style.gap = "10px";

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "<";
    const nextBtn = document.createElement("button");
    nextBtn.textContent = ">";
    const modelLabel = document.createElement("span");
    modelLabel.style.fontFamily = "system-ui";

    navDiv.append(prevBtn, nextBtn, modelLabel);

    // --- Host input and bottom buttons ---
    const bottomDiv = document.createElement("div");
    bottomDiv.style.display = "flex";
    bottomDiv.style.alignItems = "center";
    bottomDiv.style.justifyContent = "space-between";
    bottomDiv.style.gap = "6px";

    const hostInput = document.createElement("input");
    hostInput.type = "text";
    hostInput.style.flex = "1";
    hostInput.style.fontFamily = "system-ui";
    hostInput.style.fontSize = "12px";
    hostInput.style.padding = "4px";

    const addBtn = document.createElement("button");
    addBtn.textContent = "Add";
    const insertBtn = document.createElement("button");
    insertBtn.textContent = "Insert";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";

    bottomDiv.append(hostInput, addBtn, insertBtn, closeBtn);

    wrapper.append(promptInput, modelSelect, sendBtn, stopBtn, responseArea, navDiv, bottomDiv);

    // --- JS logic ---
    const defaultHost = "http://localhost:11434";
    let ollamaHost = localStorage.getItem("ollama-host") || defaultHost;
    hostInput.value = ollamaHost;

    const models = [];
    let model = localStorage.getItem("ollama-last-model") || "";

    // Fetch models
    fetch(`${ollamaHost}/api/tags`)
      .then(res => res.json())
      .then(data => {
        data.models.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          modelSelect.append(opt);
        });
        const saved = localStorage.getItem("ollama-last-model");
        modelSelect.value = saved && data.models.map(m => m.name).includes(saved) ? saved : data.models[0].name;
        model = modelSelect.value;
      })
      .catch(err => console.error(err));

    // --- Event handlers ---
    modelSelect.addEventListener("change", () => {
      model = modelSelect.value;
      localStorage.setItem("ollama-last-model", model);
    });

    hostInput.addEventListener("change", () => {
      ollamaHost = hostInput.value.trim();
      localStorage.setItem("ollama-host", ollamaHost);
    });

    sendBtn.addEventListener("click", async () => {
      if (!promptInput.value.trim()) {
        responseArea.value = "⚠️ Prompt is empty.";
        return;
      }
      sendBtn.style.display = "none";
      stopBtn.style.display = "inline";
      responseArea.value = "";
      responseArea.style.color = "black";

      const controller = new AbortController();
      this.abortController = controller;
      let fullResponse = "";

      try {
        const res = await fetch(`${ollamaHost}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: `${promptInput.value}\n\n${selectionText}`, stream: true }),
          signal: controller.signal
        });

        if (!res.ok || !res.body) {
          const text = await res.text();
          responseArea.value = `❌ Ollama error: ${res.status} - ${text}`;
          sendBtn.style.display = "inline";
          stopBtn.style.display = "none";
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        const read = async () => {
          const { value, done } = await reader.read();
          if (done) {
            const cleanResponse = fullResponse.trim();
            this.responseHistory.push({ model, text: cleanResponse });
            this.currentIndex = this.responseHistory.length - 1;
            modelLabel.textContent = `${this.currentIndex + 1}: ${model}`;
            sendBtn.style.display = "inline";
            stopBtn.style.display = "none";
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          lines.forEach(line => {
            if (!line.trim()) return;
            try {
              const json = JSON.parse(line);
              if (json.response) {
                fullResponse += json.response;
                responseArea.value = fullResponse;
              }
            } catch {}
          });
          await read();
        };
        await read();
      } catch (err) {
        if (err.name === "AbortError") {
          responseArea.value += "\n⛔ Request aborted.";
        } else {
          console.error(err);
          responseArea.value = "❌ Failed to connect to Ollama.";
        }
        sendBtn.style.display = "inline";
        stopBtn.style.display = "none";
      }
    });

    stopBtn.addEventListener("click", () => {
      this.abortController?.abort();
      sendBtn.style.display = "inline";
      stopBtn.style.display = "none";
    });

    insertBtn.addEventListener("click", () => {
      const clean = responseArea.value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      this.editorView.dispatch({ changes: { from: this.from, to: this.to, insert: clean } });
      closePopup(this.editorView);
    });

    addBtn.addEventListener("click", () => {
      const clean = responseArea.value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const textBefore = this.editorView.state.sliceDoc(this.from, this.to);
      this.editorView.dispatch({ changes: { from: this.from, to: this.to, insert: textBefore + " " + clean } });
      closePopup(this.editorView);
    });

    closeBtn.addEventListener("click", () => closePopup(this.editorView));

    prevBtn.addEventListener("click", () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        responseArea.value = this.responseHistory[this.currentIndex].text;
        modelLabel.textContent = `${this.currentIndex + 1}: ${this.responseHistory[this.currentIndex].model}`;
      }
    });

    nextBtn.addEventListener("click", () => {
      if (this.currentIndex < this.responseHistory.length - 1) {
        this.currentIndex++;
        responseArea.value = this.responseHistory[this.currentIndex].text;
        modelLabel.textContent = `${this.currentIndex + 1}: ${this.responseHistory[this.currentIndex].model}`;
      }
    });

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

// --- Popup plugin and effects ---
const addPopupEffect = StateEffect.define();
const closePopupEffect = StateEffect.define();
let popupOffset = null;

const ollamaPopupPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.decorations = Decoration.none;
  }

  update(update) {
    let needsRedraw = false;

    for (let tr of update.transactions) {
      for (let e of tr.effects) {
        if (e.is(addPopupEffect)) {
          const sel = update.state.selection.main;
          popupOffset = sel.to;
          const deco = Decoration.widget({
            widget: new OllamaPopupWidget(this.view, sel.from, sel.to),
            side: 1
          }).range(popupOffset);
          this.decorations = Decoration.set([deco]);
          needsRedraw = true;
        } else if (e.is(closePopupEffect)) {
          this.decorations = Decoration.none;
          popupOffset = null;
          needsRedraw = true;
        }
      }
    }

    if (update.docChanged && popupOffset !== null) {
      const newOffset = update.changes.mapPos(popupOffset);
      popupOffset = newOffset;
      const sel = update.state.selection.main;
      const deco = Decoration.widget({
        widget: new OllamaPopupWidget(this.view, sel.from, sel.to),
        side: 1
      }).range(newOffset);
      this.decorations = Decoration.set([deco]);
      needsRedraw = true;
    }

    if (needsRedraw) this.view.requestMeasure();
  }

  destroy() {}
}, {
  decorations: v => v.decorations
});

export const ollamaExtension = [ollamaPopupPlugin];

export function showOllamaPopup(view) {
  view.v.dispatch({ effects: addPopupEffect.of(null) });
}

function closePopup(view) {
  view.dispatch({ effects: closePopupEffect.of(null) });
}
