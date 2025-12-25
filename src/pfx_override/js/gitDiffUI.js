import { fetchGitTree } from "./leftPanelFileTree.js";

//-------------------------------------------------------------
// Utility: Simple fast fuzzy search (very lightweight)
//-------------------------------------------------------------
function fuzzyMatch(str, pattern) {
  str = str.toLowerCase();
  pattern = pattern.toLowerCase();
  let i = 0, j = 0;
  while (i < str.length && j < pattern.length) {
    if (str[i] === pattern[j]) j++;
    i++;
  }
  return j === pattern.length;
}

//-------------------------------------------------------------
// Convert a native <select> into a searchable dropdown
//-------------------------------------------------------------
export function createSearchableDropdown(nativeSelect) {
  const wrapper = document.createElement("div");
  wrapper.className = "searchable-dropdown";

  const label = document.createElement("div");
  label.className = "dropdown-label";
  label.textContent = nativeSelect.options[nativeSelect.selectedIndex]?.textContent || "Select";

  const panel = document.createElement("div");
  panel.className = "dropdown-panel hidden";

  const searchWrap = document.createElement("div");
  searchWrap.className = "dropdown-search-wrap";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search...";
  searchInput.className = "dropdown-search-input";

  const clearBtn = document.createElement("div");
  clearBtn.textContent = "✕";
  clearBtn.className = "dropdown-clear-btn";

  const list = document.createElement("div");
  list.className = "dropdown-list";

  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(clearBtn);
  panel.appendChild(searchWrap);
  panel.appendChild(list);
  wrapper.appendChild(label);
  wrapper.appendChild(panel);

  // Hide native select
  nativeSelect.style.display = "none";
  nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);

  //----------------------------------------------------------
  // Re-render list items from nativeSelect
  //----------------------------------------------------------
  function renderList(filter = "") {
    list.innerHTML = "";
    const items = [...nativeSelect.options];
    const filtered = filter
      ? items.filter(o => fuzzyMatch(o.textContent, filter))
      : items;

    filtered.forEach(opt => {
      const row = document.createElement("div");
      row.className = "dropdown-item";
      row.textContent = opt.textContent;
      row.dataset.value = opt.value;

      // ADD THIS LINE
      row.title = opt.textContent;

      row.onclick = () => {
        nativeSelect.value = opt.value;
        label.textContent = opt.textContent;
        panel.classList.add("hidden");
        nativeSelect.dispatchEvent(new Event("change"));
      };
      list.appendChild(row);
    });
  }

  renderList();


  function adjustDropdownPosition() {
    // Reset any previous adjustment
    panel.style.left = "";
    panel.style.right = "";

    const rect = panel.getBoundingClientRect();
    const overflowRight = rect.right - window.innerWidth;

    if (overflowRight > 0) {
        // Shift panel to the left by the overflow amount + a small margin
        panel.style.left = `-${overflowRight + 8}px`;
    }
  }

  //----------------------------------------------------------
  // Events
  //----------------------------------------------------------
  searchInput.addEventListener("mousedown", e => {
    // Prevent document mousedown from firing before focus
    e.stopPropagation();
  });

  panel.addEventListener("mousedown", e => e.stopPropagation());

  label.onclick = e => {
    e.stopPropagation();
    panel.classList.toggle("hidden");

    if (!panel.classList.contains("hidden")) {
        adjustDropdownPosition();
    }
  };
  
  searchInput.addEventListener("input", (e) => {
    e.stopPropagation();
    renderList(searchInput.value.trim());
  });

  clearBtn.onclick = () => {
    searchInput.value = "";
    renderList();
  };

  document.addEventListener("mousedown", e => {
    // Only close if the click is *truly* outside
    if (!wrapper.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });

  return {
    rebuild() { renderList(searchInput.value.trim()); },
    updateLabel() {
      const opt = nativeSelect.options[nativeSelect.selectedIndex];
      label.textContent = opt ? opt.textContent : "Select";
    }
  };
}


