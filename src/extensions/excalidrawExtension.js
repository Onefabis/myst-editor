import { ViewPlugin, Decoration, WidgetType } from "@codemirror/view";
import { StateEffect, RangeSetBuilder } from "@codemirror/state";
// import { markdownUpdatedEffect } from "@codemirror/text";

// Connect React and Excalidraw (from online)
// TODO: Make it local, i.e. create git submodule with Excalidraw
import React from "https://esm.sh/react@19.0.0";
import { createRoot } from "https://esm.sh/react-dom@19.0.0/client";
import {
  Excalidraw,
  exportToBlob, 
  loadFromBlob 
} from "https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.js?external=react,react-dom";

let pluginInstance = null;
export const customUpdatedEffect = StateEffect.define();

// Widget with Excalidraw
class ExcalidrawWidget extends WidgetType {
  constructor(filePath, editorView, widgetId, onClose) {
    super();
    this.filePath = filePath;
    this.fileName = this.filePath.split("/").pop();
    this.editorView = editorView;
    this.widgetId = widgetId;
    this.onClose = onClose;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.id = `excalidraw_${this.widgetId}`;
    wrapper.style.border = "1px solid #ccc";
    wrapper.style.boxShadow = "0 2px 5px rgba(0,0,0,0.15)";
    wrapper.style.aspectRatio = "4/4";
    wrapper.style.width = "100%";
    wrapper.style.position = "relative";
    wrapper.style.margin = "22px 0 0";

    const appDiv = document.createElement("div");
    appDiv.style.height = "100%";
    wrapper.appendChild(appDiv);

    // Stylesheet
    const styleLink = document.createElement("link");
    styleLink.setAttribute("rel", "stylesheet");
    styleLink.setAttribute("href", "https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.css");
    wrapper.insertBefore(styleLink, appDiv);

    // ❌ Close Button
    const closeButton = document.createElement("button");
    closeButton.textContent = "✖";
    closeButton.style.position = "absolute";
    closeButton.style.top = "-14px";
    closeButton.style.right = "2px";
    closeButton.style.zIndex = "10";
    closeButton.style.cursor = "pointer";
    closeButton.style.borderRadius = "14px";
    closeButton.style.width = "25px";
    closeButton.style.height = "25px";
    closeButton.style.textAlign = "center";
    closeButton.style.border = "1px solid black";
    closeButton.style.background = "red";
    closeButton.onclick = () => {
      if (this.onClose) {
        this.onClose();
      }
    };

    wrapper.appendChild(closeButton);
    wrapper.addEventListener("keydown", (e) => {
      // Make sure events don’t escape to CodeMirror
      e.stopPropagation();
    });
    wrapper.focus(); // Optional: auto-focus on open
    wrapper.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    const root = createRoot(appDiv);
    root.render(
      React.createElement(() => {
        const [excalidrawAPI, setExcalidrawAPI] = React.useState(null);
        const initialStatePromiseRef = React.useRef({ promise: null });
        const resolvablePromise = () => {
          let resolve, reject;
          const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
          });
          promise.resolve = resolve;
          promise.reject = reject;
          return promise;
        };

        if (!initialStatePromiseRef.current.promise) {
          initialStatePromiseRef.current.promise = resolvablePromise();
        }

        React.useEffect(() => {
          const loadScene = async () => {
            try {
              const response = await fetch(this.filePath);

              if (!response.ok || response.status === 404) {
                console.warn("⚠️ File not found:", this.filePath);
                initialStatePromiseRef.current.promise.resolve({
                  elements: [],
                  appState: { viewBackgroundColor: "#ffffff" }
                });
                return;
              }

              const blob = await response.blob();

              if (blob.size < 100) {
                console.warn("⚠️ File too small to contain valid scene:", blob.size, "bytes");
                initialStatePromiseRef.current.promise.resolve({
                  elements: [],
                  appState: { viewBackgroundColor: "#ffffff" }
                });
                return;
              }

              const sceneData = await loadFromBlob(blob);
              initialStatePromiseRef.current.promise.resolve(sceneData);

            } catch (err) {
              console.error("Failed to load scene:", err);
              initialStatePromiseRef.current.promise.resolve({
                elements: [],
                appState: { viewBackgroundColor: "#ffffff" }
              });
            }
          };

          loadScene();
        }, []);



        const handleExport = async () => {
          if (!excalidrawAPI) return;

          try {
            const blob = await exportToBlob({
              elements: excalidrawAPI.getSceneElements(),
              appState: { exportEmbedScene: true, gridModeEnabled: true },
              scrollToContent: true,
              mimeType: "image/png",
              files: excalidrawAPI.getFiles(),
              exportPadding: 10
            });

            const formData = new FormData();
            console.log("📦 Saving blob of size:", blob.size);
            formData.append("file", blob, this.fileName);

            const res = await fetch(`/save?filename=${encodeURIComponent(this.filePath)}`, {
              method: "POST",
              body: formData
            });

            if (res.ok) {

              const randomChar = String.fromCharCode(0xe000 + Math.floor(Math.random() * 100)); // U+E000 to U+E064
              const widgetOffset = pluginInstance?.widgetIdToOffsetMap.get(this.widgetId);
              const state = this.editorView.v.state;
              const originalSelection = state.selection.main;

              if (widgetOffset != null) {
                // Insert the random character
                this.editorView.v.dispatch({
                  changes: { from: widgetOffset, to: widgetOffset, insert: randomChar },
                });

                this.editorView.v.dispatch({
                  selection: { anchor: widgetOffset + 1 } // move cursor right after inserted char
                });

                this.editorView.v.focus();

                setTimeout(() => {
                  this.editorView.v.dispatch({
                    changes: { from: widgetOffset, to: widgetOffset + 1, insert: "" }
                  });

                  this.editorView.v.dispatch({
                    selection: { anchor: widgetOffset }
                  });

                  this.editorView.v.dispatch({
                    selection: {
                      anchor: originalSelection.anchor,
                      head: originalSelection.head
                    }
                  });

                this.editorView.v.focus();
                }, 100);
 
              }
            }

          } catch (e) {
            console.error(e);
            alert("❌ Save failed.");
          }
        };

        return React.createElement(
          "div",
          { style: { height: "100%", width: "100%", position: "relative" } },
          React.createElement(
            Excalidraw,
            {
              excalidrawAPI: setExcalidrawAPI,
              initialData: initialStatePromiseRef.current.promise
            }
          ),
          React.createElement(
            "button",
            {
              onClick: handleExport,
              style: {
                position: "absolute",
                top: "-16px", 
                left: "2px", 
                zIndex: "100", 
                padding: "4px 7px",
                lineHeight: "16px", 
                background: "#4caf50",
                color: "white",
                border: "1px solid black;",
                borderRadius: "15px",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
              }
            },
            "📤 Save"
          )
        );

      })
    );

    return wrapper;
  }

  updateDOM(wrapper) {
    console.log("updating")
  }

  ignoreEvent() {
    return false;
  }
}

