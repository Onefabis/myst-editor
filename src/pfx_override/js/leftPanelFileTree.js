import "./gitDiffUI";
import { loadFile } from "./MainOverride";
import { saveCurrentEditorContent, setLastSavedTimestamp } from './saveEditorText';
import { autosaveEnabled } from '../../MystEditor.jsx';
import { useContext } from "preact/hooks";
import { MystState } from "../../mystState";
import { logFilePaths } from "../../extensions/gitCommitView";
import { showModal, showConfirm, showInputModal } from "./modalWindows"
import { initBranchSwitcher } from "./branchEditing.js";

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

/**
 * Encapsulates persistent UI state for the file tree component.
 * Responsibilities:
 *  - Track which folder paths are expanded (openFolders).
 *  - Track the active folder path and the currently selected element.
 *  - Persist selected/open state to localStorage to preserve session continuity.
 */
class FileTreeState {
  constructor() {
    this.openFolders = new Set(JSON.parse(localStorage.getItem('openFolders') || '[]'));
    this.activeFolderPath = '';
    this.selectedElement = null; // Store the selected element info
  }

  /**
   * Add a folder path to the set of expanded folders and persist the change.
   */
  addOpenFolder(path) {
    this.openFolders.add(path);
    this.saveOpenFolders();
  }

  /**
   * Remove a folder path from the set of expanded folders and persist the change.
   */
  removeOpenFolder(path) {
    this.openFolders.delete(path);
    this.saveOpenFolders();
  }

  /**
   * Query whether a path is currently considered expanded/open.
   */
  isOpen(path) {
    return this.openFolders.has(path);
  }

  /**
   * Persist the current openFolders set to localStorage. This is a writable side-effect
   * and ensures the UI remembers expanded folders across reloads.
   */
  saveOpenFolders() {
    localStorage.setItem('openFolders', JSON.stringify([...this.openFolders]));
  }

  /**
   * Record the folder that is considered "active" for UI purposes.
   */
  setActiveFolderPath(path) {
    this.activeFolderPath = path;
  }

  /**
   * Return the currently active folder path.
   */
  getActiveFolderPath() {
    return this.activeFolderPath;
  }

  /**
   * Record the currently selected UI element (file or folder).
   * Stores a compact representation in localStorage (with timestamp) to allow
   * rehydration while avoiding very stale selections.
   */
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

  /**
   * Return the selected element. Prefer in-memory value, fall back to localStorage
   * if present and not stale (5 minutes threshold). This balances UX persistence
   * and avoiding pointing to resources long since removed.
   */
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

  /**
   * Clear selected element both from memory and persistent storage.
   */
  clearSelectedElement() {
    this.selectedElement = null;
    localStorage.removeItem('selectedElement');
  }
}

export const treeState = new FileTreeState();

// ========================= UTILITY FUNCTIONS =========================

/**
 * Normalize file path separators into forward-slash form. Ensures consistent
 * comparisons between paths originating from different OS or APIs.
 */
export function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

/**
 * Small accessor that resolves whether autosave mode has been toggled on.
 * Wrapped so other code doesn't directly reference external state shape.
 */
function isAutosaveEnabled() {
  return !!autosaveEnabled.value;
}

/**
 * Recursively search a tree-of-nodes structure to determine whether a file
 * with the given path exists. Returns true if found, false otherwise.
 *
 * This is used to detect missing/deleted files or validate selections.
 */
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

/**
 * Remove the 'active' class from all file elements. This is a DOM-level
 * utility used prior to setting a new active element to ensure single-active semantics.
 */
export function clearActiveStates() {
  document.querySelectorAll('.file').forEach(el => {
    el.classList.remove('active');
  });
}

/**
 * Find the DOM element representing the given path and add the 'active' class,
 * then bring it into view. Called when updating the tree to re-establish visual focus.
 */
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

/**
 * Defer re-highlighting the active file until after a render frame to ensure the
 * elements exist in the DOM (useful after a tree re-render).
 */
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

/**
 * Utility that waits for an element inside a component's Shadow DOM to appear,
 * then invokes the callback with that element. This abstracts away the timing
 * race between host component rendering and external script operations.
 */
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

/**
 * Helper that interprets raw Git diff API results into structures
 * the UI can use: a path→status map and a set of folders that contain changes.
 *
 * It intentionally separates diff processing from rendering logic.
 */
