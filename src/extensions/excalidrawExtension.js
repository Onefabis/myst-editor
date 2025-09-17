import { ViewPlugin, Decoration, WidgetType } from "@codemirror/view";
import { StateEffect, RangeSetBuilder } from "@codemirror/state";
import React from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, exportToBlob, loadFromBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline';

// Global plugin instance for external access
let pluginInstance = null;

// Custom effect for triggering decoration updates
export const customUpdatedEffect = StateEffect.define();

// Constants
const DEFAULT_SCENE = {
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" }
};

const IMAGE_ELEMENT_DEFAULTS = {
  type: "image",
  version: 1,
  isDeleted: false,
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
  groupIds: [],
  frameId: null,
  roundness: null,
  boundElements: null,
  status: "pending",
  scale: [1, 1],
};

/**
 * Utility functions
 */
const utils = {
  /**
   * Creates a promise that can be resolved externally
   */
  createResolvablePromise() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
  },

  /**
   * Extracts filename from file path
   */
  getFileName(filePath) {
    if (!filePath || typeof filePath !== "string" || !filePath.includes("/")) {
      return "untitled.png";
    }
    return filePath.split("/").pop();
  },

  /**
   * Derives PNG save paths from original path
   */
  derivePngSavePaths(originalPath) {
    const clean = (originalPath || "").split("#")[0].split("?")[0];
    const lastSlash = clean.lastIndexOf("/");
    const dir = lastSlash >= 0 ? clean.slice(0, lastSlash) : "";
    const base = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;

    const dotIndex = base.lastIndexOf(".");
    const stem = dotIndex > -1 ? base.substring(0, dotIndex) : base;
    const pngName = `${stem || "untitled"}.png`;
    const pngFullPath = dir ? `${dir}/${pngName}` : pngName;
    
    return { pngName, pngFullPath };
  },

  /**
   * Creates an image element for Excalidraw from blob data
   */
  async createImageElement(imgBlob) {
    const imageDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(imgBlob);
    });

    const imageElement = {
      ...IMAGE_ELEMENT_DEFAULTS,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      id: crypto.randomUUID(),
      seed: Math.floor(Math.random() * 2 ** 31),
      updated: Date.now(),
      fileId: crypto.randomUUID(),
    };

    return {
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
    };
  },

  /**
   * Updates markdown image paths in the editor
   */
  updateImageMarkdownPath(editorView, oldPath, newPath) {
    const state = editorView.v.state;
    const changes = [];
    const fullDoc = state.doc.toString();
    const oldMarkdownPattern = new RegExp(
      `(!\\[[^\\]]*\\]\\()${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\))`, 
      'g'
    );

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
};

/**
 * Scene loader handles loading Excalidraw scenes or images from file paths
 */
class SceneLoader {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    if (!this.filePath) {
      return DEFAULT_SCENE;
    }

    try {
      const response = await fetch(this.filePath);
      
      if (!response.ok || response.status === 404) {
        return DEFAULT_SCENE;
      }

      const blob = await response.blob();
      
      if (blob.size < 100) {
        return DEFAULT_SCENE;
      }

      // Try to load as Excalidraw scene first
      return await loadFromBlob(blob);
      
    } catch (err) {
      // Fallback: try to load as image
      return await this.loadAsImage();
    }
  }

  async loadAsImage() {
    try {
      if (!this.filePath) return DEFAULT_SCENE;
      
      const response = await fetch(this.filePath);
      if (!response.ok) return DEFAULT_SCENE;
      
      const imgBlob = await response.blob();
      return await utils.createImageElement(imgBlob);
      
    } catch (imgErr) {
      console.error("Image fetch failed:", imgErr);
      return DEFAULT_SCENE;
    }
  }
}

/**
 * Handles exporting Excalidraw scenes to PNG
 */
class ExcalidrawExporter {
  constructor(filePath, editorView, widgetId, onClose) {
    this.filePath = filePath;
    this.editorView = editorView;
    this.widgetId = widgetId;
    this.onClose = onClose;
  }

