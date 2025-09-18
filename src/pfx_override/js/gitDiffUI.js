import { fetchGitTree } from "./leftPanelFileTree.js";

// Update commit list for a branch
export function updateCommits(selectedBranch, commitDropdown, gitData, savedCommit = null, suppressEvent = false) {
  if (!selectedBranch || !commitDropdown || !gitData) return;

  try {
    const commitsForBranch = gitData.commits[selectedBranch] || [];
    const total = commitsForBranch.length;
    const commitItems = commitsForBranch.map(c => ({
      value: c.hash,
      label: (c.summary || c.message || c).split("\n")[0],
      message: c.message,
      index: total - c.index + 1,
      file_exists: c.file_exists,
    }));

    const headCommit = gitData.head_commit;
    populateDropdown(commitDropdown, commitItems, null, headCommit);

    if (savedCommit) {
      const opt = [...commitDropdown.options].find(o => o.value === savedCommit);
      if (opt) commitDropdown.value = savedCommit;
    }

    if (commitDropdown.options.length) {
      setupCommitChangeHandler(commitDropdown);
      if (!suppressEvent) {
        commitDropdown.dispatchEvent(new Event("change"));
      }
    }
  } catch (err) {
    console.error("Failed to update commits:", err);
    commitDropdown.innerHTML = "";
  }
}

// Fetch Git data from backend
async function fetchGitData() {
  const currentPath = localStorage.getItem('currentPath') || "";
  const res = await fetch("/search-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: currentPath })
  });
  return await res.json();
}

// Populate a dropdown
function populateDropdown(select, items, activeItem = null, headItem = null) {
  select.innerHTML = "";
  let reordered = [...items];

  if (headItem) {
    const idx = reordered.findIndex(i => i.value === headItem);
    if (idx >= 0) reordered.unshift(reordered.splice(idx, 1)[0]);
  }
  if (activeItem) {
    const idx = reordered.findIndex(i => i.value === activeItem);
    if (idx >= 0) reordered.unshift(reordered.splice(idx, 1)[0]);
  }

  reordered.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.value || item;
    opt.innerText = item.index ? `[${item.index}${item.file_exists === false ? "*" : ""}] ${item.label || item}` : item.label || item;
    if (item.message) opt.dataset.message = item.message;
    select.appendChild(opt);
  });
}

// Git commit dropdown change handler
function setupCommitChangeHandler(commitDropdown) {
  commitDropdown.addEventListener("change", () => {
    const selected = commitDropdown.options[commitDropdown.selectedIndex];
    if (!selected) return;
    const mode = localStorage.getItem("gitLeftListToggle") || true;
    if (mode){
      if (window.reloadGitdiff) window.reloadGitdiff(mode);
    }
    applyGitToggle();
  });
}

// Wait for shadow DOM element
function waitForShadowElement(hostSelector, id, timeout = 5000) {
  return new Promise(resolve => {
    const host = document.querySelector(hostSelector);
    if (!host) return resolve(null);

    const check = () => host.shadowRoot?.getElementById(id) || null;
    const el = check();
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = check();
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(host.shadowRoot || host, { childList: true, subtree: true });

    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

// Apply gitLeftListToggle
function applyGitToggle() {
  const toggle = localStorage.getItem("gitLeftListToggle");
  fetchGitTree(toggle === "true");
}

// Main setup
export async function setupGitPanel() {
  const branchLeft = await waitForShadowElement('#myst', 'branchDropdownLeft');
  const commitLeft = await waitForShadowElement('#myst', 'commitDropdownLeft');
  const branchRight = await waitForShadowElement('#myst', 'branchDropdownRight');
  const commitRight = await waitForShadowElement('#myst', 'commitDropdownRight');

  if (!branchLeft || !branchRight) {
    console.error("Git branch dropdowns not found!");
    return;
  }

  // Persist dropdown changes
  const persist = (id, el) => el.addEventListener("change", () => localStorage.setItem(id, el.value));
  persist("branchDropdownLeft", branchLeft);
  persist("commitDropdownLeft", commitLeft);
  persist("branchDropdownRight", branchRight);
  persist("commitDropdownRight", commitRight);

  const data = await fetchGitData();

  // Populate branches
  const branchItems = data.branches.map((b,i) => ({ value:b, label:b, index:data.branches.length-i }));
  populateDropdown(branchLeft, branchItems, data.active_branch);
  populateDropdown(branchRight, branchItems, data.active_branch);

  // Restore saved branch & commit
  const savedBranchLeft  = localStorage.getItem("branchDropdownLeft");
  const savedBranchRight = localStorage.getItem("branchDropdownRight");
  const savedCommitLeft  = localStorage.getItem("commitDropdownLeft");
  const savedCommitRight = localStorage.getItem("commitDropdownRight");

  if (savedBranchLeft)  branchLeft.value  = savedBranchLeft;
  if (savedBranchRight) branchRight.value = savedBranchRight;

  updateCommits(branchLeft.value, commitLeft, data, savedCommitLeft, true);
  updateCommits(branchRight.value, commitRight, data, savedCommitRight, true);

  // Branch change events
  branchLeft.onchange  = () => updateCommits(branchLeft.value, commitLeft, data);
  branchRight.onchange = () => updateCommits(branchRight.value, commitRight, data);

  // Only trigger once after restoration
  const mode = localStorage.getItem("gitLeftListToggle") || true;
  if (window.reloadGitdiff) window.reloadGitdiff(mode ? "commits" : "local" );
  applyGitToggle();
}