//-------------------------------------------------------------
// Existing functions with minimal modifications
//-------------------------------------------------------------
export function updateCommits(selectedBranch, commitDropdown, gitData, savedCommit = null, suppressEvent = false) {
  if (!selectedBranch || !commitDropdown || !gitData) return;
  try {
    if (!gitData.commits || typeof gitData.commits !== 'object') {
      commitDropdown.innerHTML = "";
      return;
    }

    const commitsForBranch = gitData.commits[selectedBranch] || [];
    const total = commitsForBranch.length;
    if (total === 0) {
      commitDropdown.innerHTML = '<option value="">No commits available</option>';
      if (commitDropdown._searchable) commitDropdown._searchable.rebuild();
      return;
    }

    const commitItems = commitsForBranch.map(c => ({
      value: c.hash || '',
      label: (c.summary || c.message || c).toString().split("\n")[0],
      message: c.message || '',
      index: total - (c.index || 0) + 1,
      file_exists: c.file_exists !== false,
    }));

    populateDropdown(commitDropdown, commitItems);
    if (!commitDropdown.value && commitDropdown.options.length > 0) {
      commitDropdown.value = commitDropdown.options[0].value;
    }
    if (commitDropdown._searchable) {
      commitDropdown._searchable.updateLabel();
    }

    if (savedCommit) {
      const opt = [...commitDropdown.options].find(o => o.value === savedCommit);
      if (opt) commitDropdown.value = savedCommit;
    }

    if (!suppressEvent) commitDropdown.dispatchEvent(new Event("change"));
    if (commitDropdown._searchable) commitDropdown._searchable.rebuild();
  } catch (err) {
    commitDropdown.innerHTML = '<option value="">Commits list is empty</option>';
  }
}

function populateDropdown(select, items) {
  select.innerHTML = "";
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.index
      ? `[${item.index}${item.file_exists === false ? "*" : ""}] ${item.label}`
      : item.label;
    if (item.message) opt.dataset.message = item.message;
    select.appendChild(opt);
  });
}

//-------------------------------------------------------------
// Wait for shadow root element
//-------------------------------------------------------------
function waitForShadowElement(hostSelector, id, timeout = 5000) {
  return new Promise(resolve => {
    const host = document.querySelector(hostSelector);
    if (!host) return resolve(null);

    const check = () => host.shadowRoot?.getElementById(id) || null;
    const el = check();
    if (el) return resolve(el);

    const obs = new MutationObserver(() => {
      const found = check();
      if (found) {
        obs.disconnect();
        resolve(found);
      }
    });

    obs.observe(host.shadowRoot || host, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

function persistDropdown(select, key) {
  if (!select) return;

  const saved = localStorage.getItem(key);
  let applied = false;

  // If saved value exists in the list → set it
  if (saved && [...select.options].some(o => o.value === saved)) {
    select.value = saved;
    applied = true;
  }

  // Otherwise choose topmost and save it
  if (!applied) {
    if (select.options.length > 0) {
      select.value = select.options[0].value;
      localStorage.setItem(key, select.value);
    }
  }

  // Force event so commits refresh correctly
  select.dispatchEvent(new Event("change"));

  // If fuzzy dropdown wrapper exists → update label
  if (select._searchable && select._searchable.updateLabel) {
    select._searchable.updateLabel();
  }

  // Always save future changes
  select.addEventListener("change", () => {
    localStorage.setItem(key, select.value);

    if (select._searchable && select._searchable.updateLabel) {
      select._searchable.updateLabel();
    }
  });
}

//-------------------------------------------------------------
// Git panel setup (uses new dropdowns)
//-------------------------------------------------------------
export async function setupGitPanel() {
  const branchLeft = await waitForShadowElement('#myst', 'branchDropdownLeft');
  const commitLeft = await waitForShadowElement('#myst', 'commitDropdownLeft');
  const branchRight = await waitForShadowElement('#myst', 'branchDropdownRight');
  const commitRight = await waitForShadowElement('#myst', 'commitDropdownRight');

  if (!branchLeft || !branchRight) return;

  const dataRes = await fetch("/api/search-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: localStorage.getItem('currentPath') || "" })
  });

  const data = await dataRes.json();
  if (!data || !Array.isArray(data.branches)) return;

  const branchItems = data.branches.map((b, i) => ({ value: b, label: b }));
  // Populate branches
  populateDropdown(branchLeft, branchItems);
  populateDropdown(branchRight, branchItems);

  // Restore saved branches (before UI wrapper)
  persistDropdown(branchLeft, "branchDropdownLeft");
  persistDropdown(branchRight, "branchDropdownRight");

  // Create fuzzy wrapper
  branchLeft._searchable = createSearchableDropdown(branchLeft);
  branchRight._searchable = createSearchableDropdown(branchRight);
  if (commitLeft) commitLeft._searchable = createSearchableDropdown(commitLeft);
  if (commitRight) commitRight._searchable = createSearchableDropdown(commitRight);

  // Build commit lists
  updateCommits(branchLeft.value, commitLeft, data, null, true);
  updateCommits(branchRight.value, commitRight, data, null, true);

  // Restore commit selections AFTER commits exist
  persistDropdown(commitLeft, "commitDropdownLeft");
  persistDropdown(commitRight, "commitDropdownRight");

  branchLeft.onchange = () => updateCommits(branchLeft.value, commitLeft, data);
  branchRight.onchange = () => updateCommits(branchRight.value, commitRight, data);
}
