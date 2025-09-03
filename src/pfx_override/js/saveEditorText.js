import { autosaveEnabled } from '../../MystEditor.jsx';
import { mystEditorInstance } from "./MainOverride.js";

// Track last saved timestamp
let lastSavedTimestamp = null;

export function setLastSavedTimestamp(timestamp) {
  lastSavedTimestamp = timestamp;
}

function isAutosaveOn() {
  return !!autosaveEnabled.value;
}

// Bind Ctrl+S / Cmd+S globally
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveCurrentEditorContent(true); // Manual save
  }
});

export async function bindFocusBlurHandlers(view) {
  view.contentDOM.addEventListener('blur', async () => {
    if (!isAutosaveOn()) return; 
    const path = localStorage.getItem('currentPath');
    if (!path) return;

    try {
      const res = await fetch(`/api/file/meta?path=${encodeURIComponent(path)}`); 
      if (!res.ok) return;
      const latest = await res.json();
      if (latest.last_modified && latest.last_modified !== lastSavedTimestamp) {
        saveCurrentEditorContent();
      }
    } catch (err) {
      console.error("Error checking file timestamp:", err);
    }
  });

  view.contentDOM.addEventListener('focus', async () => {

    // Simple modal with Ok / Cancel buttons
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
          resolve(true); // Ok → reload
        };
        confirmModal.cancelBtn.onclick = () => {
          cleanup();
          resolve(false); // Cancel → keep current (save)
        };
      });
    }

    if (!isAutosaveOn()) return; 
    const path = localStorage.getItem('currentPath');
    if (!path) return;

    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) return;
      const latest = await res.json();
      
      if (latest.last_modified && latest.last_modified !== lastSavedTimestamp) {
        const shouldReload = await showConfirmModal(
          'File changed externally. Reload with external changes or discard external changes?'
        );
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

// Save current editor content and update timestamp
export async function saveCurrentEditorContent(manual = false) {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    if (manual) alert("Editor is not ready.");
    return;
  }

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