class GitDiffManager {
  /**
   * Convert the API diff list into a dictionary mapping each file path (trimmed
   * relative to treeRoot when appropriate) to its Git status code. Handles renamed
   * entries by representing the old path as DELETED and the new path as ADDED.
   */
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

  /**
   * Walk the tree and return a Set of folder paths that contain changed files
   * (or are themselves marked changed). This enables directory-level highlighting.
   */
  static computeChangedFolders(nodes, diffMap) {
    const changedFolders = new Set();
    const isChangedFile = (path) => [GIT_STATUS.ADDED, GIT_STATUS.DELETED, GIT_STATUS.MODIFIED].includes(diffMap[path]);

    /**
     * Depth-first traversal helper that returns true when the subtree at `node`
     * contains any changed files. When a subtree has changes, record the folder path.
     */
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

  /**
   * Apply the appropriate CSS class on a DOM element to visually indicate
   * Git state (added/modified/deleted). Removes prior diff classes first.
   */
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

/**
 * Responsible for transforming node structures into DOM nodes, wiring UI events,
 * applying Git metadata, and restoring selection/open state. This class focuses
 * on UI composition; it deliberately delegates diff interpretation and API calls.
 */
class TreeRenderer {
  /**
   * Choose and set the correct icon markup for a folder element. When Git diff mode
   * is active, prefer Git glyphs that represent the folder's status; otherwise use
   * standard open/closed folder icons.
   */
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

  /**
   * Build the DOM fragments that represent a single folder in the tree:
   *  - li: container
   *  - title: clickable folder label (with metadata attributes)
   *  - icon: visual glyph container
   *  - textSpan: the readable folder name (cleaned of extensions)
   *
   * Also applies selection classes and diff markers when appropriate.
   */
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


  /**
   * Build the DOM fragments that represent a single file in the tree:
   *  - li: container
   *  - title: clickable file label (with metadata attributes and file name cleaned)
   *  - icon: optional icon space (can host Git glyphs)
   * Apply selection and diff decorations. Also observe shadow DOM gitPanel presence
   * before injecting per-file small icons (prevents early DOM races).
   */
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
      
      // Wait for the host's gitPanel to exist before injecting small per-file Git icons.
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

  /**
   * Centralized click handler for files:
   *  - Update active/selected UI state
   *  - Persist selection
   *  - Trigger autosave of current editor if enabled and the file is changing
   *  - Clear the saved timestamp and instruct the host to load the selected file
   */
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

    if (isAutosaveEnabled() && currentPath) {
      await saveCurrentEditorContent();
    }
    
    setLastSavedTimestamp(null);
    loadFile(newPath);
  }

  /**
   * When viewing commit diffs inside a host's commit-wrapper, attempt to scroll the
   * commit panel to the block corresponding to the selected file. Also updates selection.
   * If the commit-wrapper or desired child cannot be found, this no-ops gracefully.
   */
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

  /**
   * Click handler for folder headers. Responsibilities:
   *  - Manage selection and active UI state
   *  - Persist selection and active folder path
   *  - Support ctrl+click to recursively expand/collapse subtrees
   *  - Toggle rendering of the subtree and update folder icons & persisted open state
   */
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

  /**
   * The core rendering routine:
   *  - Clear the parent container and build an <ul> containing nodes (folders & files)
   *  - Apply filtering rules (ignored folders, hidden dot/underscore folders unless in diff mode)
   *  - Create DOM fragments via createFolderElement/createFileElement
   *  - Attach click handlers that route either to commit-panel scrolling or to normal file loading
   *  - Restore active file highlight after render and attach a parent click handler to clear selection on empty-space clicks
   */
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

/**
 * Helpers to perform bulk operations on folder hierarchies: mark open/closed
 * recursively, expand everything under a node, or collapse everything under it.
 * These operations update both the DOM and the persisted openFolders state.
 */

class TreeOperations {
  /**
   * Walk the given node subtree and either add or remove all folder paths to the
   * treeState openFolders registry. The internal `walk` function is a small recursive helper.
   */
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

  /**
   * Given a folder's <li> and its node representation, render all children and
   * recursively expand every nested folder. Also updates folder icons and persistent open state.
   */
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

  /**
   * Clear the subtree DOM for the given li, remove all descendant folder paths
   * from the open registration, and reset the icon for the collapsed folder.
   */
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

/**
 * Thin network layer that wraps fetch calls to backend endpoints responsible
 * for returning Git metadata (head commit, tree, diffs, union trees).
 * Each method returns parsed JSON from the server and throws/propagates fetch errors.
 */
class TreeAPI {
  /**
   * Query the server for the current HEAD commit hash. Returns the `head` string.
   */
  static async getHeadCommit() {
    const response = await fetch("/api/git-head");
    const { head } = await response.json();
    return head;
  }

  /**
   * Request a union of two commit trees (files that exist in either commit),
   * used to present commit-vs-commit comparisons.
   */
  static async getUnionTree(commitLeft, commitRight) {
    const response = await fetch(
      `/api/tree-union?commit_left=${encodeURIComponent(commitLeft)}&commit_right=${encodeURIComponent(commitRight)}`
    );
    return response.json();
  }

  /**
   * Fetch the file tree representation for either HEAD (no param) or a specific commit.
   * Returns parsed JSON from the server.
   */
  static async getTree(commit = null) {
    const url = commit ? `/api/tree?commit=${encodeURIComponent(commit)}` : '/api/tree';
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Generic entry to retrieve diffs. Supported `type` values:
   *  - 'working-tree': diffs between working directory and a commit (params.commit)
   *  - 'tree': diffs between two commits (params.left, params.right)
   * Returns parsed JSON array of diff objects.
   */
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

  /**
   * Poll the host's Shadow DOM for two commit dropdown elements to become ready.
   * This is a coordination helper to avoid races between component render and API calls.
   * Returns { left, right } when ready or null after a timeout.
   */
  static waitForDropdowns() {
    const host = document.querySelector("#myst");
    if (!host?.shadowRoot) return Promise.resolve(null);

    return new Promise((resolve) => {
      const root = host.shadowRoot;

      const check = () => {
        const left = root.getElementById("commitDropdownLeft");
        const right = root.getElementById("commitDropdownRight");

        if (
          left &&
          right &&
          left.options.length > 0 &&
          right.options.length > 0
        ) {
          observer.disconnect();
          resolve({ left, right });
        }
      };

      const observer = new MutationObserver(check);
      observer.observe(root, { childList: true, subtree: true });

      // run once immediately
      check();

      // safety timeout
      setTimeout(() => {
        observer.disconnect();
        console.warn("Commit dropdowns not ready in time");
        resolve(null);
      }, CONFIG.maxDropdownWaitAttempts * CONFIG.dropdownWaitInterval);
    });
  }

}

// ========================= MAIN FUNCTIONS =========================

/**
 * Load and render the current branch repository tree applied:
 */
export async function fetchLocalTree(loadfile = true) {
  const commitHash = await TreeAPI.getHeadCommit();
  const baseTree = await TreeAPI.getTree();
  const diffs = await TreeAPI.getDiff('working-tree', { commit: commitHash });

  const tree_div = document.getElementById("tree");
  tree_div.style.display = "flex";
  const commit_message = document.getElementById("commit-no-changes-message");
  commit_message.style.display = "none";

  // Filter out deleted files
  const safeDiffs = Array.isArray(diffs) ? diffs : [];
  const filteredDiffs = safeDiffs.filter(diff => diff.status !== GIT_STATUS.DELETED);
  const diffMap = GitDiffManager.buildDiffMap(filteredDiffs);
  const changedFolders = GitDiffManager.computeChangedFolders(baseTree, diffMap);

  TreeRenderer.renderTree(baseTree, tree_div, true, diffMap, changedFolders);
  // Create context menu for every item in a tree
  removeTreeContextMenu();
  createTreeMenu();

  let currentPath = localStorage.getItem('currentPath');

  // If currentPath is empty or invalid, automatically load first file
  if (!currentPath || !fileExistsInTree(currentPath, baseTree)) {
    const firstFileNode = findFirstFile(baseTree);
    if (firstFileNode) {
      currentPath = normalizePath(firstFileNode.path);
      localStorage.setItem('currentPath', currentPath);

      // Mark it as active visually and logically
      clearActiveStates();
      const fileEl = document.querySelector(`.file[title="${CSS.escape(currentPath)}"]`);
      if (fileEl) fileEl.classList.add('active');

      treeState.setSelectedElement({
        path: firstFileNode.path,
        name: firstFileNode.name,
        type: 'file'
      });

      if (loadfile) {
        loadFile(currentPath);
      }
    }
  } else if (loadfile) {
    // Load the existing currentPath normally
    loadFile(normalizePath(currentPath));
  }

  if (currentPath) {
    restoreActiveFile(normalizePath(currentPath));
  }

  // Add branch selection/creation elements
  initBranchSwitcher();
  const brangh_edit = document.getElementById("branch_edit");
  if (brangh_edit){
    brangh_edit.style.display = "flex"; 
  }
  console.log("Init edit/preview view");
}

/**
 * Recursively finds the first file in a tree (depth-first).
 */
function findFirstFile(nodes) {
  for (const node of nodes) {
    if (node.type === 'file') return node;
    if (node.type === 'folder' && node.children) {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
}


/**
 * Render the tree based on either:
 *  - Commit-vs-commit comparison (if gitCommit parameter truthy and dropdowns present)
 *  - Working-tree vs HEAD (fallback)
 *
 * This function coordinates with the host UI (commit dropdowns) and switches diff sources accordingly.
 */
export async function fetchGitTree(gitCommit) {
  // let currentPath = localStorage.getItem('currentPath');
  // loadFile(normalizePath(currentPath));

  const tree_div = document.getElementById("tree");
  tree_div.style.display = "flex"; 
  const commit_message = document.getElementById("commit-no-changes-message");
  commit_message.style.display = "none";
  console.log("Init git diff view");
  if (gitCommit) {
    const dropdowns = await TreeAPI.waitForDropdowns();
    if (!dropdowns) return;
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
    removeTreeContextMenu();
  }
  const brangh_edit = document.getElementById("branch_edit");
  if (brangh_edit){
    brangh_edit.style.display = "none"; 
  }
}

/**
 * Special loader for the "local commit" view:
 *  - Fetch a precomputed local tree/diff payload from the server
 *  - Toggle visibility of the tree and "select all" control depending on whether there are items
 *  - Build diff map and changed folder set and render the tree
 *  - Restore active file and log file paths for downstream features
 */
export async function fetchGitCommitTree() {
  let gitCommitTreeLoaded = localStorage.getItem("gitCommitTreeLoaded");
  const resp = await fetch("/api/tree-local-diff");
  const data = await resp.json();
  const tree = Array.isArray(data?.tree) ? data.tree : [];
  const diffs = Array.isArray(data?.diffs) ? data.diffs : [];
  const tree_div = document.getElementById("tree");
  const host = document.querySelector("#myst");
  const diffMap = GitDiffManager.buildDiffMap(diffs);
  const changedFolders = GitDiffManager.computeChangedFolders(tree, diffMap);

  TreeRenderer.renderTree(tree, tree_div, true, diffMap, changedFolders);

  const currentPath = localStorage.getItem("currentPath");
  restoreActiveFile(normalizePath(currentPath));

  if (!host?.shadowRoot) return;
  const select_all_for_commit = host.shadowRoot?.getElementById("select-all-for-commit");
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

  logFilePaths();
  console.log("Init git commit view");
  removeTreeContextMenu();
  const brangh_edit = document.getElementById("branch_edit");
  if (brangh_edit){
    brangh_edit.style.display = "none"; 
  } 
}


// ========================= CUSTOM CONTEXT MENU =========================

function removeTreeContextMenu() {
  const menu = document.getElementById("custom-tree-context-menu");
  if (menu) menu.remove();
}

async function waitForButtons(selector) {
  return new Promise(resolve => {
    const check = () => {
      const host = document.getElementById("myst");
      const root = host?.shadowRoot;
      if (!root) return requestAnimationFrame(check);

      const buttons = root.querySelectorAll(selector);
      if (buttons && buttons.length > 0) return resolve(buttons);

      requestAnimationFrame(check);
    };
    check();
  });
}

// Helper to make a styled menu item
function createMenuItem(label, contextMenu) {
  const item = document.createElement("div");
  item.textContent = label;
  Object.assign(item.style, {
    padding: "6px 12px",
    cursor: "pointer",
  });
  item.onmouseover = () => (item.style.background = "#eee");
  item.onmouseout = () => (item.style.background = "#fff");
  contextMenu.appendChild(item);
  return item;
}

let contextTargetElement = null;

// Context menu creation for every tree element
async function createTreeMenu() {
  let contextMenu = null;
  const buttons = await waitForButtons('.side button[type="button"]');
  const activeButton = Array.from(buttons).find(btn =>
    btn.getAttribute('active') === 'true'
  );

  if (activeButton &&
     ["Dual Pane", "Preview", "Source", "Inline Preview"].includes(activeButton.title)) {

    // Create menu only when allowed
    contextMenu = document.createElement("div");
    contextMenu.id = "custom-tree-context-menu";
    Object.assign(contextMenu.style, {
      position: "absolute",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "9px",
      padding: "4px 0",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      display: "none",
      zIndex: 1000,
      minWidth: "120px",
      fontSize: "13px",
    });

    document.body.appendChild(contextMenu);
  }

  const renameOption = createMenuItem("Rename", contextMenu);
  const moveOption   = createMenuItem("Move", contextMenu);
  const deleteOption = createMenuItem("Delete", contextMenu);

  renameOption.onclick = async () => {
    if (!contextTargetElement) return;
    await performRename(getSelectedElement(contextTargetElement));
    contextMenu.style.display = "none";
  };

  moveOption.onclick = async () => {
    if (!contextTargetElement) return;
    await performMove(getSelectedElement(contextTargetElement));
    contextMenu.style.display = "none";
  };

  deleteOption.onclick = async () => {
    if (!contextTargetElement) return;
    await performDelete(getSelectedElement(contextTargetElement));
    contextMenu.style.display = "none";
  };

  function getSelectedElement(el) {
    return {
      path: el.dataset.elementPath,
      name: el.dataset.elementName,
      type: el.dataset.elementType,
    };
  }

  // Show custom menu
  document.getElementById("tree").addEventListener("contextmenu", (e) => {
    const targetSpan = e.target.closest("span.file, span.folder");
    if (!targetSpan) return;

    e.preventDefault();
    contextTargetElement = targetSpan;
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.style.display = "block";
  });

  // Hide menu
  document.addEventListener("click", () => (contextMenu.style.display = "none"));
}

// ----------------------- Move To Dialog ----------------------- //

/* Opens the "Move To" dialog for relocating files or folders.
Allows restructuring of the project's file/folder hierarchy on a raw "doc" (markdown) folder.
This structure doesn't reflect the final Sphinx navigation tree, because it's driven by "toctree" defined inside key markdown files.
Read Sphinx docs here - https://www.sphinx-doc.org/en/master/usage/restructuredtext/directives.html#table-of-contents
 */
export function openMoveToDialog(itemPath) {
  const modal = document.createElement("div");
  modal.className = "move-modal";

  modal.innerHTML = `
    <h3>Select folder to move to</h3>
    <div id="move-tree" class="move-tree"></div>
    <div class="move-actions">
      <button id="move-cancel">Cancel</button>
      <button id="move-ok">OK</button>
    </div>
  `;

  document.body.appendChild(modal);
  let selectedMovePath = "";

  fetch("/api/tree").then(res => res.json()).then(data => {
    const container = document.getElementById("move-tree");
    const rootNode = {
      type: "folder",
      name: "root",
      path: "",
      children: data
    };
    renderMoveTree([rootNode], container);
  });

  function renderMoveTree(nodes, parent) {
    const ul = document.createElement("ul");
    for (const node of nodes) {
      if (node.type !== "folder") continue;
      if (CONFIG.ignoredFolders.includes(node.name)) continue;
      const li = document.createElement("li");
      const btn = document.createElement("div");
      btn.textContent = "📁 " + node.name;
      btn.className = "move-folder-btn";
      btn.onclick = () => {
        selectedMovePath = node.path.replace(/\\/g, "/");
        document.querySelectorAll("#move-tree div").forEach(el => el.classList.remove("selected"));
        btn.classList.add("selected");
      };
      li.appendChild(btn);
      if (node.children) {
        renderMoveTree(node.children, li);
      }
      ul.appendChild(li);
    }
    parent.appendChild(ul);
  }

  document.getElementById("move-ok").onclick = async () => {
    if (selectedMovePath === null) {
      alert("Select a file or folder to move.");
      return;
    }
    const name = itemPath.replace(/\\/g, "/").split("/").pop();
    const newPath = selectedMovePath ? `${selectedMovePath}/${name}` : name;
    const res = await fetch("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath: itemPath, newPath }),
    });
    if (!res.ok) {
      alert("Error while moving.");
    } else {
      let currentPath = localStorage.getItem('currentPath') || "";
      if (currentPath === itemPath) {
        localStorage.setItem('currentPath', newPath);
      }
      
      // Update selected element if it was moved
      const selectedElement = treeState.getSelectedElement();
      if (selectedElement && selectedElement.path === itemPath) {
        treeState.setSelectedElement({
          path: newPath,
          name: selectedElement.name,
          type: selectedElement.type
        });
      }
      
      fetchLocalTree();
    }
    modal.remove();
  };

  document.getElementById("move-cancel").onclick = () => {
    modal.remove();
  };
}


// -------- Rename --------
async function performRename(selectedElement) {
  const path = selectedElement.path;
  const name = selectedElement.name;

  if (ignoredFolders.includes(name)) {
    showModal("Cannot Rename", `Protected folder: ${name}`, { isError: true });
    return;
  }

  const oldPath = path.replace(/\\/g, "/");
  const segments = oldPath.split("/");
  const oldName = segments.pop();
  const dirPath = segments.join("/");

  const displayName = oldName.endsWith(".md") ? oldName.replace(/\.md$/, "") : oldName;
  const inputName = await showInputModal("Rename Item", "Enter a new name:", displayName);
  if (!inputName || inputName === displayName) return;

  const newName =
    oldName.endsWith(".md") && !inputName.endsWith(".md") ? `${inputName}.md` : inputName;
  const newPath = dirPath ? `${dirPath}/${newName}` : newName;

  const res = await fetch("/api/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newPath, action: "check" }),
  });

  if (!res.ok) {
    const error = await res.json();
    showModal("Rename Error", error.error || "Unknown rename error", { isError: true });
    return;
  }

  let currentPath = localStorage.getItem("currentPath") || "";
  if (currentPath === oldPath) {
    localStorage.setItem("currentPath", newPath);
  }

  treeState.setSelectedElement({
    path: newPath,
    name: newName,
    type: selectedElement.type,
  });

  fetchLocalTree();
}

// -------- Delete --------
async function performDelete(selectedElement) {
  if (!selectedElement) {
    showModal("Delete Failed", "Select a file or folder to delete.", { isError: true });
    return;
  }

  const path = selectedElement.path;
  const name = selectedElement.name;

  if (ignoredFolders.includes(name)) {
    showModal("Delete Blocked", `Protected folder: ${name}`, { isError: true });
    return;
  }

  const isFolder = selectedElement.type === "folder";
  const confirmText = isFolder
    ? `Delete folder "${path}" and all contents?`
    : `Delete file "${path}"?`;

  const confirmed = await showConfirm("Confirm Delete", confirmText);
  if (!confirmed) return;

  try {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!res.ok) {
      const error = await res.text();
      showModal("Delete Error", error, { isError: true });
      return;
    }

    clearActiveStates();
    treeState.clearSelectedElement();

    let currentPath = localStorage.getItem("currentPath") || "";
    if (currentPath) {
      const myst = document.getElementById("myst");
      if (isFolder && currentPath.startsWith(path + "/")) {
        localStorage.removeItem("currentPath");
        localStorage.removeItem("lastOpened");
        if (myst) myst.innerHTML = "";
      } else if (!isFolder && currentPath === path) {
        localStorage.removeItem("currentPath");
        localStorage.removeItem("lastOpened");
        if (myst) myst.innerHTML = "";
      }
    }

    fetchLocalTree();
  } catch (err) {
    showModal("Delete Error", err.message, { isError: true });
  }
}

// -------- Move --------
async function performMove(selectedElement) {
  if (!selectedElement) {
    showModal("Move Failed", "Select a file or folder to move.", { isError: true });
    return;
  }

  const name = selectedElement.name;
  if (ignoredFolders.includes(name)) {
    showModal("Move Blocked", `Protected folder: ${name}`, { isError: true });
    return;
  }

  openMoveToDialog(selectedElement.path);
  fetchLocalTree();
}

// ========================= EXPORTS =========================

export const ignoredFolders = CONFIG.ignoredFolders;
export let activeFolderPath = treeState.getActiveFolderPath();

// fetchLocalTree(true);

//Initialize
const viewModeButtonID = localStorage.getItem("mainButtonSelection") || '0';
const currentPath = localStorage.getItem('currentPath');

if (viewModeButtonID === '4'){
  loadFile(currentPath);
  const isLocalDiff = localStorage.getItem("gitDiffLocalstateToggle") === "true";
  fetchGitTree(isLocalDiff);
} else if (viewModeButtonID === '5'){
  loadFile(currentPath);
  fetchGitCommitTree();
} else {
  fetchLocalTree(true);
}

