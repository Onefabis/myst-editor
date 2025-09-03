import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";

/*
Helper function for creating DOM elements.
What it does:
- Creates an HTML element with a specified tag name.
- Applies attributes, event listeners, and classes from the `props` object.
- Appends any provided child elements.
*/
function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "className") e.className = v;
    else if (k.startsWith("on") && typeof v === "function")
      e.addEventListener(k.substring(2).toLowerCase(), v);
    else if (k === "textContent") e.textContent = v;
    else e.setAttribute(k, v);
  });
  children.forEach(c => e.appendChild(c));
  return e;
}

/*
Creates and manages the "Settings" modal for configuring AI rephrase parameters.
This user setting are saved in cache.
This modal allows the user to set:
- Prompt template
- AI Ollama model name
- Host server URL, default one is: http://localhost:11434

What it does:
- Builds the modal's DOM structure using `el`.
- Loads saved settings from `localStorage`.
- Fetches available models from the AI server.
- Saves updated settings to `localStorage` on change.
- Provides `.show()` method to make the modal visible.
*/
function createSettingsModal() {
  const modal = el("div", { className: "modal-overlay" });
  const content = el("div", { className: "modal-content" });

  modal.appendChild(content);
  document.body.appendChild(modal);

  const textarea = el("textarea", { rows: 4, className: "modal-textarea" });
  const modelSelect = el("select", { className: "modal-select" });
  const hostInput = el("input", { type: "text", className: "modal-input" });
  const closeBtn = el("button", { textContent: "Close", type: "button", className: "modal-close-btn" });

  const PROMPT_KEY = "ollama-rephrase-prompt";
  const MODEL_KEY = "ollama-last-model";
  const HOST_KEY = "ollama-host";

  textarea.value = localStorage.getItem(PROMPT_KEY) || "Paraphrase the highlighted text by rewriting it without significantly changing its length. Try to keep the original meaning and details intact while making the text clearer, more informative, and easier to understand.";
  hostInput.value = localStorage.getItem(HOST_KEY) || "http://localhost:11434";

  function fetchModels() {
    fetch(`${hostInput.value.trim()}/api/tags`)
      .then(r => r.json())
      .then(d => {
        modelSelect.innerHTML = "";
        (d.models || []).forEach(m => modelSelect.appendChild(el("option", { value: m.name, textContent: m.name })));
        modelSelect.value = localStorage.getItem(MODEL_KEY) || modelSelect.options[0]?.value;
      });
  }
  fetchModels();

  textarea.addEventListener("input", () => localStorage.setItem(PROMPT_KEY, textarea.value));
  modelSelect.addEventListener("change", () => localStorage.setItem(MODEL_KEY, modelSelect.value));
  hostInput.addEventListener("input", () => { localStorage.setItem(HOST_KEY, hostInput.value); fetchModels(); });

  content.appendChild(el("label", { textContent: "Prompt:" }));
  content.appendChild(textarea);
  content.appendChild(el("label", { textContent: "Model:" }));
  content.appendChild(modelSelect);
  content.appendChild(el("label", { textContent: "Host:" }));
  content.appendChild(hostInput);
  content.appendChild(closeBtn);

  closeBtn.onclick = () => modal.classList.remove("modal-overlay--visible");
  modal.onclick = e => { if (e.target === modal) modal.classList.remove("modal-overlay--visible"); };

  return {
    getValues: () => ({ prompt: textarea.value, model: modelSelect.value, host: hostInput.value }),
    show: () => { modal.classList.add("modal-overlay--visible"); textarea.focus(); }
  };
}
const settingsModal = createSettingsModal();

/*
Main class of interactive popup shown directly in the editor when the user triggers an AI rephrase action by RMB menu. 
It handles:
- Displaying AI-generated responses
- Navigating between multiple responses
- Retrying AI requests
- Inserting chosen response back into the editor, replacing the current seleciton
- Closing the popup
*/
class ResponsePopupWidget extends WidgetType {
  constructor(from, to, prompt, model, host, selectedText) {
    super();
    this.from = from; this.to = to;
    this.prompt = prompt; this.model = model; this.host = host;
    this.selectedText = selectedText;
    this.responses = [];
    this.index = 0;
    this.abortController = null;
  }

  /*
  Builds and returns the popup DOM.
  This is called by CodeMirror when rendering the decoration of the main 
  */
  toDOM(view) {
    const container = el("div", { className: "popup-container" });
    const textarea = el("textarea", {
      className: "popup-textarea",
      onfocus: () => textarea.classList.add("popup-textarea--focus"),
      onblur: () => textarea.classList.remove("popup-textarea--focus")
    });

    let autoScroll = true;
    textarea.addEventListener("scroll", () => {
      const nearBottom = (textarea.scrollHeight - textarea.scrollTop - textarea.clientHeight) < 10;
      autoScroll = nearBottom;
    });

    const controls = el("div", { className: "popup-controls" });
    const btnBase = "popup-btn";

    // ------------- Common attributes for SVG button icons ----------------- //
    const createSVG = (pathD, strokeColor = null) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", strokeColor || "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      svg.appendChild(path);
      return svg;
    };

    // ------------- Reprase bottom row buttons and elements START ----------------- //

