import "./gitDiffUI.js";
import { loadFile, insertImageMarkdown } from "./MainOverride.js";
import { saveCurrentEditorContent, setLastSavedTimestamp } from './saveEditorText.js';
import { autosaveEnabled } from '../../MystEditor.jsx';
import { useContext } from "preact/hooks";
import { MystState } from "../../mystState.js";
import { logFilePaths } from "../../extensions/gitCommit";

// ========================= CONSTANTS =========================

const SVG_ICONS = {
  closedFolder: `<svg width="14" height="14" viewBox="0 0 24 24"><polygon points="9,4 21,12 9,20" fill="#888888"/></svg>`,
  openFolder: `<svg width="14" height="14" viewBox="0 0 24 24"><polygon points="7,6 15,18 23,6" fill="#888888"/></svg>`,
  spacer: `<svg width="14" height="14" viewBox="0 0 24 24"><rect width="24" height="24" fill="transparent"/></svg>`,
  git: {
    deleted: `<svg width="18" height="18" viewBox="0 0 20 20" class="diff-icon diff-deleted">
      <circle cx="10" cy="10" r="6"></circle>
      <path d="M 6.5 13.2 L 13.2 6.5"></path>
    </svg>`,
    modified: `<svg width="18" height="18" viewBox="0 0 20 20" class="diff-icon diff-modified">
      <circle cx="10" cy="10" r="6"></circle>
      <circle cx="10" cy="10" r="2.5" class="inner"></circle>
    </svg>`,
    added: `<svg width="18" height="18" viewBox="0 0 20 20" class="diff-icon diff-added">
      <circle cx="10" cy="10" r="6"></circle>
      <path d="M 10 13.5 L 10 6.5"></path>
      <path d="M 13.5 10 L 6.5 10"></path>
    </svg>`
  }
};

const GIT_STATUS = {
  ADDED: "A",
  DELETED: "D",
  MODIFIED: "M",
  RENAMED: "R"
};

const CONFIG = {
  ignoredFolders: ["_static", "_templates", ".obsidian"],
  treeRoot: 'docs/',
  maxDropdownWaitAttempts: 50,
  dropdownWaitInterval: 100
};

// ========================= STATE MANAGEMENT =========================

class FileTreeState {
  constructor() {
    this.openFolders = new Set(JSON.parse(localStorage.getItem('openFolders') || '[]'));
    this.activeFolderPath = '';
    this.selectedElement = null; // Store the selected element info
  }

  addOpenFolder(path) {
    this.openFolders.add(path);
    this.saveOpenFolders();
  }

  removeOpenFolder(path) {
    this.openFolders.delete(path);
    this.saveOpenFolders();
  }

  isOpen(path) {
    return this.openFolders.has(path);
  }

  saveOpenFolders() {
    localStorage.setItem('openFolders', JSON.stringify([...this.openFolders]));
  }

  setActiveFolderPath(path) {
    this.activeFolderPath = path;
  }

  getActiveFolderPath() {
    return this.activeFolderPath;
  }

  // New methods for selected element management
  setSelectedElement(element) {
    this.selectedElement = element;
    // Store in localStorage for persistence across page reloads if needed
    if (element) {
      localStorage.setItem('selectedElement', JSON.stringify({
        path: element.path,
        name: element.name,
        type: element.type,
        timestamp: Date.now() // To detect stale selections
      }));
    } else {
      localStorage.removeItem('selectedElement');
    }
  }

  getSelectedElement() {
    // First check memory
    if (this.selectedElement) {
      return this.selectedElement;
    }
    
    // Fall back to localStorage if available
    const stored = localStorage.getItem('selectedElement');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Check if selection is not too old (optional, prevents stale selections)
        if (Date.now() - parsed.timestamp < 300000) { // 5 minutes
          this.selectedElement = parsed;
          return parsed;
        }
      } catch (e) {
        localStorage.removeItem('selectedElement');
      }
    }
    
    return null;
  }

  clearSelectedElement() {
    this.selectedElement = null;
    localStorage.removeItem('selectedElement');
  }
}

export const treeState = new FileTreeState();

// ========================= UTILITY FUNCTIONS =========================

