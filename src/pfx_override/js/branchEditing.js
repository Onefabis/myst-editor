// BranchSwitcher.js
import { showModal } from "./modalWindows"; 

// ====== API HELPERS ======
async function api(method, url, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// Fetch branch list
async function fetchBranches() {
  return api("POST", "/search-file", { filename: "" });
}

// Get current working directory status
async function getCurrentStatus() {
  return api("GET", "/api/git-status"); 
}

// Switch branch
async function checkoutBranch(branchName) {
  return api("POST", "/api/git-checkout", { branch: branchName });
}

// ====== LOCAL STORAGE ======

const STORAGE_KEY = "selected_branch";

function saveSelectedBranch(name) {
  localStorage.setItem(STORAGE_KEY, name);
}

function loadStoredBranch() {
  return localStorage.getItem(STORAGE_KEY);
}

// ====== UI ELEMENTS ======
const branchSelect = document.getElementById("branch_select");
const branchSetBtn = document.querySelector("#branch_select_approve button");

let previousSelected = ""; // for restoring when cancelled

// ===========================
//        INITIAL LOAD
// ===========================
export async function initBranchSwitcher() {
  previousSelected = loadStoredBranch() || "";

  const branchData = await fetchBranches();
  const activeBranch = branchData.active_branch;
  const branches = branchData.branches || [];

  // Fill <select>
  branchSelect.innerHTML = `<option value="">Local only content</option>`;
  branches.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    branchSelect.appendChild(opt);
  });

  // Restore stored selection OR current active branch
  const stored = loadStoredBranch();
  if (stored && branches.includes(stored)) {
    branchSelect.value = stored;
  } else {
    branchSelect.value = activeBranch || "";
  }

  previousSelected = branchSelect.value;
}

// ===========================
//    SWITCH BRANCH LOGIC
// ===========================
async function trySwitchBranch() {
  const newBranch = branchSelect.value;

  // Save for later
  saveSelectedBranch(newBranch);

  // Nothing to do
  if (newBranch === previousSelected) return;

  // Check current status
  const status = await getCurrentStatus();

  if (status.has_uncommitted_changes) {
    showModal(
      "Uncommitted Changes",
      "You must commit your current changes before switching branches.",
      {
        isError: true,
        onClose: () => {
          // revert UI selection
          branchSelect.value = previousSelected;
        },
      }
    );
    return;
  }

  // Perform checkout
  const result = await checkoutBranch(newBranch);

  if (result.error) {
    showModal("Checkout Error", result.error, {
      isError: true,
      onClose: () => {
        branchSelect.value = previousSelected;
      },
    });
    return;
  }

  // Success → update previousSelected
  previousSelected = newBranch;
  saveSelectedBranch(newBranch);
  location.reload(); // Optional: refresh UI to load new content
}

// ===========================
//    EVENT LISTENERS
// ===========================
branchSetBtn.addEventListener("click", trySwitchBranch);
branchSelect.addEventListener("change", () => {
  saveSelectedBranch(branchSelect.value);
});


// ====== CREATE NEW BRANCH (no duplicate declarations) ======

const createInput = document.getElementById("create_branch");
const createBtn = document.getElementById("create_branch_button");

// helper to call backend
async function createNewBranchApi(branchName) {
  return api("POST", "/api/git-create-branch", { branch: branchName });
}

async function onCreateBranch(e) {
  e && e.preventDefault();
  const newBranch = createInput.value.trim();

  if (!newBranch) {
    showModal("Branch name required", "Please enter a branch name.", { isError: true });
    return;
  }

  // client-side duplicate check (case-insensitive)
  const exists = Array.from(branchSelect.options).some(
    (o) => o.value.toLowerCase() === newBranch.toLowerCase()
  );
  if (exists) {
    showModal("Branch exists", `Branch "${newBranch}" already exists.`, { isError: true });
    return;
  }

  // make sure working tree is clean before creating branch
  const status = await getCurrentStatus();
  if (status.has_uncommitted_changes) {
    showModal(
      "Uncommitted Changes",
      "Please commit or discard your changes before creating a new branch.",
      { isError: true }
    );
    return;
  }

  // create on server
  const result = await createNewBranchApi(newBranch);

  if (!result) {
    showModal("Create error", "No response from server", { isError: true });
    return;
  }

  if (result.error) {
    // backend-side duplicate or other error
    showModal("Cannot create branch", result.error, { isError: true });
    return;
  }

  // Success: append option to the end and select it
  const opt = document.createElement("option");
  opt.value = newBranch;
  opt.textContent = newBranch;
  branchSelect.appendChild(opt);

  // Select newly created branch
  branchSelect.value = newBranch;

  // Persist selection and update previousSelected so cancelling won't revert incorrectly
  previousSelected = newBranch;
  saveSelectedBranch(newBranch);

  // Trigger same logic as if user selected it manually:
  // - dispatch change (so UI code that listens to change saves to localStorage)
  branchSelect.dispatchEvent(new Event("change"));

  // - and programmatically invoke "Set" button action so checkout/switch logic runs
  //   (this will call trySwitchBranch which already handles uncommitted check and checkout)
  if (typeof branchSetBtn !== "undefined" && branchSetBtn) {
    branchSetBtn.click();
  } else {
    // fallback: reload to reflect new branch
    location.reload();
  }

  // UX: clear input
  createInput.value = "";
}

// Enter key support while focused in input
createInput.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter") {
    evt.preventDefault();
    onCreateBranch();
  }
});

createBtn.addEventListener("click", onCreateBranch);

// Run when page loads
window.addEventListener("DOMContentLoaded", initBranchSwitcher);