    const prevBtn = el("button", {
      className: `${btnBase} popup-btn--purple`,
      onclick: () => {
        if (this.index > 0) {
          this.index--;
          textarea.value = this.responses[this.index];
          updateCounter();
        }
      }
    }, [createSVG("M15 18l-6-6 6-6", "purple")]);

    const counter = el("span", { className: "popup-counter", textContent: "0/0" });

    const nextBtn = el("button", {
      className: `${btnBase} popup-btn--purple`,
      onclick: () => {
        if (this.index < this.responses.length - 1) {
          this.index++;
          textarea.value = this.responses[this.index];
          updateCounter();
        }
      }
    }, [createSVG("M9 18l6-6-6-6", "purple")]);

    const retryBtn = el("button", {
      className: `${btnBase} popup-btn--orange`,
      onclick: () => this.fetchResponse(textarea, counter)
    }, [createSVG("M14 7 L9 5 l2.127 -1.276 A5.178 5.178 0 0 0 7.512 2.248 5.264 5.264 0 1 0 12.536 9 h1.289 a6.518 6.518 0 1 1 -1.6 -5.934 L14 2 V7 Z", "orange")]);

    const insertBtn = el("button", {
      className: `${btnBase} popup-btn--green`,
      onclick: () => {
        const clean = textarea.value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        view.dispatch({ changes: { from: this.from, to: this.to, insert: clean } });
        closePopup(view);
      }
    }, [createSVG("M20 6L9 17l-5-5", "green")]);

    const closeBtn = el("button", {
      className: `${btnBase} popup-btn--red`,
      onclick: () => closePopup(view)
    }, [createSVG("M18 6L6 18M6 6l12 12", "red")]);

    // ------------- Reprase bottom row buttons and elements END ----------------- //

    const left = el("div", { className: "controls-left" }, [prevBtn, counter, nextBtn]);
    const right = el("div", { className: "controls-right" }, [retryBtn, insertBtn, closeBtn]);

    controls.appendChild(left);
    controls.appendChild(right);

    container.appendChild(textarea);
    container.appendChild(controls);

    const updateCounter = () => {
      counter.textContent = `${this.index + 1}/${this.responses.length}`;
    };

    this.fetchResponse(textarea, counter);

    return container;
  }

  /*
  Fetching AI responses from the Ollama server: sends the prompt in settings window and selected text to the AI API.
  Receives and streams the response in real-time. Updates the popup textarea live as text arrives.
  Stores responses so the user can navigate back/forth and choos one to insert
  */
  async fetchResponse(textarea, counter) {
    textarea.value = "";
    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt: `${this.prompt}\n\n${this.selectedText}`, stream: true })
    });

    const reader = res.body.getReader();
    let full = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      try {
        const json = JSON.parse(chunk);
        if (json.response) {
          full += json.response;
          textarea.value = full;
        }
      } catch {}
    }
    this.responses.push(full.trim());
    this.index = this.responses.length - 1;
    counter.textContent = `${this.index + 1}/${this.responses.length}`;
  }
}

// --- State management for the popup ---
const showPopupEffect = StateEffect.define();
const closePopupEffect = StateEffect.define();

/*
Remove the popup widget from the editor when:
- The user clicks the close button
- The user inserts the AI response
- External triggers need to remove the popup
 */
function closePopup(view) {
  view.dispatch({ effects: closePopupEffect.of(null) });
}

/**
Manages the lifecycle of the popup decoration in the editor state.
- Shows the popup at the selection position when triggered.
- Removes the popup when closed.
*/
const popupField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    for (let e of tr.effects) {
      if (e.is(showPopupEffect)) {
        const { from, to, prompt, model, host, selectedText } = e.value;
        const deco = Decoration.widget({
          widget: new ResponsePopupWidget(from, to, prompt, model, host, selectedText),
          side: 1
        }).range(to);
        return Decoration.set([deco]);
      } else if (e.is(closePopupEffect)) {
        return Decoration.none;
      }
    }
    return value.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f)
});

/*
Entry point for the main AI Rephrase popup window handle.
Orchestrates the AI rephrasing flow:
- Gets user settings from the modal.
- Validates that text is selected.
- Triggers the popup widget to appear at the selection location.
*/
async function runAIRephrase(view) {
  const { prompt, model, host } = settingsModal.getValues();

  const sel = view.v.state.selection.main;
  if (sel.empty) {
    alert("Please select some text first.");
    return;
  }

  const selectedText = view.v.state.sliceDoc(sel.from, sel.to);

  view.v.dispatch({
    effects: showPopupEffect.of({
      from: sel.from,
      to: sel.to,
      prompt,
      model,
      host,
      selectedText
    })
  });
}

/*
Placeholder plugin to attach the AI rephrase system to the editor.
Could be extended in future to respond to document changes, keyboard shortcuts, etc.
*/
// const aiRephrasePlugin = ViewPlugin.fromClass(class {
//   constructor(view) { this.view = view; }
//   update() {}
// });

/*
Exported showAIRephrasePopup function so it may be called from external code
Public method for other parts of the application to trigger:
- The settings modal
- The rephrase popup
*/
export function showAIRephrasePopup(view, options = {}) {
  if (options.type === "settings") settingsModal.show();
  else if (options.type === "rephrase") runAIRephrase(view);
}

/*
Register the extension as plugin in index.js
 */
export const aiRephraseExtension = [popupField];