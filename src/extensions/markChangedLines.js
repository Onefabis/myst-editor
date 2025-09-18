import { ViewPlugin, EditorView } from "@codemirror/view";
import * as merge from "@codemirror/merge";
import { mergeCompartment } from "../components/CodeMirror";

// Global plugin instance
export let pluginInstance = null;

// Custom theme: hide old text and red markers
const onlyGreenTheme = EditorView.baseTheme({
  ".cm-mergeView .cm-panels": { display: "none" },
  ".cm-change-deleted": { display: "none" },
  ".cm-deletedChunk": { display: "none" },
  ".cm-merge-revert": { display: "none" },
  ".cm-original": { display: "none" },
});

let pluginReadyResolve;
export let pluginReady = new Promise((res) => {
  pluginReadyResolve = res;
});

class MystPluginClass {
  constructor(view) {
    this.view = view;
    this.mystEditor = null; // will store the editor instance
    this.isGitdiffMode = false;
    this.leftContent = ""; // Git HEAD content
    pluginInstance = this;

    if (pluginReadyResolve) {
      pluginReadyResolve();
      pluginReadyResolve = null;
    }
  }

  setEditorInstance(mystEditor) {
    this.mystEditor = mystEditor;
  }

  handleModeChange(newMode, mystEditor) {
    this.setEditorInstance(mystEditor);

    if (["Both", "Source", "Inline"].includes(newMode)) {
      this.isGitdiffMode = false;
      this.show(mystEditor);
    } else if (newMode === "Gitdiff") {
      this.isGitdiffMode = true;
      this.clearMergeView(mystEditor);
    }
  }

  async show(mystEditor) {
    this.setEditorInstance(mystEditor);

    const filename = localStorage.getItem("currentPath");
    if (!filename) return;

    const headResp = await fetch("/api/git-head");
    const headData = await headResp.json();
    if (!headData.head) return;

    const diffResp = await fetch("/get-file-from-git", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        branch_left: headData.active_branch,
        commit_left: headData.head,
        branch_right: headData.active_branch,
        commit_right: headData.head,
      }),
    });

    const diffData = await diffResp.json();
    const leftContent = diffData.left_content || "";
    if (leftContent.startsWith("// File not found")) return;

    this.leftContent = leftContent;

    const rightContent = mystEditor.editorView.v.state.doc.toString();

    mystEditor.editorView.v.dispatch({
      effects: mergeCompartment.reconfigure([
        merge.unifiedMergeView({
          original: leftContent,
          doc: rightContent,
          mergeControls: false,
        }),
        onlyGreenTheme,
      ]),
    });

    this.updateRevertButton();
  }

  updateRevertButton() {
    if (!this.mystEditor) return;

    const revertBtn = this.mystEditor.options.includeButtons.value.find(
      (b) => b.id === "revert"
    );

    if (revertBtn) {
      const rightContent = this.mystEditor.editorView.v.state.doc.toString();
      const visible = this.leftContent !== rightContent;

      if (revertBtn.visible !== visible) {
        revertBtn.visible = visible;
        this.mystEditor.options.includeButtons.value = [
          ...this.mystEditor.options.includeButtons.value,
        ];
      }
    }
  }

  clearMergeView(mystEditor) {
    mystEditor.editorView.v.dispatch({
      effects: mergeCompartment.reconfigure([]),
    });
  }

  async revert() {
    if (!this.mystEditor) return;

    const confirmed = await this.showRevertConfirmationModal();
    if (!confirmed) return;

    const filename = localStorage.getItem("currentPath");
    if (!filename) return;

    try {
      const headResp = await fetch("/api/git-head");
      const headData = await headResp.json();
      if (!headData.head) return;

      const diffResp = await fetch("/get-file-from-git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          branch_left: headData.active_branch,
          commit_left: headData.head,
          branch_right: headData.active_branch,
          commit_right: headData.head,
        }),
      });

      const diffData = await diffResp.json();
      const gitContent = diffData.left_content || "";
      if (gitContent.startsWith("// File not found")) return;

      const view = this.mystEditor.editorView.v;
      const currentDoc = view.state.doc;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: gitContent },
        selection: { anchor: 0 },
      });

      this.updateRevertButton();
    } catch (error) {
      console.error("Error reverting file:", error);
      alert("Failed to revert file to git version");
    }
  }

  showRevertConfirmationModal() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed; top:0; left:0;
        width:100%; height:100%;
        background-color: rgba(0,0,0,0.5);
        display:flex; justify-content:center; align-items:center;
        z-index:10000; font-family:Arial,sans-serif;
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        background:white; border-radius:8px;
        padding:24px; box-shadow:0 4px 20px rgba(0,0,0,0.3);
        min-width:400px; max-width:500px;
      `;

      modal.innerHTML = `
        <h3 style="margin:0 0 16px 0;color:#333;font-size:18px;">Confirm Revert</h3>
        <p style="margin:0 0 24px 0;color:#666;line-height:1.5;">
          Are you sure you want to revert all changes? This will replace your current content with the latest git commit version.
        </p>
        <div style="display:flex;gap:12px;justify-content:flex-end;">
          <button id="cancelRevert" style="
            background:#f5f5f5;border:1px solid #ddd;border-radius:4px;
            padding:8px 16px;cursor:pointer;font-size:14px;">Cancel</button>
          <button id="confirmRevert" style="
            background:#dc3545;color:white;border:1px solid #dc3545;
            border-radius:4px;padding:8px 16px;cursor:pointer;font-size:14px;">OK</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cancelBtn = modal.querySelector("#cancelRevert");
      const confirmBtn = modal.querySelector("#confirmRevert");

      const cleanup = () => document.body.removeChild(overlay);

      cancelBtn.addEventListener("click", () => { cleanup(); resolve(false); });
      confirmBtn.addEventListener("click", () => { cleanup(); resolve(true); });
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { cleanup(); resolve(false); } });

      const handleKeyPress = (e) => { if (e.key === "Escape") { cleanup(); document.removeEventListener("keydown", handleKeyPress); resolve(false); } };
      document.addEventListener("keydown", handleKeyPress);

      setTimeout(() => confirmBtn.focus(), 100);
    });
  }

  destroy() { 
  }
}

// Plugin instance + live update listener
export const markChangedLinesPlugin = ViewPlugin.fromClass(MystPluginClass);
export const mystExtension = [
  markChangedLinesPlugin,
  EditorView.updateListener.of((update) => {
    if (update.docChanged) pluginInstance?.updateRevertButton();
  }),
];

// Convenience functions
export function showLatestCommitDiff(mystEditor) {
  pluginInstance?.show(mystEditor);
}

export function revertFileChanges() {
  pluginInstance?.revert();
}
