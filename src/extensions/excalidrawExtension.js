import { ViewPlugin, Decoration, WidgetType } from "@codemirror/view";
import { StateEffect, RangeSetBuilder } from "@codemirror/state";

import React from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, exportToBlob, loadFromBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'; // use ?inline if your bundler supports it

// import '@excalidraw/excalidraw/index.css';
let pluginInstance = null;
// Effect used to signal updates that require a re-measure / re-render of decorations
export const customUpdatedEffect = StateEffect.define();

/* Class: ExcalidrawWidget
   Purpose: Represent an embedded Excalidraw editor as a CodeMirror widget.
   High-level: holds file info and editor references, creates DOM for the Excalidraw app,
     and wires up save/close behavior.
*/
class ExcalidrawWidget extends WidgetType {
  // Constructor: store initial parameters and derive a display filename
  constructor(filePath, editorView, widgetId, onClose) {
    super();
    this.filePath = filePath || "";
    this.fileName = (typeof this.filePath === "string" && this.filePath.includes("/"))
      ? this.filePath.split("/").pop()
      : "untitled.png";
    this.editorView = editorView;
    this.widgetId = widgetId;
    this.onClose = onClose;
  }

  /* Method: toDOM
     Purpose: Build and return the DOM node for the widget.
     High-level: create wrapper, load Excalidraw React app into it, handle loading of
       scene data or fallback to a blank canvas/image, and expose save/close actions.
  */
  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.id = `excalidraw_${this.widgetId}`;
    wrapper.classList.add("excalidraw-wrapper");

    const appDiv = document.createElement("div");
    appDiv.classList.add("excalidraw-app");
    wrapper.appendChild(appDiv);

    const styleTag = document.createElement("style");
    styleTag.textContent = excalidrawCss;
    wrapper.insertBefore(styleTag, appDiv);

    const closeButton = document.createElement("button");
    closeButton.textContent = "✖";
    closeButton.classList.add("excalidraw-close-btn");
    closeButton.onclick = () => this.onClose?.();
    wrapper.appendChild(closeButton);

    // Prevent editor-level events from interfering with the embedded app's interactions
    wrapper.addEventListener("keydown", e => e.stopPropagation());
    wrapper.addEventListener("mousedown", e => e.stopPropagation());

    const root = createRoot(appDiv);
    root.render(
      React.createElement(() => {
        // React state: reference to Excalidraw API setter and a promise for initial scene
        const [excalidrawAPI, setExcalidrawAPI] = React.useState(null);
        const initialStatePromiseRef = React.useRef({ promise: null });

        /* helper: resolvablePromise
           Purpose: create a promise that can be resolved externally.
           High-level: provide a promise-like object the Excalidraw component can wait on.
        */
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

        // Ensure an externally-resolvable promise exists for initial data
        if (!initialStatePromiseRef.current.promise) {
          initialStatePromiseRef.current.promise = resolvablePromise();
        }

        /* Effect: loadScene
           Purpose: attempt to load an Excalidraw scene or image from the provided file path.
           High-level: fetch the file, decide whether it's a scene or image, and resolve the
             initial data promise with the appropriate fallback if loading fails.
        */
        React.useEffect(() => {
          const loadScene = async () => {
            try {
              if (!this.filePath) {
                initialStatePromiseRef.current.promise.resolve({
                  elements: [],
                  appState: { viewBackgroundColor: "#ffffff" }
                });
                return;
              }

              const response = await fetch(this.filePath);

              if (!response.ok || response.status === 404) {
                initialStatePromiseRef.current.promise.resolve({
                  elements: [],
                  appState: { viewBackgroundColor: "#ffffff" }
                });
                return;
              }

              const blob = await response.blob();

              if (blob.size < 100) {
                initialStatePromiseRef.current.promise.resolve({
                  elements: [],
                  appState: { viewBackgroundColor: "#ffffff" }
                });
                return;
              }

              const sceneData = await loadFromBlob(blob);
              initialStatePromiseRef.current.promise.resolve(sceneData);

            } catch (err) {
              try {
                // Fallback attempt: try to treat the resource as an image and embed it
                if (this.filePath) {
                  const response = await fetch(this.filePath);
                  if (response.ok) {
                    const imgBlob = await response.blob();
                    const imageDataUrl = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result);
                      reader.readAsDataURL(imgBlob);
                    });

                    const imageElement = {
                      type: "image",
                      version: 1,
                      versionNonce: Math.floor(Math.random() * 2 ** 31),
                      isDeleted: false,
                      id: crypto.randomUUID(),
                      fillStyle: "hachure",
                      strokeWidth: 1,
                      strokeStyle: "solid",
                      roughness: 0,
                      opacity: 100,
                      angle: 0,
                      x: 100,
                      y: 100,
                      strokeColor: "transparent",
                      backgroundColor: "transparent",
                      width: 300,
                      height: 300,
                      seed: Math.floor(Math.random() * 2 ** 31),
                      groupIds: [],
                      frameId: null,
                      roundness: null,
                      boundElements: null,
                      updated: Date.now(),
                      status: "pending",
                      fileId: crypto.randomUUID(),
                      scale: [1, 1],
                    };

                    initialStatePromiseRef.current.promise.resolve({
                      elements: [imageElement],
                      appState: { viewBackgroundColor: "#ffffff" },
                      files: {
                        [imageElement.fileId]: {
                          mimeType: imgBlob.type,
                          id: imageElement.fileId,
                          dataURL: imageDataUrl,
                          created: Date.now(),
                          lastRetrieved: Date.now(),
                        },
                      },
                    });
                    return;
                  }
                }
              } catch (imgErr) {
                console.error("Image fetch failed:", imgErr);
              }

              // Final fallback: resolve to a blank scene
              initialStatePromiseRef.current.promise.resolve({
                elements: [],
                appState: { viewBackgroundColor: "#ffffff" }
              });
            }
          };

          loadScene();
        }, []);

