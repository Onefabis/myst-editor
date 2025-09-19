import { fetchGitTree } from "./leftPanelFileTree.js";

// Update commit list for a branch
export function updateCommits(selectedBranch, commitDropdown, gitData, savedCommit = null, suppressEvent = false) {
  if (!selectedBranch || !commitDropdown || !gitData) return;

  try {
    // Handle missing commits object or branch
    if (!gitData.commits || typeof gitData.commits !== 'object') {
      console.warn("Git data missing commits object");
      commitDropdown.innerHTML = "";
      return;
    }

    const commitsForBranch = gitData.commits[selectedBranch] || [];
    const total = commitsForBranch.length;
    
    // Handle empty commits array
    if (total === 0) {
      commitDropdown.innerHTML = '<option value="">No commits available</option>';
      return;
    }

    const commitItems = commitsForBranch.map(c => ({
      value: c.hash || '',
      label: (c.summary || c.message || c).toString().split("\n")[0],
      message: c.message || '',
      index: total - (c.index || 0) + 1,
      file_exists: c.file_exists !== false, // default to true if undefined
    }));

    const headCommit = gitData.head_commit || null;
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
    // console.error("Failed to update commits:", err);
    commitDropdown.innerHTML = '<option value="">Commits list is empty</option>';
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

// Enhanced setupGitPanel with better error handling
export async function setupGitPanel() {
  const branchLeft = await waitForShadowElement('#myst', 'branchDropdownLeft');
  const commitLeft = await waitForShadowElement('#myst', 'commitDropdownLeft');
  const branchRight = await waitForShadowElement('#myst', 'branchDropdownRight');
  const commitRight = await waitForShadowElement('#myst', 'commitDropdownRight');

  if (!branchLeft || !branchRight) {
    console.error("Git branch dropdowns not found!");
    return;
  }

  try {
    const data = await fetchGitData();
    
    // Handle empty or invalid data
    if (!data || !Array.isArray(data.branches)) {
      console.error("Invalid git data received:", data);
      // Set empty options for all dropdowns
      [branchLeft, branchRight].forEach(dropdown => {
        dropdown.innerHTML = '<option value="">No branches available</option>';
      });
      [commitLeft, commitRight].forEach(dropdown => {
        if (dropdown) dropdown.innerHTML = '<option value="">No commits available</option>';
      });
      return;
    }

    // Persist dropdown changes
    const persist = (id, el) => {
      if (el) {
        el.addEventListener("change", () => localStorage.setItem(id, el.value));
      }
    };
    persist("branchDropdownLeft", branchLeft);
    persist("commitDropdownLeft", commitLeft);
    persist("branchDropdownRight", branchRight);
    persist("commitDropdownRight", commitRight);

    // Handle empty branches
    if (data.branches.length === 0) {
      [branchLeft, branchRight].forEach(dropdown => {
        dropdown.innerHTML = '<option value="">No branches available</option>';
      });
      [commitLeft, commitRight].forEach(dropdown => {
        if (dropdown) dropdown.innerHTML = '<option value="">No commits available</option>';
      });
      return;
    }

    // Populate branches
    const branchItems = data.branches.map((b, i) => ({ 
      value: b, 
      label: b, 
      index: data.branches.length - i 
    }));
    populateDropdown(branchLeft, branchItems, data.active_branch);
    populateDropdown(branchRight, branchItems, data.active_branch);

    // Restore saved branch & commit
    const savedBranchLeft = localStorage.getItem("branchDropdownLeft");
    const savedBranchRight = localStorage.getItem("branchDropdownRight");
    const savedCommitLeft = localStorage.getItem("commitDropdownLeft");
    const savedCommitRight = localStorage.getItem("commitDropdownRight");

    if (savedBranchLeft && data.branches.includes(savedBranchLeft)) {
      branchLeft.value = savedBranchLeft;
    }
    if (savedBranchRight && data.branches.includes(savedBranchRight)) {
      branchRight.value = savedBranchRight;
    }

    // Update commits with error handling
    if (commitLeft) {
      updateCommits(branchLeft.value, commitLeft, data, savedCommitLeft, true);
    }
    if (commitRight) {
      updateCommits(branchRight.value, commitRight, data, savedCommitRight, true);
    }

    // Branch change events
    branchLeft.onchange = () => {
      if (commitLeft) updateCommits(branchLeft.value, commitLeft, data);
    };
    branchRight.onchange = () => {
      if (commitRight) updateCommits(branchRight.value, commitRight, data);
    };

    // Only trigger once after restoration
    const mode = localStorage.getItem("gitLeftListToggle") || true;
    if (window.reloadGitdiff) {
      window.reloadGitdiff(mode ? "commits" : "local");
    }
    applyGitToggle();
    
  } catch (error) {
    console.error("Error setting up git panel:", error);
    // Set error messages in dropdowns
    [branchLeft, branchRight].forEach(dropdown => {
      dropdown.innerHTML = '<option value="">Branches not exists</option>';
    });
    [commitLeft, commitRight].forEach(dropdown => {
      if (dropdown) dropdown.innerHTML = '<option value="">Commits not exists</option>';
    });
  }
}