export function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

function isAutosaveEnabled() {
  return !!autosaveEnabled.value;
}

function fileExistsInTree(path, nodes) {
  for (const node of nodes) {
    if (node.path === path && node.type === 'file') return true;
    if (node.type === 'folder' && node.children) {
      if (fileExistsInTree(path, node.children)) return true;
    }
  }
  return false;
}

// ========================= DOM MANIPULATION =========================

export function clearActiveStates() {
  document.querySelectorAll('.file').forEach(el => {
    el.classList.remove('active');
  });
}

export function restoreActiveFile(currentPath) {
  const allFiles = document.querySelectorAll('.file');
  for (const fileEl of allFiles) {
    if (normalizePath(fileEl.title) === currentPath) {
      fileEl.classList.add('active');
      fileEl.scrollIntoView({ block: 'center' });
      break;
    }
  }
}

function restoreActiveFileAfterRender() {
  const currentPath = localStorage.getItem('currentPath');
  if (!currentPath) return;

  requestAnimationFrame(() => {
    const allFiles = document.querySelectorAll('.file');
    for (const fileEl of allFiles) {
      if (normalizePath(fileEl.title) === currentPath) {
        fileEl.classList.add('active');
        fileEl.scrollIntoView({ block: 'center', inline: 'nearest' });
        break;
      }
    }
  });
}

function observeShadowElement(hostSelector, elementId, callback) {
  const host = document.querySelector(hostSelector);
  if (!host?.shadowRoot) return;

  const shadow = host.shadowRoot;
  const existing = shadow.getElementById(elementId);
  
  if (existing) {
    callback(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const el = shadow.getElementById(elementId);
    if (el) {
      observer.disconnect();
      callback(el);
    }
  });

  observer.observe(shadow, { childList: true, subtree: true });
}

// ========================= GIT OPERATIONS =========================

class GitDiffManager {
  static buildDiffMap(diffs, treeRoot = CONFIG.treeRoot) {
    const map = {};
    
    for (const diff of diffs) {
      const keyOld = diff.old_path?.startsWith(treeRoot) 
        ? diff.old_path.slice(treeRoot.length) 
        : diff.old_path;
      const keyNew = diff.new_path?.startsWith(treeRoot) 
        ? diff.new_path.slice(treeRoot.length) 
        : diff.new_path;

      if (diff.status === GIT_STATUS.RENAMED) {
        if (keyOld) map[keyOld] = GIT_STATUS.DELETED;
        if (keyNew) map[keyNew] = GIT_STATUS.ADDED;
      } else {
        const key = keyNew || keyOld;
        if (key) map[key] = diff.status;
      }
    }
    
    return map;
  }

  static computeChangedFolders(nodes, diffMap) {
    const changedFolders = new Set();
    const isChangedFile = (path) => [GIT_STATUS.ADDED, GIT_STATUS.DELETED, GIT_STATUS.MODIFIED].includes(diffMap[path]);

    function dfs(node) {
      if (node.type === 'file') {
        return isChangedFile(node.path);
      }
      
      let subtreeHasChange = false;
      for (const child of (node.children || [])) {
        if (dfs(child)) subtreeHasChange = true;
      }
      
      if (subtreeHasChange) changedFolders.add(node.path);
      return subtreeHasChange || isChangedFile(node.path);
    }

    for (const node of nodes) dfs(node);
    return changedFolders;
  }

  static applyDiffStatus(element, status) {
    element.classList.remove("diff-added", "diff-deleted", "diff-modified");
    
    switch (status) {
      case GIT_STATUS.ADDED:
        element.classList.add("diff-added");
        break;
      case GIT_STATUS.DELETED:
        element.classList.add("diff-deleted");
        break;
      case GIT_STATUS.MODIFIED:
        element.classList.add("diff-modified");
        break;
    }
  }
}

// ========================= UPDATED TREE RENDERING =========================