  async export(excalidrawAPI) {
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

      await this.saveBlob(blob);
      this.triggerEditorRefresh();
      
    } catch (err) {
      console.error(err);
      alert("Save failed.");
    }
  }

  async saveBlob(blob) {
    const { pngName, pngFullPath } = utils.derivePngSavePaths(this.filePath);
    const formData = new FormData();
    formData.append("file", blob, pngName);

    const res = await fetch(`/save?filename=${encodeURIComponent(pngFullPath)}`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      throw new Error("Failed to save file");
    }
  }

  triggerEditorRefresh() {
    const widgetOffset = pluginInstance?.widgetIdToOffsetMap.get(this.widgetId);
    const state = this.editorView.v.state;
    const docLength = state.doc.length;

    if (widgetOffset != null && widgetOffset >= 0 && widgetOffset <= docLength) {
      // Trigger a small change to refresh the editor
      this.editorView.v.dispatch({ 
        changes: { from: widgetOffset, to: widgetOffset, insert: " " } 
      });
      
      setTimeout(() => {
        this.editorView.v.dispatch({ 
          changes: { from: widgetOffset, to: widgetOffset + 1, insert: "" } 
        });
        this.editorView.v.focus();
        this.onClose?.();
      }, 100);
    }
  }
}

/**
 * React component for the Excalidraw interface
 */
function ExcalidrawComponent({ filePath, editorView, widgetId, onClose }) {
  const [excalidrawAPI, setExcalidrawAPI] = React.useState(null);
  const initialStatePromiseRef = React.useRef({ promise: null });

  // Initialize the resolvable promise for initial data
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise = utils.createResolvablePromise();
  }

  // Load scene data on mount
  React.useEffect(() => {
    const loadScene = async () => {
      const loader = new SceneLoader(filePath);
      const sceneData = await loader.load();
      initialStatePromiseRef.current.promise.resolve(sceneData);
    };

    loadScene();
  }, [filePath]);

  // Handle export
  const handleExport = React.useCallback(async () => {
    const exporter = new ExcalidrawExporter(filePath, editorView, widgetId, onClose);
    await exporter.export(excalidrawAPI);
  }, [excalidrawAPI, filePath, editorView, widgetId, onClose]);

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
}

/**
 * ExcalidrawWidget represents an embedded Excalidraw editor as a CodeMirror widget
 */
class ExcalidrawWidget extends WidgetType {
  constructor(filePath, editorView, widgetId, onClose) {
    super();
    this.filePath = filePath || "";
    this.fileName = utils.getFileName(this.filePath);
    this.editorView = editorView;
    this.widgetId = widgetId;
    this.onClose = onClose;
  }

  toDOM() {
    const wrapper = this.createWrapper();
    const appDiv = this.createAppDiv();
    const styleTag = this.createStyleTag();
    const closeButton = this.createCloseButton();

    wrapper.appendChild(styleTag);
    wrapper.appendChild(appDiv);
    wrapper.appendChild(closeButton);

    this.preventEventBubbling(wrapper);
    this.renderReactComponent(appDiv);

    return wrapper;
  }

  createWrapper() {
    const wrapper = document.createElement("div");
    wrapper.id = `excalidraw_${this.widgetId}`;
    wrapper.classList.add("excalidraw-wrapper");
    return wrapper;
  }

  createAppDiv() {
    const appDiv = document.createElement("div");
    appDiv.classList.add("excalidraw-app");
    return appDiv;
  }

  createStyleTag() {
    const styleTag = document.createElement("style");
    styleTag.textContent = excalidrawCss;
    return styleTag;
  }

  createCloseButton() {
    const closeButton = document.createElement("button");
    closeButton.textContent = "✖";
    closeButton.classList.add("excalidraw-close-btn");
    closeButton.onclick = () => this.onClose?.();
    return closeButton;
  }

  preventEventBubbling(wrapper) {
    wrapper.addEventListener("keydown", e => e.stopPropagation());
    wrapper.addEventListener("mousedown", e => e.stopPropagation());
  }

