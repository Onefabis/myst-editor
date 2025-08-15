import { StateEffect } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";

/* Create a popup window, called by RMB menu to rename image file name and update markdown
inside the editor with that updated name. 
It operates with images inside the "_static" structure */
function createRenameModal() {
  const modal = document.createElement("div");
  modal.id = "rename-image-modal";

  const content = document.createElement("div");
  content.className = "rename-modal-content";

  const closeBtn = document.createElement("div");
  closeBtn.innerHTML = "&times;";
  closeBtn.className = "rename-close-btn";

  const title = document.createElement("h3");
  title.textContent = "Rename Image";
  title.style.margin = "0 0 10px 0";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "rename-input";

  const actions = document.createElement("div");
  actions.className = "rename-actions";

  const renameBtn = document.createElement("button");
  renameBtn.textContent = "Rename";
  renameBtn.className = "rename-btn rename-btn-green";

  const incrementBtn = document.createElement("button");
  incrementBtn.textContent = "Increment";
  incrementBtn.className = "rename-btn rename-btn-blue";

  const overwriteBtn = document.createElement("button");
  overwriteBtn.textContent = "Overwrite";
  overwriteBtn.className = "rename-btn rename-btn-orange";

  actions.appendChild(renameBtn);
  actions.appendChild(overwriteBtn);
  actions.appendChild(incrementBtn);

  content.appendChild(closeBtn);
  content.appendChild(title);
  content.appendChild(input);
  content.appendChild(actions);
  modal.appendChild(content);
  document.body.appendChild(modal);

  return { modal, input, renameBtn, incrementBtn, overwriteBtn, closeBtn, title };
}

const renameModal = createRenameModal();

/* Shortens a filename if it exceeds the max length. 
Checks string length and appends "..." if too long, simply make the rename title readable. */
function truncateName(name, maxLength = 20) {
  return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
}

/* Displays and configures the rename modal for a specific file path.
It orchestrates the rename operation lifecycle (UI state → server request → UI update).
Internally:
- Prepares modal with initial filename.
- Sends rename requests to the backend.
- Handles name collisions by showing alternate action buttons. */
function showRenameModal(oldPath, onSuccess) {
  const segments = oldPath.split("/"); // Split whole path into a folder + filename segments
  const oldName = segments.pop(); // Get filename of the image
  const dirPath = segments.join("/"); // Get project-relative path to the current image

  // Split image name into the name itself and extension, only nice name displayed in the rename field
  const dotIndex = oldName.lastIndexOf(".");
  const baseName = dotIndex > -1 ? oldName.substring(0, dotIndex) : oldName;
  const extension = dotIndex > -1 ? oldName.substring(dotIndex) : "";

  renameModal.input.value = baseName;

  renameModal.modal.classList.add("active");
  renameModal.renameBtn.classList.remove("hidden");
  renameModal.incrementBtn.classList.add("hidden");
  renameModal.overwriteBtn.classList.add("hidden");
  renameModal.title.textContent = "Rename Image";
  renameModal.input.focus();

  // Backend called by increment, overwrite or rename button
  async function checkCollision(actionType) {
    const newName = renameModal.input.value.trim() + extension;
    const newPath = (dirPath ? `${dirPath}/${newName}` : newName).replace(/^\/+/, "").replace(/\\/g, "/"); // remove leading slashes and then convert backslashes -> forward slashes
    const oldPathClean = oldPath.replace(/^\/+/, "").replace(/\\/g, "/"); // remove leading slashes and then convert backslashes -> forward slashes

    const res = await fetch("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldPath: oldPathClean,
        newPath,
        action: actionType
      })
    });

    const data = await res.json();

    if (res.status === 409 && data.collision) { // image with new name is already here, hide rename and unhide overwrite and increment buttons
      const truncated = truncateName(renameModal.input.value.trim());
      renameModal.title.textContent = `Image "${truncated}" already exist`;
      renameModal.renameBtn.classList.add("hidden");
      renameModal.incrementBtn.classList.remove("hidden");
      renameModal.overwriteBtn.classList.remove("hidden");
    } else if (res.ok) { // no image with the same name, proceed with rename pipeline
      renameModal.modal.classList.remove("active");
      if (onSuccess) onSuccess(data.newPath || newPath);
    } else { // something is wrong on the backend, check the folder structure and system write access
      alert(data.error || "Rename failed");
    }
  }

  // Send to backend "rename" function different action arguments:
  renameModal.renameBtn.onclick = () => checkCollision("check");
  renameModal.incrementBtn.onclick = () => checkCollision("increment");
  renameModal.overwriteBtn.onclick = () => checkCollision("overwrite");
  // Close modalbutton
  renameModal.closeBtn.onclick = () => renameModal.modal.classList.remove("active");

  // Catch common hotkeys here and approve or close rename window states
  document.onkeydown = (e) => {
    if (e.key === "Enter") renameModal.renameBtn.click();
    else if (e.key === "Escape") renameModal.closeBtn.click();
  };
}

/* Finds the image path markdown link under the editor's cursor.
Internally:
- Parses current line for Markdown image syntax.
- Returns the path and its text range. */
function getImagePathRangeUnderCursor(view) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const text = line.text;

  const regex = /!\[[^\]]*\]\(([^)]+)\)/g; // Find pattren for the markdown image link ![...](...)
  let match;
  while ((match = regex.exec(text))) {
    const fullStart = line.from + match.index;
    const fullEnd = fullStart + match[0].length;
    if (sel.from >= fullStart && sel.to <= fullEnd) {
      const pathStart = fullStart + match[0].indexOf("(") + 1;
      const pathEnd = fullStart + match[0].lastIndexOf(")");
      return { path: match[1], from: pathStart, to: pathEnd };
    }
  }
  return null;
}

// StateEffect to trigger modal from outside
const showRenameEffect = StateEffect.define();

/* CodeMirror plugin that listens for `showRenameEffect` and opens the modal.
Integrates the rename modal with CodeMirror editor.
Internally:
- Checks cursor position for an image path.
- Opens rename modal and updates editor text after rename. */
const renamePopupPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
    }
    update(update) {
      for (let tr of update.transactions) {
        for (let e of tr.effects) {
          if (e.is(showRenameEffect)) {
            const info = getImagePathRangeUnderCursor(this.view);
            if (info) {
              showRenameModal(info.path, (newPath) => {
                if (!newPath.startsWith("/")) newPath = "/" + newPath;
                this.view.dispatch({
                  changes: { from: info.from, to: info.to, insert: newPath }
                });
              });
            } else {
              alert("No image path found under cursor.");
            }
          }
        }
      }
    }
  }
);

export const renameExtension = [renamePopupPlugin];

/* Export extension fuction so it may be called from external fuction. */
export function showRenamePopup(view) {
  view.v.dispatch({ effects: showRenameEffect.of(null) });
}
