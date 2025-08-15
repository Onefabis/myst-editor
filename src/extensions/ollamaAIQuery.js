import { Decoration, WidgetType, ViewPlugin } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { createRoot } from "https://esm.sh/react-dom@19.0.0/client";
import React, { useEffect, useState, useRef } from "https://esm.sh/react@19.0.0";


class OllamaPopupWidget extends WidgetType {
  constructor(editorView, from, to) {
    super();
    this.editorView = editorView;
    this.from = from;
    this.to = to;
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

    // Prevent input interaction from leaking to editor
    wrapper.addEventListener("mousedown", e => e.stopPropagation());
    wrapper.addEventListener("keydown", e => e.stopPropagation());

    const selectionText = this.editorView.state.sliceDoc(this.from, this.to);

    const root = createRoot(wrapper);
    root.render(
      React.createElement(PopupContent, {
        key: `${this.from}-${this.to}`, // Resets state on remount
        editorView: this.editorView,
        from: this.from,
        to: this.to,
        context: selectionText
      })
    );

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

function PopupContent({ editorView, from, to, context }) {
  const defaultHost = "http://localhost:11434";
  const [ollamaHost, setOllamaHost] = useState(localStorage.getItem("ollama-host") || defaultHost);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(localStorage.getItem("ollama-last-model") || "");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [responseHistory, setResponseHistory] = useState([]); // { model, text }
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const responseRef = useRef(null);
  const readerRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    fetch(`${ollamaHost}/api/tags`)
      .then(res => res.json())
      .then(data => {
        const modelList = data.models.map(m => m.name);
        setModels(modelList);
        const savedModel = localStorage.getItem("ollama-last-model");
        setModel(savedModel && modelList.includes(savedModel) ? savedModel : modelList[0]);
      })
      .catch(err => console.error("Model fetch failed", err));
  }, [ollamaHost]);

  useEffect(() => {
    if (autoScroll && responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response, autoScroll]);

  const handleModelChange = (e) => {
    const newModel = e.target.value;
    setModel(newModel);
    localStorage.setItem("ollama-last-model", newModel);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setLoading(false);
  };

  const handleSend = async () => {
    if (!prompt.trim()) {
      setResponse("⚠️ Prompt is empty.");
      return;
    }

    setLoading(true);
    setResponse("");
    setAutoScroll(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${ollamaHost}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: `${prompt}\n\n${context}`,
          stream: true
        }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        setResponse(`❌ Ollama error: ${res.status} - ${text}`);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullResponse = "";

      const read = async () => {
        const { value, done } = await reader.read();
        if (done) {
          // Save to history
          const cleanResponse = fullResponse.trim();
          const newEntry = { model, text: cleanResponse };
          setResponseHistory(prev => [...prev, newEntry]);
          setCurrentIndex(prev => prev + 1);
          setLoading(false);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line.trim());
            if (json.response) {
              fullResponse += json.response;
              setResponse(fullResponse);
            }
          } catch (err) {
            console.error("Failed to parse stream chunk:", line, err);
          }
        }

        await read();
      };

      await read();
    } catch (err) {
      if (err.name === "AbortError") {
        setResponse(fullResponse => fullResponse + "\n⛔ Request aborted.");
      } else {
        console.error("Ollama fetch failed:", err);
        setResponse("❌ Failed to connect to Ollama.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    const clean = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    editorView.dispatch({ changes: { from, to, insert: clean } });
    closePopup(editorView);
  };

  const handleAdd = () => {
    const clean = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const textBefore = editorView.state.sliceDoc(from, to);
    editorView.dispatch({ changes: { from, to, insert: textBefore + " " + clean } });
    closePopup(editorView);
  };

  const handleHostChange = (e) => {
    const newHost = e.target.value.trim();
    setOllamaHost(newHost);
    localStorage.setItem("ollama-host", newHost);
  };

  const handleScroll = () => {
    const el = responseRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
    if (!nearBottom && autoScroll) setAutoScroll(false);
  };

  const showPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setResponse(responseHistory[currentIndex - 1].text);
    }
  };

  const showNext = () => {
    if (currentIndex < responseHistory.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setResponse(responseHistory[currentIndex + 1].text);
    }
  };

  const currentModelLabel = responseHistory[currentIndex]?.model || "";

  return React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: "8px" }
  },
    React.createElement("textarea", {
      rows: 2,
      placeholder: "Enter prompt...",
      value: prompt,
      onChange: (e) => setPrompt(e.target.value),
      style: { fontFamily: "system-ui", resize: "vertical", fontSize: "13px", padding: "2px" }
    }),

    React.createElement("select", {
      value: model,
      onChange: handleModelChange
    }, ...models.map(m => React.createElement("option", { key: m, value: m }, m))),

    React.createElement("button", {
      onClick: loading ? handleStop : handleSend
    }, loading ? "Stop" : "Send"),

    // response && 
    React.createElement("textarea", {
      rows: 6,
      readOnly: true,
      value: response,
      ref: responseRef,
      onScroll: handleScroll,
      placeholder: "Model answer...",
      style: {
        fontFamily: "system-ui",
        resize: "vertical",
        overflowY: "auto",
        fontSize: "13px", 
        padding: "2px", 
        color: response ? "black" : "#999" // gray text if empty
      }
    }),

    // Navigation + Model label
    // response && 
    React.createElement("div", {
      style: { display: "flex", justifyContent: "left", alignItems: "center", gap: "10px" }
    },
      React.createElement("button", {
        onClick: showPrevious,
        disabled: currentIndex <= 0,
        title: "Previous answer"
      }, "<"),
      React.createElement("button", {
        onClick: showNext,
        disabled: currentIndex >= responseHistory.length - 1,
        title: "Next answer"
      }, ">"),
      React.createElement("span", {
        style: { fontFamily: "system-ui" }
      }, currentIndex >= 0 ? `${currentIndex + 1}: ${responseHistory[currentIndex]?.model}` : "")
    ), 

    // Host input and buttons
    React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "6px"
      }
    },
      React.createElement("input", {
        type: "text",
        value: ollamaHost,
        onChange: handleHostChange,
        style: {
          flex: "1",
          fontFamily: "system-ui",
          fontSize: "12px",
          padding: "4px"
        }
      }),
      React.createElement("button", { onClick: handleAdd }, "Add"),
      React.createElement("button", { onClick: handleInsert }, "Insert"),
      React.createElement("button", { onClick: () => closePopup(editorView) }, "Close")
    )
  );
}


function closePopup(view) {
  view.dispatch({ effects: closePopupEffect.of(null) }); //
}

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

    if (needsRedraw) {
      this.view.requestMeasure(); // optional but improves visual accuracy
    }
  }


  destroy() {}
}, {
  decorations: v => v.decorations
});

export const ollamaExtension = [ollamaPopupPlugin];

export function showOllamaPopup(view) {
  view.v.dispatch({ effects: addPopupEffect.of(null) }); 
}
