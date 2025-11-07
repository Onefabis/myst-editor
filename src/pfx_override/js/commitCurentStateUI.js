import { fetchGitCommitTree, fetchLocalTree, normalizePath, restoreActiveFile } from "./leftPanelFileTree.js";

function showModal(title, message, { isError = false, onClose = null } = {}) {
  const existing = document.getElementById("git-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "git-modal";
  // Use inline CSS for full viewport and centering
  modal.style.position = "fixed";
  modal.style.top = 0;
  modal.style.left = 0;
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.backgroundColor = "rgba(0,0,0,0.4)";
  modal.style.zIndex = 9999;

  const content = document.createElement("div");
  content.style.backgroundColor = isError ? "#ffe6e6" : "#f0fff4"; // optional
  content.style.color = "#111";
  content.style.borderRadius = "16px";
  content.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
  content.style.width = "420px";
  content.style.maxHeight = "90vh";
  content.style.overflowY = "auto";
  content.style.padding = "24px";
  content.innerHTML = `
    <h2 style="font-size:1.25rem; margin-bottom:1rem; color:${isError ? '#c00':'#090'}">${title}</h2>
    <pre style="white-space:pre-wrap; font-size:0.875rem; margin-bottom:1rem; line-height:1.3;">${message}</pre>
    <div style="text-align:right;">
      <button id="modal-ok" style="
        padding:0.5rem 1rem; 
        background:#06f; 
        color:#fff; 
        border:none; 
        border-radius:8px;
        cursor:pointer;
      ">OK</button>
    </div>
  `;
  modal.appendChild(content);
  document.body.appendChild(modal);

  document.getElementById("modal-ok").onclick = () => {
    modal.remove();
    if (onClose) onClose();
  };
}

function showConfirm(title, message) {
  return new Promise((resolve) => {
    const existing = document.getElementById("git-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "git-modal";
    modal.style.position = "fixed";
    modal.style.top = 0;
    modal.style.left = 0;
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.backgroundColor = "rgba(0,0,0,0.4)";
    modal.style.zIndex = 9999;

    const content = document.createElement("div");
    content.style.backgroundColor = "#fff";
    content.style.color = "#111";
    content.style.borderRadius = "16px";
    content.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
    content.style.width = "420px";
    content.style.maxHeight = "90vh";
    content.style.overflowY = "auto";
    content.style.padding = "24px";

    content.innerHTML = `
      <h2 style="font-size:1.25rem; margin-bottom:1rem; color:#06c">${title}</h2>
      <pre style="white-space:pre-wrap; font-size:0.875rem; margin-bottom:1rem; line-height:1.3;">${message}</pre>
      <div style="text-align:right;">
        <button id="confirm-cancel" style="
          padding:0.5rem 1rem; 
          background:#ccc; 
          color:#000; 
          border:none; 
          border-radius:8px; 
          cursor:pointer;
          margin-right:0.5rem;
        ">Cancel</button>
        <button id="confirm-ok" style="
          padding:0.5rem 1rem; 
          background:#06f; 
          color:#fff; 
          border:none; 
          border-radius:8px;
          cursor:pointer;
        ">Continue</button>
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

/* ---------- Reusable Progress Modal ---------- */
function showProgressModal(title, { onStop = null } = {}) {
  const existing = document.getElementById("git-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "git-modal";
  modal.style.position = "fixed";
  modal.style.top = 0;
  modal.style.left = 0;
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.backgroundColor = "rgba(0,0,0,0.4)";
  modal.style.zIndex = 9999;

  const content = document.createElement("div");
  content.style.backgroundColor = "#fff";
  content.style.color = "#111";
  content.style.borderRadius = "16px";
  content.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
  content.style.width = "420px";
  content.style.maxHeight = "90vh";
  content.style.overflowY = "auto";
  content.style.padding = "24px";

  content.innerHTML = `
    <h2 style="font-size:1.25rem; margin-bottom:1rem; color:#06c">${title}</h2>
    <pre id="progress-msg" style="white-space:pre-wrap; font-size:0.875rem; margin-bottom:1rem; line-height:1.3;">Please wait...</pre>
    <div style="text-align:right;">
      <button id="stop-action" style="
        padding:0.5rem 1rem; 
        background:#c00; 
        color:#fff; 
        border:none; 
        border-radius:8px;
        cursor:pointer;
      ">Stop</button>
    </div>
  `;
  modal.appendChild(content);
  document.body.appendChild(modal);

  document.getElementById("stop-action").onclick = () => {
    if (onStop) onStop();
    modal.remove(); // immediately close the modal
  };

  return {
    updateMessage: (msg) => {
      const el = document.getElementById("progress-msg");
      if (el) el.textContent = msg;
    },
    close: () => modal.remove(),
  };
}

/* ---------- Unified Git Action Handler with conflict check ---------- */
export async function runGitAction(action, confirmTitle, confirmMessage) {
  const confirmed = await showConfirm(confirmTitle, confirmMessage);
  if (!confirmed) return;

  const abortController = new AbortController();
  const progressModal = showProgressModal(
    `${action.charAt(0).toUpperCase() + action.slice(1)} in progress...`,
    { onStop: () => abortController.abort() }
  );

  try {
    // --- Call the correct backend endpoint depending on action ---
    let endpoint = "/api/git-sync"; // default (for backward compatibility)
    if (action === "push") endpoint = "/api/git-push";
    if (action === "pull" || action === "refresh") endpoint = "/api/git-pull";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }), // keep action in body if needed
      signal: abortController.signal,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      const text = await res.text();
      progressModal.close();
      showModal("Network Error", text.slice(0, 400), { isError: true });
      return;
    }

    // Known error messages
    const errors = {
      NO_REMOTE: "No remote 'origin' configured.",
      NON_FAST_FORWARD: "Push rejected (non-fast-forward). Pull first, then push again.",
      PUSH_NOT_APPLIED: "Push did not complete properly — remote commit mismatch.",
      UNMERGED_FILES: "Repository has unmerged or conflicted files. Resolve before continuing.",
      REBASE_CONFLICT:
        "Conflicts detected with the remote branch.\n\nPlease resolve them in an external editor before trying again.",
      UNSTASH_CONFLICT:
        "Pull succeeded but restoring local changes caused conflicts.\n\nResolve manually before proceeding.",
      HEAD_DETACHED:
        "Your repository is in a detached HEAD state.\n\nPlease check out a branch before running this Git action.\n\n"
    };

    if (data.error) {
      progressModal.close();
      showModal(
        "Git Operation Failed",
        errors[data.error] || data.detail || data.error,
        { isError: true }
      );
      return;
    }

    if (!res.ok) {
      progressModal.close();
      showModal(
        "Operation Failed",
        data.error || "Unknown error",
        { isError: true }
      );
      return;
    }

    progressModal.close();
    showModal(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Successful`,
      `Branch: ${data.branch || data.active_branch}\nCommit: ${data.commit || "(none)"}\nMessage: ${data.summary || ""}`,
      {
        onClose: () => {

          if (action === "pull" || action === "refresh") {
            const host = document.getElementById('myst');
            if (host && host.shadowRoot) {

              const buttons = host.shadowRoot.querySelectorAll('.side button[type="button"]');
              const activeButton = Array.from(buttons).find(btn => btn.getAttribute('active') === 'true');
              
              if (activeButton){

                // Remember currently active file before refresh
                const currentFileEl = document.querySelector('.file.active');
                if (currentFileEl) {
                  const path = currentFileEl.dataset.elementPath;
                  const name = currentFileEl.dataset.elementName;
                  localStorage.setItem('selectedElement', JSON.stringify({
                    path,
                    name,
                    type: 'file',
                    timestamp: Date.now()
                  }));
                  localStorage.setItem('currentPath', path);
                }

                // Refresh tree normally
                const tree = document.getElementById("tree");
                if (tree) {
                  if (activeButton.title === "Git Commit") {
                    tree.innerHTML = "";
                    fetchGitCommitTree().then(() => {
                      // After refresh, reopen and reselect the file
                      const currentPath = localStorage.getItem('currentPath');
                      if (currentPath) {
                        // Use the existing helper that highlights and scrolls to it
                        const normalizedPath = normalizePath(currentPath);
                        requestAnimationFrame(() => restoreActiveFile(normalizedPath));
                      }
                    });
                  } else {
                    fetchLocalTree().then(() => {
                      // After refresh, reopen and reselect the file
                      const currentPath = localStorage.getItem('currentPath');
                      if (currentPath) {
                        // Use the existing helper that highlights and scrolls to it
                        const normalizedPath = normalizePath(currentPath);
                        requestAnimationFrame(() => restoreActiveFile(normalizedPath));
                      }
                    });
                  }
                }
              }
            }
          }
        },
      }
    );

  } catch (err) {
    if (err.name !== "AbortError") {
      progressModal.close();
      showModal("Network Error", err.message, { isError: true });
    }
  }
}

/* ---------- Git Commit Handler ---------- */
document.getElementById("commit-files").onclick = async () => {
  const msgInput = document.getElementById("commit-message");
  const descInput = document.getElementById("commit-description");

  const commitSubject = msgInput?.value?.trim() || "";
  const commitDescription = descInput?.value?.trim() || "";

  // --- Prevent commit if subject is empty ---
  if (!commitSubject) {
    showModal("Commit Failed", "Commit subject cannot be empty.", {
      isError: true,
    });
    return;
  }

  const commitMsg = commitDescription
    ? `${commitSubject}\n\n${commitDescription}`
    : commitSubject;

  const selected = (window.gitCommitCheckboxes || [])
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.path);

  const confirmMessage =
    selected.length === 0
      ? "No files selected — commit all modified and untracked files?"
      : `Commit only selected files? (${selected.length} total)`;

  const confirmed = await showConfirm("Confirm Commit", confirmMessage);
  if (!confirmed) return;

  // Show progress modal
  let abortController = new AbortController();
  const progressModal = showProgressModal("Commit in progress...", {
    onStop: () => abortController.abort(),
  });

  try {
    const res = await fetch("/api/git-commit-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMsg, files: selected }),
      signal: abortController.signal,
    });

    const data = await res.json();

    if (data.error === "REMOTE_AHEAD" || data.error === "DIVERGED") {
      progressModal.close();
      showModal(
        "Branch Out of Sync",
        "Your local branch is out of sync with remote.\n\nPlease pull the latest changes before committing.",
        { isError: true }
      );
      return;
    }

    if (!res.ok) {
      progressModal.close();
      showModal("Commit Failed", data.error || "Unknown error", {
        isError: true,
      });
      return;
    }

    progressModal.close();
    showModal(
      "Commit Successful",
      `Branch: ${data.active_branch || "(detached HEAD)"}\nCommit: ${data.commit}\nMessage: ${data.summary}`,
      {
        onClose: () => {
          if (msgInput) msgInput.value = "";
          if (descInput) descInput.value = "";
          const treeDiv = document.getElementById("tree");
          if (treeDiv) treeDiv.innerHTML = "";
          fetchGitCommitTree();
        },
      }
    );
  } catch (err) {
    progressModal.close();
    showModal(
      err.name === "AbortError" ? "Commit Stopped" : "Network Error",
      err.message,
      { isError: err.name !== "AbortError" }
    );
  }
};

document.getElementById("git-push").onclick = () =>
  runGitAction(
    "push",
    "Push to Remote?",
    "Push the current branch to remote origin?\n\nEnsure you’ve pulled the latest changes first."
  );

document.getElementById("refresh-branch").onclick = () =>
  runGitAction(
    "refresh",
    "Refresh Branch?",
    "Fetch and rebase from remote? Local changes may cause conflicts."
  );

document.addEventListener('input', function (event) {
  if (event.target.matches('.auto-expand')) {
    const textarea = event.target;

    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const paddingTop = parseFloat(style.paddingTop);
    const paddingBottom = parseFloat(style.paddingBottom);

    // Reset height
    textarea.style.height = 'auto';

    // Calculate content height in lines
    const contentHeight = textarea.scrollHeight - paddingTop - paddingBottom;

    // Set height to max of one line or content height
    const newHeight = Math.max(lineHeight, contentHeight);// + paddingTop + paddingBottom;
    textarea.style.height = newHeight + 'px';
  }
});