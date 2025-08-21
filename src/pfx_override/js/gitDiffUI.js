/* Git Commit UI Logic
   - Handles dual branch/commit selectors (left & right halves)
   - Fetches branch/commit info from backend
   - Updates commit dropdowns when branch changes
   - Logs commit details when commit changes
*/
function updateCommits(selectedBranch, commitDropdown, gitData) {
  if (!selectedBranch || !commitDropdown || !gitData) return;

  try {
    // Get commits for the selected branch
    const commitsForBranch = gitData.commits[selectedBranch] || [];

    // Map commits to { value, label, message } for dropdown
    const commitItems = commitsForBranch.map(c => ({
      value: c.hash || c.id || c, // adjust according to your backend
      label: (c.shortMessage || c.message || c).split("\n")[0],
      message: c.message || c
    }));

    // Populate commit dropdown
    populateDropdown(commitDropdown, commitItems);

    // Ensure a default selection exists
    if (commitDropdown.options.length) {
      commitDropdown.selectedIndex = 0;
      setupCommitChangeHandler(commitDropdown);
      commitDropdown.dispatchEvent(new Event('change'));
    }
  } catch (err) {
    console.error("Failed to update commits:", err);
    commitDropdown.innerHTML = ""; // clear if error
  }
}

async function fetchGitData() {
  console.log("fetching /search-file...");
  const response = await fetch("/search-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "" })
  });
  console.log("response status:", response.status);
  const json = await response.json();
  console.log("response json:", json);
  return json;
}

function populateDropdown(select, items) {
  select.innerHTML = "";
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.value || item;
    opt.innerText = item.label || item;
    if (item.message) opt.dataset.message = item.message;
    select.appendChild(opt);
  });
}

function setupCommitChangeHandler(commitDropdown) {
  commitDropdown.onchange = () => {
    const selected = commitDropdown.options[commitDropdown.selectedIndex];
    if (!selected) return;
    const message = selected.dataset.message || "";
    const body = message.split("\n").slice(1).join("\n").trim();
    console.log("Selected commit:", body || "(no description)");
  };
}

function waitForShadowElement(hostSelector, id, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const host = document.querySelector(hostSelector);
    if (!host) return reject(new Error("Shadow host not found"));

    const check = () => {
      const el = host.shadowRoot?.getElementById(id);
      if (el) return resolve(el);
      return false;
    }

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });

    observer.observe(host.shadowRoot || host, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element #${id} not found in shadow root within ${timeout}ms`));
    }, timeout);
  });
}

export async function setupGitPanel() {

  const branchLeft = await waitForShadowElement('#myst', 'branchDropdownLeft');
  const commitLeft = await waitForShadowElement('#myst', 'commitDropdownLeft');
  const branchRight = await waitForShadowElement('#myst', 'branchDropdownRight');
  const commitRight = await waitForShadowElement('#myst', 'commitDropdownRight');

  if (!branchLeft) {
    console.error("branchDropdownLeft not found after waiting!");
    return;
  }

  const data = await fetchGitData();
  // console.log("Git data:", data);

  populateDropdown(branchLeft, data.branches.map(b => ({ value: b, label: b })));
  populateDropdown(branchRight, data.branches.map(b => ({ value: b, label: b })));

  // Ensure a default selection exists
  if (branchLeft.options.length) branchLeft.selectedIndex = 0;
  if (branchRight.options.length) branchRight.selectedIndex = 0;

  if (branchLeft.value) updateCommits(branchLeft.value, commitLeft, data);
  if (branchRight.value) updateCommits(branchRight.value, commitRight, data);

  branchLeft.onchange = () => updateCommits(branchLeft.value, commitLeft, data);
  branchRight.onchange = () => updateCommits(branchRight.value, commitRight, data);

  // Reload GitDiff extension when commit changes 
  if (commitLeft) { commitLeft.addEventListener("change", () => { if (window.reloadGitdiff) window.reloadGitdiff(); }); }
  if (commitRight) { commitRight.addEventListener("change", () => { if (window.reloadGitdiff) window.reloadGitdiff(); }); }

}