// ViewPlugin for decoradion control
export const excalidrawPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.decorationsMap = new Map(); // key: line.from, val: Decoration
    this.widgetIdToOffsetMap = new Map();
    this.decorations = Decoration.none;
    pluginInstance = this;
  }

  update(update) {
    let changed = false;

    if (update.docChanged) {
      const newDecorationsMap = new Map();
      const newWidgetIdToOffsetMap = new Map();

      for (let [oldPos, deco] of this.decorationsMap.entries()) {
        const newPos = update.changes.mapPos(oldPos);
        const widget = deco.value.spec.widget;
        newDecorationsMap.set(newPos, Decoration.widget({
          widget,
          side: 1
        }).range(newPos));

        // Also update the ID-to-offset map
        newWidgetIdToOffsetMap.set(widget.widgetId, newPos);
      }

      this.decorationsMap = newDecorationsMap;
      this.widgetIdToOffsetMap = newWidgetIdToOffsetMap;

      changed = true;
    }

    if (update.effects && update.effects.some(e => e.is(customUpdatedEffect))) {
      // Trigger re-render without doc change
      this.view.dispatch({ effects: [] });
      this.view.requestMeasure();
    }

    if (changed) {
      this.updateDecorations(); // rebuild .decorations
    }
  }

  show(path, editorView) {
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    const from = line.to;

    if (this.decorationsMap.has(from)) {
      console.warn(`⚠️ Widget already exists at offset ${from}`);
      return;
    }
    const id = crypto.randomUUID();
    const widget = new ExcalidrawWidget(path, editorView, id, () => this.removeById(id));
    const deco = Decoration.widget({
      widget,
      side: 1  // ensure it's visually after text
    }).range(from);

    this.decorationsMap.set(from, deco);
    this.widgetIdToOffsetMap.set(id, from);

    this.updateDecorations();
  }

  removeById(id) {
    const offset = this.widgetIdToOffsetMap.get(id);
    if (offset !== undefined) {
      this.decorationsMap.delete(offset);
      this.widgetIdToOffsetMap.delete(id);
      this.updateDecorations();
    }
  }

  clear() {
    this.decorationsMap.clear();
    this.updateDecorations();
  }

  updateDecorations() {
    const builder = new RangeSetBuilder();
    const sorted = Array.from(this.decorationsMap.entries())
      .sort((a, b) => {
        const aFrom = a[1].from;
        const bFrom = b[1].from;
        if (aFrom !== bFrom) return aFrom - bFrom;
        const aSide = a[1].value.spec.side ?? 0;
        const bSide = b[1].value.spec.side ?? 0;
        return aSide - bSide;
      });

    for (const [, deco] of sorted) {
      builder.add(deco.from, deco.to, deco.value);
    }
    this.decorations = builder.finish();

    // ✅ Trigger a view refresh AFTER the current update cycle
    setTimeout(() => {
      if (this.view && this.view.state) {
        this.view.dispatch({ effects: [customUpdatedEffect.of(null)] });
        this.view.requestMeasure(); // optional, improves layout timing
      }
    }, 20);
  }

  destroy() {
    pluginInstance = null;
  }
}, {
  decorations: v => v.decorations
});

export const excalidrawExtension = [excalidrawPlugin];

export function showTemporaryDiv(path, editorView) {
  if (pluginInstance) {
    pluginInstance.show(path, editorView);
  } else {
    console.warn("⚠️ excalidrawPlugin not active");
  }
}
