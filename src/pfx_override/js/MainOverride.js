import '../css/PFXStyleOverride.css';

import { setupGitPanel } from "./gitDiffUI.js";
import "./leftPanelButtons.js";
import "./leftPanelFileTree.js";
import "./editorContextMenu.js";

import * as txFormat from "./textFormatButtons.js";
import { openImagePicker } from "./projectImagePicker.js";
import { waitForEditorReady, saveCurrentEditorContent, bindFocusBlurHandlers, setLastSavedTimestamp } from "./saveEditorText.js"

import MystEditor, { defaultButtons, autosaveEnabled } from '../../MystEditor.jsx';
import { showLatestCommitDiff, revertFileChanges, pluginReady, pluginInstance } from "../../extensions/markChangedLines.js";


export let mystEditorInstance = null;
const editorPanel = document.getElementById('editor-panel');

const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');

// Restore left panel width
const savedWidth = localStorage.getItem('sidebarWidth');
if (savedWidth) {
  sidebar.style.width = savedWidth + 'px';
}

// Resize left panel with file tree
resizer.onmousedown = function (e) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = sidebar.offsetWidth;
  document.onmousemove = function (e) {
    const newWidth = startWidth + (e.clientX - startX);
    if (newWidth >= 250 && newWidth <= 600) {
      sidebar.style.width = newWidth + 'px';
      localStorage.setItem('sidebarWidth', newWidth);
    }
  };
  document.onmouseup = function () {
    document.onmousemove = null;
    document.onmouseup = null;
  };
};

// Converts backslashes to forward slashes for consistency
function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

export async function loadFile(filename) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(normalizePath(filename))}`);
  if (res.status === 404) {
    console.warn('Last opened file not found.');
    localStorage.removeItem('lastOpened');
    return;
  }

  if (!res.ok) {
    alert(`File loading error: ${res.statusText}`);
    return;
  }

  const data = await res.json();
  setLastSavedTimestamp(data.last_modified);
  const old = document.getElementById("myst");
  const newContainer = document.createElement("div");
  newContainer.id = "myst";
  newContainer.style.flexGrow = "1";
  newContainer.style.border = "1px solid #ccc";
  newContainer.style.marginBottom = "0.5rem";
  newContainer.style.height = "80vh";
  old.replaceWith(newContainer);
  localStorage.setItem('currentPath', filename);
  const sheet = new CSSStyleSheet();
  const css = await (await fetch('../PFXStyleOverride.css')).text();
  await sheet.replace(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const title = filename.split('\\').pop().split('/').pop();
  requestAnimationFrame(async() => {
    mystEditorInstance = MystEditor({
      templatelist: "linkedtemplatelist.json",
      initialText: data.content,
      title: title,
      additionalStyles: sheet,
      includeButtons: defaultButtons.concat([
        { id: "revert", text: "🧹 Revert", visible: false, action: () => revertFileChanges(mystEditorInstance) },
        { text: "💾 Save", visible: true, action: () => saveCurrentEditorContent(true) },
        { text: "🗃️ Image", visible: true, action: () => openImagePicker() },
        { text: "Clear", visible: true, action: () => txFormat.clearLineSymbols() },
        { text: "H1", visible: true, action: () => txFormat.convertToH1() },
        { text: "H2", visible: true, action: () => txFormat.convertToH2() },
        { text: "B",  visible: true, action: () => txFormat.convertToBold() }
      ]),
      spellcheckOpts: false,
      syncScroll: true,
    }, newContainer);
    const view = await waitForEditorReady();
    bindFocusBlurHandlers(view);
    // Wait for plugin to be ready before setting up mode subscription
    await pluginReady;
    // Always re-inject merge view when file loads for non-Gitdiff modes
    if (["Both", "Source", "Inline"].includes(mystEditorInstance.options.mode.v)) {
      showLatestCommitDiff(mystEditorInstance);
    }
    window._mystEditor = mystEditorInstance;
    // Set up mode change subscription with more robust handling
    mystEditorInstance.options.mode.subscribe((newMode) => {
      requestAnimationFrame(async () => {
        if (["Both", "Source", "Inline"].includes(newMode)) {
          // Wait for the editor to be ready with the new mode
          await new Promise(resolve => setTimeout(resolve, 150));
          // Try multiple approaches to ensure merge injection works
          if (pluginInstance) {
            pluginInstance.handleModeChange(newMode, mystEditorInstance);
          } else {
            showLatestCommitDiff(mystEditorInstance);
          }
        } else if (newMode === "Gitdiff") {
          // Clear merge view if plugin is available
          if (pluginInstance) {
            pluginInstance.clearMergeView(mystEditorInstance);
          } else {
            // Fallback: clear merge compartment directly
            if (mystEditorInstance.editorView?.v) {
              mystEditorInstance.editorView.v.dispatch({
                effects: mergeCompartment.reconfigure([]),
              });
            }
          }
          setupGitPanel();
        }
      });
    });
  });

  localStorage.setItem('lastOpened', filename);
}

// Insert image markdown into editor
export function insertImageMarkdown(path) {
  const filename = path.split("/").pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  const altText = dotIndex > -1 ? filename.substring(0, dotIndex) : filename;
  const imgSyntax = `![${altText}](/${path})`;
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }
  console.log(view);
  const { state } = view.v;
  const { from, to } = state.selection.main; // selection range
   view.v.dispatch({
    changes: { from, to, insert: imgSyntax },
    selection: { anchor: from + imgSyntax.length } // cursor after insert
  });

  view.v.focus();
}
