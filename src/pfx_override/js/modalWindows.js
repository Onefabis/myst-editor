// ========================= Helper: attachModalKeyHandlers =========================
function attachModalKeyHandlers({ okButton = null, cancelButton = null, onClose = null }) {
  const handleKey = (e) => {
    if (e.key === "Enter" && okButton) {
      e.preventDefault();
      okButton.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (cancelButton) {
        cancelButton.click();
      } else if (onClose) {
        onClose();
      }
    }
  };

  document.addEventListener("keydown", handleKey);

  // Return cleanup so modal can remove listener when closing
  return () => document.removeEventListener("keydown", handleKey);
}

// ========================= showModal =========================
export function showModal(title, message, { isError = false, onClose = null } = {}) {
  const existing = document.getElementById("git-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "git-modal";
  modal.className = "tree-modal-overlay";

  const content = document.createElement("div");
  content.className = `tree-modal-content ${isError ? "error" : "success"}`;
  content.innerHTML = `
    <h2>${title}</h2>
    <pre>${message}</pre>
    <div class="modal-buttons">
      <button id="modal-ok" class="ok">OK</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const okBtn = document.getElementById("modal-ok");

  const closeModal = () => {
    modal.remove();
    cleanup();
    if (onClose) onClose();
  };

  const cleanup = attachModalKeyHandlers({ okButton: okBtn, onClose: closeModal });

  okBtn.onclick = closeModal;
}

// ========================= showConfirm =========================
export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const existing = document.getElementById("git-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "git-modal";
    modal.className = "tree-modal-overlay";

    const content = document.createElement("div");
    content.className = "tree-modal-content confirm";
    content.innerHTML = `
      <h2>${title}</h2>
      <pre>${message}</pre>
      <div class="modal-buttons">
        <button id="confirm-cancel" class="cancel">Cancel</button>
        <button id="confirm-ok" class="ok">Continue</button>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    const cancelBtn = document.getElementById("confirm-cancel");
    const okBtn = document.getElementById("confirm-ok");

    const cleanup = attachModalKeyHandlers({
      okButton: okBtn,
      cancelButton: cancelBtn,
    });

    const close = () => {
      modal.remove();
      cleanup();
    };

    cancelBtn.onclick = () => {
      close();
      resolve(false);
    };

    okBtn.onclick = () => {
      close();
      resolve(true);
    };
  });
}

// ========================= showInputModal =========================
export function showInputModal(title, message, defaultValue = "") {
  return new Promise((resolve) => {
    const existing = document.getElementById("git-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "git-modal";
    modal.className = "tree-modal-overlay";

    const content = document.createElement("div");
    content.className = "tree-modal-content";
    content.innerHTML = `
      <h2>${title}</h2>
      <p>${message}</p>
      <input id="rename-input" type="text" value="${defaultValue}" />
      <div class="modal-buttons">
        <button id="rename-cancel" class="cancel">Cancel</button>
        <button id="rename-ok" class="ok">Rename</button>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    const input = document.getElementById("rename-input");
    const cancelBtn = document.getElementById("rename-cancel");
    const okBtn = document.getElementById("rename-ok");

    input.focus();

    const cleanup = attachModalKeyHandlers({
      okButton: okBtn,
      cancelButton: cancelBtn,
    });

    const close = () => {
      modal.remove();
      cleanup();
    };

    cancelBtn.onclick = () => {
      close();
      resolve(null);
    };

    okBtn.onclick = () => {
      const value = input.value.trim();
      close();
      resolve(value);
    };
  });
}

// ========================= showProgressModal =========================
export function showProgressModal(title, { onStop = null } = {}) {
  const existing = document.getElementById("git-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "git-modal";
  modal.className = "tree-modal-overlay";

  const content = document.createElement("div");
  content.className = "tree-modal-content";
  content.innerHTML = `
    <h2>${title}</h2>
    <pre id="progress-msg">Please wait...</pre>
    <div class="modal-buttons">
      <button id="stop-action" class="stop">Stop</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const stopBtn = document.getElementById("stop-action");

  const close = () => {
    cleanup();
    modal.remove();
  };

  const cleanup = attachModalKeyHandlers({
    okButton: stopBtn, // Enter or Esc both trigger Stop
    cancelButton: stopBtn,
  });

  stopBtn.onclick = () => {
    if (onStop) onStop();
    close();
  };

  return {
    updateMessage: (msg) => {
      const el = document.getElementById("progress-msg");
      if (el) el.textContent = msg;
    },
    close,
  };
}
