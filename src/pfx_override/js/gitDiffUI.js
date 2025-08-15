/* GitDiff Extension - UI Interaction Logic
- Listens for branch and commit dropdown changes
- Handles panel resizing and state persistence
- Loads commit details dynamically */

export function setupGitDiffListeners() {
  // Dropdown selectors for Git branches and commits
  const branchDropdown = document.getElementById("branchDropdown");
  const commitDropdown = document.getElementById("commitDropdown");

  // Reload GitDiff extension when branch changes
  if (branchDropdown) {
    branchDropdown.addEventListener("change", () => {
      if (window.reloadGitdiff) window.reloadGitdiff();
    });
  }

  // Reload GitDiff extension when commit changes
  if (commitDropdown) {
    commitDropdown.addEventListener("change", () => {
      if (window.reloadGitdiff) window.reloadGitdiff();
    });
  }
}

// Panels and horizontal resizer elements
const fileTree = document.getElementById("tree-panel");
const hor_resizer = document.getElementById("resizer-horizontal");
const gitPanel = document.getElementById("gitPanel");

/* Horizontal Resizing Logic for File Tree Panel
- Adjusts height based on mouse drag
- Saves height in localStorage for persistence */
hor_resizer.onmousedown = function (e) {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = fileTree.offsetHeight;

  document.onmousemove = function (e) {
    const newHeight = startHeight + (e.clientY - startY);
    if (newHeight >= 100) {
      fileTree.style.height = newHeight + 'px'; // style linked to CSS via height
      localStorage.setItem('fileTreeHeight', newHeight);
    }
  };

  document.onmouseup = function () {
    document.onmousemove = null;
    document.onmouseup = null;
  };
};

// Sets hidden input's filename for backend usage
function setHiddenFilename(filename) {
  const hiddenInput = document.getElementById('hidden-filename');
  if (hiddenInput) {
    hiddenInput.value = filename;
  }
}

// Restore saved panel height from previous session
const savedHeight = localStorage.getItem('fileTreeHeight');
if (savedHeight) {
  fileTree.style.height = savedHeight + 'px';
}

// Git panel dropdowns and details
const branchSelect = document.getElementById('branch-select');
const commitSelect = document.getElementById('commit-select');
const commitDetails = document.getElementById('commit-details');

/* Fetches and populates branch/commit.
   Updates commit details dynamically on selection */
export async function updateGitPanel(filename) {
  const branchDropdown = document.getElementById("branchDropdown");
  const commitDropdown = document.getElementById("commitDropdown");
  const commitDetails = document.getElementById("commitDetails");

  // Reset UI state
  branchDropdown.innerHTML = "";
  commitDropdown.innerHTML = "";
  commitDetails.innerText = "";

  // Request branch & commit data from backend
  const response = await fetch("/search-file", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename })
  });

  const data = await response.json();
  setHiddenFilename(filename);

  // Populate branches
  data.branches.forEach(branch => {
    const opt = document.createElement("option");
    opt.value = branch;
    opt.innerText = branch;
    branchDropdown.appendChild(opt);
  });

  // Populate commits
  data.commits.forEach(commit => {
    const opt = document.createElement("option");
    opt.value = commit.hash;
    opt.innerText = commit.summary || commit.hash;
    opt.dataset.message = commit.message;
    commitDropdown.appendChild(opt);
  });

  // Show commit message on selection
  commitDropdown.onchange = function () {
    const selected = commitDropdown.options[commitDropdown.selectedIndex];
    const message = selected.dataset.message || ' ';
    // Remove the first line (summary) for the details panel
    const body = message.split('\n').slice(1).join('\n').trim();
    commitDetails.innerText = body;
  };

  // Auto-select first commit
  if (commitDropdown.options.length) {
    commitDropdown.selectedIndex = 0;
    commitDropdown.onchange();
  }
}

