import { autosaveEnabled } from '../../MystEditor.jsx';
import { mystEditorInstance } from "./MainOverride";

// ========================= STATE MANAGEMENT =========================

/**
 * Tracks the timestamp of the most recent successful file save.
 * Used to detect external file modifications and avoid overwrite conflicts.
 */
let lastSavedTimestamp = null;

/** Updates the globally tracked save timestamp. */
export function setLastSavedTimestamp(timestamp) {
  lastSavedTimestamp = timestamp;
}

/** Returns true if autosave mode is currently active. */
function isAutosaveOn() {
  return !!autosaveEnabled.value;
}


// ========================= EDITOR EVENT BINDINGS =========================

/**
 * Attaches focus and blur event handlers to the editor view.
 * These events allow autosave and file conflict detection to occur
 * passively based on user attention rather than manual triggers.
 */
export async function bindFocusBlurHandlers(view) {
  
  /**
   * On blur (when editor loses focus):
   * If autosave is enabled and the file has changed externally,
   * trigger a save to sync latest modifications.
   */
  view.contentDOM.addEventListener('blur', async () => {
    if (!isAutosaveOn()) return; 
    const path = localStorage.getItem('currentPath');
    if (!path) return;

    try {
      const res = await fetch(`/api/file/meta?path=${encodeURIComponent(path)}`); 
      if (!res.ok) return;
      const latest = await res.json();

      // If server-side timestamp differs, update file automatically.
      if (latest.last_modified && latest.last_modified !== lastSavedTimestamp) {
        saveCurrentEditorContent();
      }
    } catch (err) {
      console.error("Error checking file timestamp:", err);
    }
  });

  /**
   * On focus (when editor regains attention):
   * Compares local content with server-side version to detect
   * potential external edits made while unfocused.
   * Prompts the user to reload or discard changes via a custom modal.
   */
  view.contentDOM.addEventListener('focus', async () => {

    // ===== MODAL CREATION UTILITY =====
    /**
     * Constructs a lightweight, ephemeral confirmation modal
     * for handling file change conflicts interactively.
     */
    function createConfirmModal() {
      const modal = document.createElement("div");
      modal.id = "custom-confirm-modal";
      modal.className = "upload-modal hidden";

      const content = document.createElement("div");
      content.className = "upload-modal-content";

      const title = document.createElement("h3");
      title.className = "upload-modal-title";
      title.textContent = "File Changed";

      const message = document.createElement("p");
      message.className = "confirm-modal-message";

      const actions = document.createElement("div");
      actions.className = "upload-modal-actions";

      const okBtn = document.createElement("button");
      okBtn.textContent = "Reload";
      okBtn.className = "btn-green";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Discard changes";
      cancelBtn.className = "btn-orange";

      actions.appendChild(okBtn);
      actions.appendChild(cancelBtn);
      content.appendChild(title);
      content.appendChild(message);
      content.appendChild(actions);
      modal.appendChild(content);
      document.body.appendChild(modal);

      return { modal, message, okBtn, cancelBtn };
    }

    const confirmModal = createConfirmModal();

    /**
     * Displays the modal and resolves to a boolean
     * depending on user intent (true = reload).
     */
    function showConfirmModal(text) {
      return new Promise((resolve) => {
        confirmModal.message.textContent = text;
        confirmModal.modal.classList.remove("hidden");

        function cleanup() {
          confirmModal.modal.classList.add("hidden");
          confirmModal.okBtn.onclick = null;
          confirmModal.cancelBtn.onclick = null;
        }

        confirmModal.okBtn.onclick = () => {
          cleanup();
          resolve(true);
        };
        confirmModal.cancelBtn.onclick = () => {
          cleanup();
          resolve(false);
        };
      });
    }

    // ===== EXTERNAL FILE CHECK =====
    if (!isAutosaveOn()) return; 
    const path = localStorage.getItem('currentPath');
    if (!path) return;

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) return;
      const latest = await res.json();
      
      // Compare timestamps to detect remote changes
      if (latest.last_modified && latest.last_modified !== lastSavedTimestamp) {
        const shouldReload = await showConfirmModal(
          'File changed externally. Reload with external changes or discard external changes?'
        );
        
        // True → reload external file; false → keep current local edits
        if (shouldReload) {
          view.dispatch({
            changes: { from: 0, to: view.state?.doc.length, insert: latest.content },
            selection: { anchor: 0 }
          });
          lastSavedTimestamp = latest.last_modified;
          saveCurrentEditorContent(true);
        } else {
          saveCurrentEditorContent(true);
        }
      }
    } catch (err) {
      console.error("Error checking external file:", err);
    }
  });
}

// ========================= EDITOR INITIALIZATION =========================

/**
 * Waits for the MyST editor instance to become fully ready.
 * Resolves only once the editor's internal DOM (contentDOM)
 * is available for event binding or manipulation.
 */
export function waitForEditorReady() {
  return new Promise((resolve) => {
    const check = () => {
      const view = mystEditorInstance?.editorView?.v;
      if (view?.contentDOM) {
        resolve(view);
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

// ========================= SAVE HANDLING =========================

/**
 * Saves the current editor content to the backend and updates the local timestamp.
 * - If invoked manually (`manual = true`), alerts on failure.
 * - Integrates seamlessly with autosave and external modification checks.
 */
export async function saveCurrentEditorContent(manual = false) {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    if (manual) alert("Editor is not ready.");
    return;
  }
  if (!view.v) return;

  const content = view.v.state.sliceDoc(0, view.state?.doc.length);
  const path = localStorage.getItem('currentPath');

  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      const saved = await res.json();
      setLastSavedTimestamp(saved.last_modified);
    }
  } catch (err) {
    if (manual) alert("Save failed: " + err.message);
  }
}

// ========================= GLOBAL SHORTCUT BINDING =========================

/**
 * Registers a global listener for Ctrl+S / Cmd+S keyboard shortcuts.
 * Enables manual saving regardless of editor focus.
 */
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveCurrentEditorContent(true); // Manual save trigger
  }
});