class TreeRenderer {
  static setFolderIcon(icon, isOpen, gitDiffActive, status) {
    if (gitDiffActive) {
      switch (status) {
        case GIT_STATUS.ADDED:
          icon.innerHTML = SVG_ICONS.git.added;
          return;
        case GIT_STATUS.DELETED:
          icon.innerHTML = SVG_ICONS.git.deleted;
          return;
        case GIT_STATUS.MODIFIED:
          icon.innerHTML = SVG_ICONS.git.modified;
          return;
      }
    }
    
    icon.innerHTML = isOpen ? SVG_ICONS.openFolder : SVG_ICONS.closedFolder;
  }

  static createFolderElement(node, gitDiffActive, diffMap, changedFolders) {
    const li = document.createElement('li');
    const title = document.createElement('span');
    const icon = document.createElement('span');
    const textSpan = document.createElement('span');

    icon.classList.add('icon-margin');
    textSpan.classList.add('folder-text');
    textSpan.textContent = node.name.endsWith('.md') ? node.name.replace(/\.md$/, '') : node.name;

    title.className = 'folder';
    title.title = node.path;
    title.dataset.elementPath = node.path;
    title.dataset.elementType = 'folder';
    title.dataset.elementName = node.name;
    title.appendChild(icon);
    title.appendChild(textSpan);

    // Highlight selected folder
    const selected = treeState.getSelectedElement();
    if (selected && selected.path === node.path && selected.type === 'folder') {
        title.classList.add('selected');
    }

    if (gitDiffActive && changedFolders.has(node.path)) {
        textSpan.classList.add('changed-path');
    }

    if (gitDiffActive) {
        GitDiffManager.applyDiffStatus(textSpan, diffMap[node.path]);
    }

    return { li, title, icon, textSpan };
  }


  static createFileElement(node, gitDiffActive, diffMap) {

    const li = document.createElement('li');
    const title = document.createElement('span');
    const icon = document.createElement('span');

    icon.classList.add('icon-margin');
    icon.innerHTML = SVG_ICONS.spacer;

    title.className = 'file';
    title.title = node.path;
    title.dataset.elementPath = node.path; // Store path for identification
    title.dataset.elementType = 'file';
    title.dataset.elementName = node.name;
    title.textContent = node.name.endsWith('.md') ? node.name.replace(/\.md$/, '') : node.name;
    title.prepend(icon);

    const selected = treeState.getSelectedElement();
    if (selected && selected.path === node.path && selected.type === 'file') {
        title.classList.add('selected');
    }

    if (gitDiffActive) {
      GitDiffManager.applyDiffStatus(title, diffMap[node.path]);
      
      observeShadowElement("#myst", "gitPanel", () => {
        switch (diffMap[node.path]) {
          case GIT_STATUS.ADDED:
            icon.innerHTML = SVG_ICONS.git.added;
            break;
          case GIT_STATUS.DELETED:
            icon.innerHTML = SVG_ICONS.git.deleted;
            break;
          case GIT_STATUS.MODIFIED:
            icon.innerHTML = SVG_ICONS.git.modified;
            break;
        }
      });
    }

    return { li, title, icon };
  }

  static async handleFileClick(node, titleElement) {
    clearActiveStates();
    titleElement.classList.add('active');

    titleElement.classList.add('selected');
    document.querySelectorAll('.folder, .file').forEach(el => {
        if (el !== titleElement) el.classList.remove('selected');
    });

    // Store selected element info
    treeState.setSelectedElement({
      path: node.path,
      name: node.name,
      type: 'file'
    });

    const newPath = normalizePath(node.path);
    const currentPath = localStorage.getItem('currentPath');

    if (isAutosaveEnabled() && currentPath && currentPath !== newPath) {
      await saveCurrentEditorContent();
    }
    
    setLastSavedTimestamp(null);
    loadFile(newPath);
  }