  renderReactComponent(appDiv) {
    const root = createRoot(appDiv);
    root.render(
      React.createElement(ExcalidrawComponent, {
        filePath: this.filePath,
        editorView: this.editorView,
        widgetId: this.widgetId,
        onClose: this.onClose
      })
    );
  }

  updateDOM() {
    // No-op required by widget interface
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Main plugin class that manages Excalidraw widgets in the CodeMirror editor
 */
class ExcalidrawPluginClass {
  constructor(view) {
    this.view = view;
    this.decorationsMap = new Map();
    this.widgetIdToOffsetMap = new Map();
    this.decorations = Decoration.none;
    this.refreshScheduled = false;
    pluginInstance = this;
  }

  update(update) {
    let decorationsChanged = false;

    if (update.docChanged) {
      decorationsChanged = this.updateDecorationsAfterChange(update);
    }

    if (update.effects?.some(e => e.is(customUpdatedEffect))) {
      this.view.dispatch({ effects: [] });
      this.view.requestMeasure();
    }

    if (decorationsChanged) {
      this.updateDecorations();
    }
  }

  updateDecorationsAfterChange(update) {
    const newDecorationsMap = new Map();
    const newWidgetIdToOffsetMap = new Map();
    let changed = false;

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
      changed = true;
    }

    if (changed) {
      this.decorationsMap = newDecorationsMap;
      this.widgetIdToOffsetMap = newWidgetIdToOffsetMap;
    }

    return changed;
  }

  show(path, editorView) {
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    const from = line.to;

    // Handle non-PNG files
    this.handleNonPngFiles(path, editorView);

    // Avoid duplicates
    if (this.decorationsMap.has(from)) return;

    // Create and register widget
    const id = crypto.randomUUID();
    const widget = new ExcalidrawWidget(path, editorView, id, () => this.removeById(id));
    const deco = Decoration.widget({ widget, side: 1 }).range(from);

    this.decorationsMap.set(from, deco);
    this.widgetIdToOffsetMap.set(id, from);
    this.updateDecorations();
  }

  handleNonPngFiles(path, editorView) {
    const dotIndex = path.lastIndexOf(".");
    const ext = dotIndex > -1 ? path.substring(dotIndex + 1).toLowerCase() : "";
    
    if (ext && ext !== "png") {
      const newPath = path.substring(0, dotIndex) + ".png";
      utils.updateImageMarkdownPath(editorView, path, newPath);
    }
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
    this.widgetIdToOffsetMap.clear();
    this.updateDecorations();
  }

  updateDecorations() {
    const builder = new RangeSetBuilder();
    const sortedEntries = this.getSortedDecorations();

    for (const [, deco] of sortedEntries) {
      builder.add(deco.from, deco.to, deco.value);
    }

    this.decorations = builder.finish();
    this.scheduleRefresh();
  }

  getSortedDecorations() {
    return Array.from(this.decorationsMap.entries()).sort((a, b) => {
      const aFrom = a[1].from, bFrom = b[1].from;
      if (aFrom !== bFrom) return aFrom - bFrom;
      const aSide = a[1].value.spec.side ?? 0;
      const bSide = b[1].value.spec.side ?? 0;
      return aSide - bSide;
    });
  }

  scheduleRefresh() {
    if (this.refreshScheduled) return;

    this.refreshScheduled = true;
    setTimeout(() => {
      if (this.view?.state) {
        this.view.dispatch({ effects: [customUpdatedEffect.of(null)] });
        this.view.requestMeasure();
      }
      this.refreshScheduled = false;
    }, 20);
  }

  destroy() {
    pluginInstance = null;
  }
}

// Export plugin and utilities
export const excalidrawPlugin = ViewPlugin.fromClass(
  ExcalidrawPluginClass, 
  { decorations: v => v.decorations }
);

export const excalidrawExtension = [excalidrawPlugin];

export function showExcalidraw(path, editorView) {
  pluginInstance?.show(path, editorView);
}