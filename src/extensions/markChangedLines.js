import { ViewPlugin, EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import * as merge from "@codemirror/merge";
import { mergeCompartment } from "../components/CodeMirror";

// Global plugin instance for external access
export let pluginInstance = null;

// Custom theme: hide old text and red markers
const onlyGreenTheme = EditorView.baseTheme({
  ".cm-mergeView .cm-panels": { display: "none" },
  ".cm-change-deleted": { display: "none" },
  ".cm-deletedChunk": { display: "none" },
  ".cm-merge-revert": { display: "none" },
  ".cm-original": { display: "none" },
});

// Resettable pluginReady promise
let pluginReadyResolve;
export let pluginReady = new Promise((res) => {
  pluginReadyResolve = res;
});

function createPluginReady() {
  pluginReady = new Promise((res) => {
    pluginReadyResolve = res;
  });
}

class MystPluginClass {
  constructor(view) {
    this.view = view;
    pluginInstance = this;
    this.isGitdiffMode = false; // default
    
    // Resolve the plugin ready promise
    if (pluginReadyResolve) {
      pluginReadyResolve();
      pluginReadyResolve = null;
    }
    
    // console.log("Plugin instance created and ready");
  }

  handleModeChange(newMode, mystEditor) {
    const wasGitdiffMode = this.isGitdiffMode;
    
    // console.log(`Mode change: ${wasGitdiffMode ? 'Gitdiff' : 'Regular'} -> ${newMode}`);
    
    if (["Both", "Source", "Inline"].includes(newMode)) {
      this.isGitdiffMode = false;
      
      // Always trigger merge injection for regular modes
      // console.log("Triggering merge injection for mode:", newMode);
      this.show(mystEditor);
      
    } else if (newMode === "Gitdiff") {
      this.isGitdiffMode = true;
      // Clear any existing merge view when entering Gitdiff mode
      this.clearMergeView(mystEditor);
    }
  }

  async show(mystEditor) {
    // Remove the isGitdiffMode check here since we want to allow injection
    // when switching FROM Gitdiff mode
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

    const rightContent = mystEditor.editorView.v.state.doc.toString();
    
    mystEditor.editorView.v.dispatch({
      effects: mergeCompartment.reconfigure([
        merge.unifiedMergeView({ 
          original: leftContent, 
          doc: rightContent, 
          mergeControls: false 
        }),
        onlyGreenTheme,
      ]),
    });
    
    // console.log("Injected merge view for:", filename);
  }

  clearMergeView(mystEditor) {
    // Clear the merge view by reconfiguring with empty extensions
    mystEditor.editorView.v.dispatch({
      effects: mergeCompartment.reconfigure([]),
    });
    // console.log("Cleared merge view");
  }

  async revert(mystEditor) { 
    // console.log("Revert button clicked, showing confirmation modal...");
    
    // Create and show confirmation modal
    const confirmed = await this.showRevertConfirmationModal();
    
    if (!confirmed) {
      console.log("Revert cancelled by user");
      return;
    }
    
    // console.log("Revert confirmed, proceeding...");
    
    const filename = localStorage.getItem("currentPath");
    if (!filename) {
      console.warn("No current file path found");
      return;
    }

    try {
      // Get the latest commit content (same logic as in show method)
      const headResp = await fetch("/api/git-head");
      const headData = await headResp.json();
      if (!headData.head) {
        console.warn("No HEAD commit found");
        return;
      }

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
      
      if (gitContent.startsWith("// File not found")) {
        console.warn("File not found in git repository");
        return;
      }

      // Replace the entire editor content with git content
      const view = mystEditor.editorView.v;
      const currentDoc = view.state.doc;
      
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: gitContent
        },
        selection: { anchor: 0 } // Move cursor to beginning
      });
      
      console.log("Successfully reverted file to git content");
      
    } catch (error) {
      console.error("Error reverting file:", error);
      alert("Failed to revert file to git version");
    }
  }

  showRevertConfirmationModal() {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: Arial, sans-serif;
      `;

      // Create modal dialog
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        min-width: 400px;
        max-width: 500px;
      `;

      // Create modal content
      modal.innerHTML = `
        <h3 style="margin: 0 0 16px 0; color: #333; font-size: 18px;">Confirm Revert</h3>
        <p style="margin: 0 0 24px 0; color: #666; line-height: 1.5;">
          Are you sure you want to revert all changes? This will replace your current content with the latest git commit version.
        </p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="cancelRevert" style="
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
          ">Cancel</button>
          <button id="confirmRevert" style="
            background: #dc3545;
            color: white;
            border: 1px solid #dc3545;
            border-radius: 4px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
          ">OK</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Add event listeners
      const cancelBtn = modal.querySelector('#cancelRevert');
      const confirmBtn = modal.querySelector('#confirmRevert');

      const cleanup = () => {
        document.body.removeChild(overlay);
      };

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      // Close on Escape key
      const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          document.removeEventListener('keydown', handleKeyPress);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleKeyPress);

      // Focus the confirm button
      setTimeout(() => confirmBtn.focus(), 100);
    });
  }

  destroy() { 
    console.log("Plugin instance destroyed");
    // Don't set to null immediately, let the new instance replace it
    // pluginInstance = null; 
  }
}

export const markChangedLinesPlugin = ViewPlugin.fromClass(MystPluginClass);
export const mystExtension = [markChangedLinesPlugin];

// Convenience function for external use
export function showLatestCommitDiff(mystEditor) {
  pluginInstance?.show(mystEditor);
}

export function revertFileChanges(mystEditor) {
  pluginInstance?.revert(mystEditor);
}