  static async scrollCommitWrapperToFile(node, titleElement) {
    clearActiveStates();
    titleElement.classList.add('active');

    titleElement.classList.add('selected');
    document.querySelectorAll('.folder, .file').forEach(el => {
        if (el !== titleElement) el.classList.remove('selected');
    });

    // Store selected element info
    treeState.setSelectedElement({
      path: node.path,
      name: node.name,
      type: 'file'
    });


    const mystHost = document.getElementById("myst");
    if (!mystHost?.shadowRoot) return;

    const commitWrapper = mystHost.shadowRoot.getElementById("commit-wrapper");
    if (!commitWrapper) return;

    // Find the container whose title matches the file path
    const targetDiv = Array.from(commitWrapper.children).find(container => {
      const titleDiv = container.querySelector("div:first-child");
      return titleDiv?.textContent === node.name || titleDiv?.textContent === node.path;
    });

    if (targetDiv) {
      const offset = 20; // positive = leave space above
      // Compute the element's top relative to the scrollable container
      const containerTop = commitWrapper.getBoundingClientRect().top;
      const targetTop = targetDiv.getBoundingClientRect().top;
      const scrollOffset = targetTop - containerTop + commitWrapper.scrollTop - offset;

      commitWrapper.scrollTo({ top: scrollOffset, behavior: "smooth" });
    }
  }

  static handleFolderClick(node, li, icon, gitDiffActive, diffMap, changedFolders, event, titleElement) {
    event.stopPropagation();

    clearActiveStates();
    titleElement.classList.add('active');

    titleElement.classList.add('selected');
    document.querySelectorAll('.folder, .file').forEach(el => {
        if (el !== titleElement) el.classList.remove('selected');
    });
    
    // Store selected element info
    treeState.setSelectedElement({
      path: node.path,
      name: node.name,
      type: 'folder'
    });
    
    treeState.setActiveFolderPath(node.path);
    const subtreeContainer = li.querySelector('.subtree');
    const isOpen = subtreeContainer && subtreeContainer.childElementCount > 0;

    if (event.ctrlKey) {
      if (isOpen) {
        TreeOperations.collapseAllSubfolders(li, node, gitDiffActive, diffMap, changedFolders);
      } else if (node.children) {
        TreeOperations.expandAllSubfolders(li, node, gitDiffActive, diffMap, changedFolders);
        this.setFolderIcon(icon, true, gitDiffActive, diffMap[node.path]);
      }
      return;
    }

    if (isOpen) {
      subtreeContainer.innerHTML = '';
      this.setFolderIcon(icon, false, gitDiffActive, diffMap[node.path]);
      treeState.removeOpenFolder(node.path);
    } else if (node.children) {
      this.renderTree(node.children, subtreeContainer, gitDiffActive, diffMap, changedFolders);
      this.setFolderIcon(icon, true, gitDiffActive, diffMap[node.path]);
      treeState.addOpenFolder(node.path);
    }
  }

  static renderTree(nodes, parent, gitDiffActive = false, diffMap = {}, changedFolders = new Set()) {
    parent.innerHTML = '';
    const ul = document.createElement('ul');

    for (const node of nodes) {
      if (node.type === 'folder' && CONFIG.ignoredFolders.includes(node.name)) {
        continue;
      }

      if (node.type === 'folder') {
        if (!gitDiffActive && (node.name.startsWith('.') || node.name.startsWith('_'))) {
          continue;
        }

        const { li, title, icon } = this.createFolderElement(node, gitDiffActive, diffMap, changedFolders);
        
        title.onclick = (e) => this.handleFolderClick(node, li, icon, gitDiffActive, diffMap, changedFolders, e, title);

        const subtreeContainer = document.createElement('div');
        subtreeContainer.className = 'subtree';
        li.appendChild(title);
        li.appendChild(subtreeContainer);
        ul.appendChild(li);

        if (treeState.isOpen(node.path)) {
          this.renderTree(node.children || [], subtreeContainer, gitDiffActive, diffMap, changedFolders);
          this.setFolderIcon(icon, true, gitDiffActive, diffMap[node.path]);
        } else {
          this.setFolderIcon(icon, false, gitDiffActive, diffMap[node.path]);
        }
      } else if (node.type === 'file') {
        const { li, title } = this.createFileElement(node, gitDiffActive, diffMap);
        
        title.onclick = async (e) => {
          e.stopPropagation();

          const mystHost = document.getElementById("myst");
          const commitWrapper = mystHost?.shadowRoot?.getElementById("commit-wrapper");

          if (commitWrapper) {
            // Scroll to the correct div inside commit-wrapper
            await TreeRenderer.scrollCommitWrapperToFile(node, title);
          } else {
            // Fallback: normal file click handling
            await TreeRenderer.handleFileClick(node, title);
          }

        };

        li.appendChild(title);
        ul.appendChild(li);
      }
    }

    parent.appendChild(ul);
    restoreActiveFileAfterRender();

    parent.addEventListener('click', (e) => {
      if (!e.target.closest('span.file') && !e.target.closest('span.folder')) {
        clearActiveStates();
        treeState.setActiveFolderPath('');
        treeState.clearSelectedElement(); // Clear selection when clicking empty space
      }
    });
  }
}