        /* Function: derivePngSavePaths
           Purpose: compute a PNG filename and full path derived from the original path.
           High-level: sanitize the input path and return an appropriate .png name and path.
        */
        const derivePngSavePaths = (originalPath) => {
          const clean = (originalPath || "").split("#")[0].split("?")[0];
          const lastSlash = clean.lastIndexOf("/");
          const dir = lastSlash >= 0 ? clean.slice(0, lastSlash) : "";
          const base = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;

          const dotIndex = base.lastIndexOf(".");
          const stem = dotIndex > -1 ? base.substring(0, dotIndex) : base;
          const ext = dotIndex > -1 ? base.substring(dotIndex + 1).toLowerCase() : "";

          const pngName = `${stem || "untitled"}.png`;
          const pngFullPath = dir ? `${dir}/${pngName}` : pngName;
          return { pngName, pngFullPath };
        };

        /* Function: handleExport
           Purpose: export the current Excalidraw scene to a PNG blob and POST it to a save endpoint.
           High-level: collect scene data, package it, send it to the server, then trigger a small
             editor refresh and close the widget on successful save.
        */
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

            const { pngName, pngFullPath } = derivePngSavePaths(this.filePath);

            const formData = new FormData();
            formData.append("file", blob, pngName);

            const res = await fetch(`/save?filename=${encodeURIComponent(pngFullPath)}`, {
              method: "POST",
              body: formData
            });

            if (res.ok) {
              const widgetOffset = pluginInstance?.widgetIdToOffsetMap.get(this.widgetId);
              const state = this.editorView.v.state;
              const docLength = state.doc.length;

              if (widgetOffset != null && widgetOffset >= 0 && widgetOffset <= docLength) {
                this.editorView.v.dispatch({ changes: { from: widgetOffset, to: widgetOffset, insert: " " } });
                setTimeout(() => {
                  this.editorView.v.dispatch({ changes: { from: widgetOffset, to: widgetOffset + 1, insert: "" } });
                  this.editorView.v.focus();
                  this.onClose?.();
                }, 100);
              }
            }
          } catch (err) {
            console.error(err);
            alert("Save failed.");
          }
        };

        // Render the Excalidraw component and a Save button inside the widget
        return React.createElement(
          "div",
          { style: { height: "100%", width: "100%", position: "relative" } },
          React.createElement(Excalidraw, {
            excalidrawAPI: setExcalidrawAPI,
            initialData: initialStatePromiseRef.current.promise
          }),
          React.createElement(
            "button",
            { onClick: handleExport, className: "excalidraw-save-btn" },
            "📤 Save"
          )
        );
      })
    );

    return wrapper;
  }

  /* Method: updateDOM
     Purpose: placeholder for DOM update handling required by the widget system.
     High-level: kept as a no-op to comply with widget interface.
  */
  updateDOM() {}
  /* Method: ignoreEvent
     Purpose: indicate whether events should be ignored by the widget.
     High-level: return false so default event handling is allowed.
  */
  ignoreEvent() { return false; }
}

// Function: updateImageMarkdownPath
// Purpose: scan the editor document and replace occurrences of an old image path with a new one.
// High-level: find markdown image links that reference oldPath and replace them with newPath.
function updateImageMarkdownPath(editorView, oldPath, newPath) {
  const state = editorView.v.state;
  const changes = [];

  const fullDoc = state.doc.toString();
  const oldMarkdownPattern = new RegExp(`(!\\[[^\\]]*\\]\\()${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\))`, 'g');

  let match;
  while ((match = oldMarkdownPattern.exec(fullDoc)) !== null) {
    const from = match.index + match[1].length;
    const to = from + oldPath.length;
    changes.push({ from, to, insert: newPath });
  }

  if (changes.length > 0) {
    editorView.v.dispatch({ changes });
  }
}

