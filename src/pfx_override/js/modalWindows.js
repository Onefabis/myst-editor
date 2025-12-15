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

  document.getElementById("modal-ok").onclick = () => {
    modal.remove();
    if (onClose) onClose();
  };
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

    document.getElementById("confirm-cancel").onclick = () => {
      modal.remove();
      resolve(false);
    };
    document.getElementById("confirm-ok").onclick = () => {
      modal.remove();
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

    document.getElementById("rename-cancel").onclick = () => {
      modal.remove();
      resolve(null);
    };
    document.getElementById("rename-ok").onclick = () => {
      const value = document.getElementById("rename-input").value.trim();
      modal.remove();
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
  modal.className = "modal-overlay";

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

  document.getElementById("stop-action").onclick = () => {
    if (onStop) onStop();
    modal.remove();
  };

  return {
    updateMessage: (msg) => {
      const el = document.getElementById("progress-msg");
      if (el) el.textContent = msg;
    },
    close: () => modal.remove(),
  };
}