// ========================= TREE OPERATIONS =========================

class TreeOperations {
  static markAllOpenFolders(node, add = true) {
    function walk(n) {
      if (n.type === 'folder') {
        if (add) {
          treeState.addOpenFolder(n.path);
        } else {
          treeState.removeOpenFolder(n.path);
        }
        (n.children || []).forEach(walk);
      }
    }
    walk(node);
  }

  static expandAllSubfolders(li, node, gitDiffActive, diffMap, changedFolders) {
    const container = li.querySelector('.subtree');
    container.innerHTML = '';

    TreeRenderer.renderTree(node.children || [], container, gitDiffActive, diffMap, changedFolders);

    const childLis = Array.from(container.querySelectorAll(':scope > ul > li'));

    (node.children || []).forEach((childNode, idx) => {
      const childLi = childLis[idx];
      if (!childLi) return;

      const childIcon = childLi.querySelector('.icon-margin');
      if (childNode.type === 'folder' && childIcon) {
        TreeRenderer.setFolderIcon(childIcon, true, gitDiffActive, diffMap[childNode.path]);
        treeState.addOpenFolder(childNode.path);
        this.expandAllSubfolders(childLi, childNode, gitDiffActive, diffMap, changedFolders);
      }
    });

    treeState.addOpenFolder(node.path);
  }

  static collapseAllSubfolders(li, node) {
    const container = li.querySelector('.subtree');
    container.innerHTML = '';

    this.markAllOpenFolders(node, false);

    const icon = li.querySelector('.icon-margin');
    if (icon) {
      TreeRenderer.setFolderIcon(icon, false, false, null);
    }
  }
}

// ========================= API LAYER =========================

class TreeAPI {
  static async getHeadCommit() {
    const response = await fetch("/api/git-head");
    const { head } = await response.json();
    return head;
  }

  static async getUnionTree(commitLeft, commitRight) {
    const response = await fetch(
      `/api/tree-union?commit_left=${encodeURIComponent(commitLeft)}&commit_right=${encodeURIComponent(commitRight)}`
    );
    return response.json();
  }

  static async getTree(commit = null) {
    const url = commit ? `/api/tree?commit=${encodeURIComponent(commit)}` : '/api/tree';
    const response = await fetch(url);
    return response.json();
  }

  static async getDiff(type, params) {
    let url;
    switch (type) {
      case 'working-tree':
        url = `/api/git-diff-working-tree?commit=${encodeURIComponent(params.commit)}`;
        break;
      case 'tree':
        url = `/api/git-diff-tree?commit_left=${params.left}&commit_right=${params.right}`;
        break;
      default:
        throw new Error(`Unknown diff type: ${type}`);
    }
    
    const response = await fetch(url);
    return response.json();
  }

  static async waitForDropdowns() {
    const host = document.querySelector('#myst');
    if (!host) return null;

    let attempts = 0;
    while (attempts < CONFIG.maxDropdownWaitAttempts) {
      const left = host.shadowRoot?.getElementById("commitDropdownLeft");
      const right = host.shadowRoot?.getElementById("commitDropdownRight");
      
      if (left && right && left.options.length > 0 && right.options.length > 0) {
        return { left, right };
      }
      
      await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownWaitInterval));
      attempts++;
    }
    
    console.warn("Commit dropdowns not ready in time");
    return null;
  }
}

// ========================= MAIN FUNCTIONS =========================

