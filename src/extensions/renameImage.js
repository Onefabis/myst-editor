import { StateEffect } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";

// ============================
// Modal Creation
// ============================
function createRenameModal() {
  const modal = document.createElement("div");
  modal.id = "rename-image-modal";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.4)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "2000";
  modal.style.display = "none";

  const content = document.createElement("div");
  content.style.position = "relative";
  content.style.background = "white";
  content.style.padding = "14px";
  content.style.borderRadius = "7px";
  content.style.minWidth = "320px";
  content.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";

  // Close button
  const closeBtn = document.createElement("div");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "-11px";
  closeBtn.style.right = "-11px";
  closeBtn.style.width = "25px";
  closeBtn.style.height = "25px";
  closeBtn.style.background = "rgb(209 29 24)";
  closeBtn.style.color = "white";
  closeBtn.style.borderRadius = "50%";
  closeBtn.style.display = "flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontWeight = "bold";
  closeBtn.style.fontSize = "18px";

  const title = document.createElement("h3");
  title.textContent = "Rename Image";
  title.style.margin = "0 0 10px 0";

  const input = document.createElement("input");
  input.type = "text";
  input.style.width = "98%";
  input.style.lineHeight = "22px";
  input.style.margin = "0 0 12px";
  input.style.border = "1px solid rgb(219 209 209)";
  input.style.borderRadius = "3px";
  input.style.outline = "none"; // prevent blue outline
  input.onfocus = () => {
    input.style.border = "1px solid rgb(219 209 209)"; // keep same as unfocused
  };
  input.onblur = () => {
    input.style.border = "1px solid rgb(219 209 209)";
  };

  // Action buttons
  const actions = document.createElement("div");
  actions.style.display = "grid";
  actions.style.gridTemplateColumns = "1fr 1fr";
  actions.style.gap = "8px";

  const renameBtn = document.createElement("button");
  renameBtn.textContent = "Rename";
  renameBtn.style.padding = "6px 8px";
  renameBtn.style.border = "1px dashed rgb(92, 184, 92)";
  renameBtn.style.borderLeft = "3px solid rgb(92, 184, 92)";
  renameBtn.style.borderRadius = "6px";
  renameBtn.style.cursor = "pointer";

  const incrementBtn = document.createElement("button");
  incrementBtn.textContent = "Increment";
  incrementBtn.style.padding = "6px 8px";
  incrementBtn.style.border = "1px dashed rgb(2, 117, 216)";
  incrementBtn.style.borderLeft = "3px solid rgb(2, 117, 216)";
  incrementBtn.style.borderRadius = "6px";
  incrementBtn.style.cursor = "pointer";

  const overwriteBtn = document.createElement("button");
  overwriteBtn.textContent = "Overwrite";
  overwriteBtn.style.padding = "6px 8px";
  overwriteBtn.style.border = "1px dashed rgb(240, 173, 78)";
  overwriteBtn.style.borderLeft = "3px solid rgb(240, 173, 78)";
  overwriteBtn.style.borderRadius = "6px";
  overwriteBtn.style.cursor = "pointer";

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

// ============================
// Helper for truncating names
// ============================
function truncateName(name, maxLength = 20) {
  return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
}


// ============================
// Modal Logic
// ============================
function showRenameModal(oldPath, onSuccess) {
  oldPath = oldPath.replace(/\\/g, "/");
  const segments = oldPath.split("/");
  const oldName = segments.pop();
  const dirPath = segments.join("/");

  const dotIndex = oldName.lastIndexOf(".");
  const baseName = dotIndex > -1 ? oldName.substring(0, dotIndex) : oldName;
  const extension = dotIndex > -1 ? oldName.substring(dotIndex) : "";

  renameModal.input.value = baseName;
  renameModal.modal.style.display = "flex";
  renameModal.renameBtn.style.display = "inline-block";
  renameModal.incrementBtn.style.display = "none";
  renameModal.overwriteBtn.style.display = "none";
  renameModal.title.textContent = "Rename Image"; // reset title
  renameModal.input.focus();

  async function checkCollision(actionType) {
    const newName = renameModal.input.value.trim() + extension;
    const newPath = (dirPath ? `${dirPath}/${newName}` : newName)
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");

    const oldPathClean = oldPath.replace(/^\/+/, "").replace(/\\/g, "/");

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

    if (res.status === 409 && data.collision) {
      // Change title to collision message
      const truncated = truncateName(renameModal.input.value.trim());
      renameModal.title.textContent = `Image "${truncated}" already exist`;

      renameModal.renameBtn.style.display = "none";
      renameModal.incrementBtn.style.display = "inline-block";
      renameModal.overwriteBtn.style.display = "inline-block";
    } else if (res.ok) {
      renameModal.modal.style.display = "none";
      if (onSuccess) onSuccess(data.newPath || newPath);
    } else {
      alert(data.error || "Rename failed");
    }
  }

  renameModal.renameBtn.onclick = () => checkCollision("check");
  renameModal.incrementBtn.onclick = () => checkCollision("increment");
  renameModal.overwriteBtn.onclick = () => checkCollision("overwrite");
  renameModal.closeBtn.onclick = () => (renameModal.modal.style.display = "none");

  document.onkeydown = (e) => {
    if (e.key === "Enter") renameModal.renameBtn.click();
    else if (e.key === "Escape") renameModal.closeBtn.click();
  };
}

// ============================
// Get image path range under cursor
// ============================
function getImagePathRangeUnderCursor(view) {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.from);
  const text = line.text;

  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
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

const showRenameEffect = StateEffect.define();

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
export function showRenamePopup(view) {
  view.v.dispatch({ effects: showRenameEffect.of(null) });
}