/* Plugin class: excalidrawPlugin
   Purpose: manage insertion, removal, and lifecycle of Excalidraw widgets inside the editor.
   High-level: maintain maps of decorations and widget offsets, update positions after edits,
     provide methods to show/clear/remove widgets, and rebuild decorations when needed.
*/
export const excalidrawPlugin = ViewPlugin.fromClass(class {
  // Constructor: initialize plugin state and register global instance
  constructor(view) {
    this.view = view;
    this.decorationsMap = new Map();
    this.widgetIdToOffsetMap = new Map();
    this.decorations = Decoration.none;
    pluginInstance = this;
  }

  /* Method: update
     Purpose: respond to document changes and custom effects.
     High-level: remap stored decoration positions after edits and trigger a decoration refresh
       or measurement when necessary.
  */
  update(update) {
    let decorationsChanged = false;

    if (update.docChanged) {
      const newDecorationsMap = new Map();
      const newWidgetIdToOffsetMap = new Map();

      for (let [oldPos, deco] of this.decorationsMap.entries()) {
        const newPos = update.changes.mapPos(oldPos);

        if (newPos === oldPos) {
          newDecorationsMap.set(newPos, deco);
          newWidgetIdToOffsetMap.set(deco.value.spec.widget.widgetId, newPos);
          continue;
        }

        const widget = deco.value.spec.widget;
        const newDeco = Decoration.widget({ widget, side: 1 }).range(newPos);
        newDecorationsMap.set(newPos, newDeco);
        newWidgetIdToOffsetMap.set(widget.widgetId, newPos);
        decorationsChanged = true;
      }

      if (decorationsChanged) {
        this.decorationsMap = newDecorationsMap;
        this.widgetIdToOffsetMap = newWidgetIdToOffsetMap;
      }
    }

    // Handle custom update triggers that require a re-measure
    if (update.effects?.some(e => e.is(customUpdatedEffect))) {
      this.view.dispatch({ effects: [] });
      this.view.requestMeasure();
    }

    if (decorationsChanged) {
      this.updateDecorations();
    }
  }

  /* Method: show
     Purpose: insert an Excalidraw widget at the current selection line.
     High-level: optionally rewrite non-png markdown links to .png, avoid duplicates,
       create a widget and register its decoration and offset.
  */
  show(path, editorView) {
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    const from = line.to;

    // If file is NOT a .png and no excalidraw scene, update markdown path
    const dotIndex = path.lastIndexOf(".");
    const ext = dotIndex > -1 ? path.substring(dotIndex + 1).toLowerCase() : "";
    if (ext && ext !== "png") {
      const newPath = path.substring(0, dotIndex) + ".png";
      updateImageMarkdownPath(editorView, path, newPath);
    }

    // continue with normal Excalidraw widget insertion
    if (this.decorationsMap.has(from)) return;
    const id = crypto.randomUUID();
    const widget = new ExcalidrawWidget(path, editorView, id, () => this.removeById(id));
    const deco = Decoration.widget({ widget, side: 1 }).range(from);

    this.decorationsMap.set(from, deco);
    this.widgetIdToOffsetMap.set(id, from);
    this.updateDecorations();
  }

  /* Method: removeById
     Purpose: remove a widget and its decoration by widget id.
     High-level: lookup the offset and delete related entries, then refresh decorations.
  */
  removeById(id) {
    const offset = this.widgetIdToOffsetMap.get(id);
    if (offset !== undefined) {
      this.decorationsMap.delete(offset);
      this.widgetIdToOffsetMap.delete(id);
      this.updateDecorations();
    }
  }

  /* Method: clear
     Purpose: remove all widgets managed by the plugin.
     High-level: clear internal maps and refresh decorations.
  */
  clear() {
    this.decorationsMap.clear();
    this.updateDecorations();
  }

  /* Method: updateDecorations
     Purpose: rebuild the RangeSet of decorations from the internal map.
     High-level: sort decorations, assemble them into a RangeSet, and schedule a small
       deferred update to trigger editor measure/refresh.
  */
  updateDecorations() {
    const builder = new RangeSetBuilder();
    const sortedEntries = Array.from(this.decorationsMap.entries()).sort((a, b) => {
      const aFrom = a[1].from, bFrom = b[1].from;
      if (aFrom !== bFrom) return aFrom - bFrom;
      const aSide = a[1].value.spec.side ?? 0;
      const bSide = b[1].value.spec.side ?? 0;
      return aSide - bSide;
    });

    for (const [, deco] of sortedEntries) {
      builder.add(deco.from, deco.to, deco.value);
    }

    this.decorations = builder.finish();

    if (!this.refreshScheduled) {
      this.refreshScheduled = true;
      setTimeout(() => {
        if (this.view?.state) {
          this.view.dispatch({ effects: [customUpdatedEffect.of(null)] });
          this.view.requestMeasure();
        }
        this.refreshScheduled = false;
      }, 20);
    }
  }

  /* Method: destroy
     Purpose: cleanup when plugin is destroyed.
     High-level: clear global references so the plugin can be GC'd.
  */
  destroy() {
    pluginInstance = null;
  }
}, { decorations: v => v.decorations });

export const excalidrawExtension = [excalidrawPlugin];

// Function: showExcalidraw
// Purpose: convenience wrapper to call the plugin's show method from outside.
export function showExcalidraw(path, editorView) {
  pluginInstance?.show(path, editorView);
}