export async function fetchLocalTree(loadfile=true) {
  const commitHash = await TreeAPI.getHeadCommit();
  const baseTree = await TreeAPI.getTree();
  const diffs = await TreeAPI.getDiff('working-tree', { commit: commitHash });

  const tree_div = document.getElementById("tree");
  tree_div.style.display = "flex"; 
  const commit_message = document.getElementById("commit-no-changes-message");
  commit_message.style.display = "none";

  // Filter out deleted files and keep original git statuses
  // Handle case where git diff fails (e.g., newly initialized repo with no commits)
  const safeDiffs = Array.isArray(diffs) ? diffs : [];
  const filteredDiffs = safeDiffs.filter(diff => diff.status !== GIT_STATUS.DELETED);
  const diffMap = GitDiffManager.buildDiffMap(filteredDiffs);

  const changedFolders = GitDiffManager.computeChangedFolders(baseTree, diffMap);
  TreeRenderer.renderTree(baseTree, tree_div, true, diffMap, changedFolders);

  const currentPath = localStorage.getItem('currentPath');
  if (loadfile){
    loadFile(normalizePath(currentPath));
  }
  restoreActiveFile(normalizePath(currentPath));
}

export async function fetchGitTree(gitCommit) {
  const dropdowns = await TreeAPI.waitForDropdowns();
  if (!dropdowns) return;

  const tree_div = document.getElementById("tree");
  tree_div.style.display = "flex"; 
  const commit_message = document.getElementById("commit-no-changes-message");
  commit_message.style.display = "none";

  if (gitCommit) {
    // Commit vs commit comparison - show all files that exist in EITHER commit
    const leftCommit = dropdowns.left.value;
    const rightCommit = dropdowns.right.value;
    
    // Get tree with all files from both commits (union)
    const baseTree = await TreeAPI.getUnionTree(leftCommit, rightCommit);
    let diffMap = {};
    
    if (leftCommit !== rightCommit) {
      const diffs = await TreeAPI.getDiff('tree', { left: leftCommit, right: rightCommit });
      diffMap = GitDiffManager.buildDiffMap(diffs);
    }
    
    const changedFolders = GitDiffManager.computeChangedFolders(baseTree, diffMap);
    TreeRenderer.renderTree(baseTree, tree_div, true, diffMap, changedFolders);
  } else {
    // Working tree vs HEAD comparison
    const commitHash = await TreeAPI.getHeadCommit();
    const baseTree = await TreeAPI.getTree();
    const diffs = await TreeAPI.getDiff('working-tree', { commit: commitHash });
    const diffMap = GitDiffManager.buildDiffMap(diffs);
    const changedFolders = GitDiffManager.computeChangedFolders(baseTree, diffMap);
    
    TreeRenderer.renderTree(baseTree, tree_div, true, diffMap, changedFolders);
  }
}

export async function fetchGitCommitTree() {
  const resp = await fetch("/api/tree-local-diff");
  const data = await resp.json();


  const tree = Array.isArray(data?.tree) ? data.tree : [];
  const diffs = Array.isArray(data?.diffs) ? data.diffs : [];
  const tree_div = document.getElementById("tree");
  const host = document.querySelector("#myst");
  if (!host?.shadowRoot) return;

  const shadow = host.shadowRoot;
  const select_all_for_commit = shadow.getElementById("select-all-for-commit");
  
  const commit_message = document.getElementById("commit-no-changes-message");
  if (tree.length === 0) {
    commit_message.style.display = "flex";
    tree_div.style.display = "none"; 
    select_all_for_commit.style.display = "none";
  } else {
    commit_message.style.display = "none";
    tree_div.style.display = "flex"; 
    select_all_for_commit.style.display = "flex";
  }

  const diffMap = GitDiffManager.buildDiffMap(diffs);
  const changedFolders = GitDiffManager.computeChangedFolders(tree, diffMap);

  TreeRenderer.renderTree(tree, tree_div, true, diffMap, changedFolders);

  const currentPath = localStorage.getItem("currentPath");
  restoreActiveFile(normalizePath(currentPath));

  logFilePaths();
}


// ========================= EXPORTS =========================

export const ignoredFolders = CONFIG.ignoredFolders;
export let activeFolderPath = treeState.getActiveFolderPath();

// Initialize
fetchLocalTree(true);