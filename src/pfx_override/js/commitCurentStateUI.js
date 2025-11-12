import { fetchGitCommitTree, fetchLocalTree, normalizePath, restoreActiveFile } from "./leftPanelFileTree.js";
import { showModal, showConfirm, showProgressModal } from "./modalWindows"

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
      NON_FAST_FORWARD: "Push rejected. Updates were rejected because the remote contains work that you do not have locally.",
      PUSH_NOT_APPLIED: "Push did not complete properly — remote commit mismatch.",
      UNMERGED_FILES: "Repository has unmerged or conflicted files. Resolve before continuing.",
      LOCAL_CHANGES: "You have local changes. Please commit your files before pulling remote files.",
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
        "Conflicts!",
        "Your commit will have conflicts with a remote branch.\n\nPlease resolve conflicts in external editor.",
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