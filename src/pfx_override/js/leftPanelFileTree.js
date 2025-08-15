import "./gitDiffUI.js";
import { updateGitPanel, setupGitDiffListeners } from "./gitDiffUI.js";
import { loadFile, insertImageMarkdown } from "./MainOverride.js";
import { saveCurrentEditorContent, setLastSavedTimestamp } from './saveEditorText.js'; 
import { autosaveEnabled } from '../../MystEditor.jsx';

/* Tracks which folders are currently open in the file tree.
Stored in localStorage for persistence across page reloads. */
const openFolders = new Set(JSON.parse(localStorage.getItem('openFolders') || '[]'));

//List of folders that are hidden in a tree
const bulletproof = ["_static", "_templates"];

//Currently active folder path in the file tree
let activeFolderPath = '';

function isAutosaveOn() {
  return !!autosaveEnabled.value;
}

// ----------------------- Utility Functions ----------------------- //

// Converts backslashes to forward slashes for consistency
function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

/* Recursively checks if a file exists in the provided tree data.
Used to prevent loading files that no longer exist. */
function fileExistsInTree(path, nodes) {
  for (const node of nodes) {
    if (node.path === path && node.type === 'file') return true;
    if (node.type === 'folder' && node.children) {
      if (fileExistsInTree(path, node.children)) return true;
    }
  }
  return false;
}

/* Clears all "active" classes from file and folder elements.
Ensures only one selected item at a time in the file tree. */
function clearActiveStates() {
  document.querySelectorAll('.file, .folder').forEach(el => {
    el.classList.remove('active');
  });
}

// ----------------------- Tree Rendering ----------------------- //

/* Fetches the file tree from the backend API and renders it in the UI.
Main entry point for loading and refreshing the project’s file structure. */
function fetchTree() {
  fetch('/api/tree')
    .then(res => res.json())
    .then(data => {
      renderTree(data, document.getElementById('tree'));

      // After rendering tree, restore selected file if it still exists
      let currentPath = localStorage.getItem('currentPath');
      if (currentPath) {
        if (fileExistsInTree(currentPath, data)) {
          fetch(`/api/file?path=${encodeURIComponent(currentPath)}`)
            .then(res => {
              if (!res.ok) throw new Error('File missing');
              return res.json();
            })
            .then(() => loadFile(normalizePath(currentPath)))
            .catch(() => {
              console.warn("Last opened file not found.");
              localStorage.removeItem('currentPath');
            });
        } else {
          localStorage.removeItem('currentPath');
          localStorage.removeItem('lastOpened');
        }
      }
    });
}

/* Renders the file/folder tree recursively into a given parent element.
Central visual component for navigating the project’s structure. */
function renderTree(nodes, parent) {
  parent.innerHTML = '';
  const ul = document.createElement('ul');

  const closedFolderSVG = `
    <svg width="14" height="14" viewBox="0 0 24 24" style="transform: translate(2px, 2px);">
      <polygon points="6,4 18,12 6,20" fill="#888888"/>
    </svg>`;
  const openFolderSVG = `
    <svg width="14" height="14" viewBox="0 0 24 24" style="transform: translate(2px, 2px);">
      <polygon points="4,6 12,18 20,6" fill="#888888"/>
    </svg>`;
  const spacerSVG = `
    <svg width="14" height="14" viewBox="0 0 24 24">
      <rect width="24" height="24" fill="transparent"/>
    </svg>`;

  for (const node of nodes) {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.textContent = node.name.endsWith('.md') ? node.name.replace(/\.md$/, '') : node.name;
    title.title = node.path;
    title.className = node.type;

    const icon = document.createElement('span');
    icon.classList.add('icon-margin'); // consistent spacing

    if (node.type === 'folder') {
      if (node.name.startsWith('.') || node.name.startsWith('_')) continue;
      icon.innerHTML = closedFolderSVG; // default closed
      title.prepend(icon);
    } else if (node.type === 'file') {
      icon.innerHTML = spacerSVG; // keeps text aligned
      title.prepend(icon);
    }

      title.onclick = async e => {
      e.stopPropagation();
      clearActiveStates();
      title.classList.add('active');

      if (node.type === 'file') {
        const newPath = normalizePath(node.path);
        const currentPath = localStorage.getItem('currentPath');

        if (isAutosaveOn() && currentPath && currentPath !== newPath) {
          await saveCurrentEditorContent();
        }
        setLastSavedTimestamp(null);

        updateGitPanel(newPath);
        setupGitDiffListeners();
        loadFile(newPath);
      } else {
        activeFolderPath = node.path;
        const subtreeContainer = li.querySelector('.subtree');
        const isOpen = subtreeContainer.hasChildNodes();
        if (isOpen) {
          subtreeContainer.innerHTML = '';
          icon.innerHTML = closedFolderSVG;
          openFolders.delete(node.path);
          localStorage.setItem('openFolders', JSON.stringify([...openFolders]));
        } else if (node.children) {
          renderTree(node.children, subtreeContainer);
          icon.innerHTML = openFolderSVG;
          openFolders.add(node.path);
          localStorage.setItem('openFolders', JSON.stringify([...openFolders]));
        }
      }
    };

    const subtreeContainer = document.createElement('div');
    subtreeContainer.className = 'subtree';
    li.appendChild(title);
    li.appendChild(subtreeContainer);
    ul.appendChild(li);

    if (node.type === 'folder' && openFolders.has(node.path)) {
      renderTree(node.children || [], subtreeContainer);
      icon.innerHTML = openFolderSVG;
    }
  }

  parent.appendChild(ul);
  parent.addEventListener('click', e => {
    if (!e.target.closest('span.file') && !e.target.closest('span.folder')) {
      clearActiveStates();
      activeFolderPath = '';
    }
  });
}


// ----------------------- Move To Dialog ----------------------- //

/* Opens the "Move To" dialog for relocating files or folders.
Allows restructuring of the project’s file/folder hierarchy on a raw "doc" (markdown) folder.
This structure doesn't reflect the final Sphinx navigation tree, because it's driven by "toctree" defined inside key markdown files.
Read Sphinx docs here - https://www.sphinx-doc.org/en/master/usage/restructuredtext/directives.html#table-of-contents
 */
function openMoveToDialog(itemPath) {
  const modal = document.createElement("div");
  modal.className = "move-modal";

  modal.innerHTML = `
    <h3>Select folder to move to</h3>
    <div id="move-tree" class="move-tree"></div>
    <div class="move-actions">
      <button id="move-cancel">❌ Cancel</button>
      <button id="move-ok">✅ OK</button>
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
      if (currentPath === itemPath) {
        localStorage.setItem('currentPath', newPath);
        // currentPath = newPath;
      }
      fetchTree();
    }
    modal.remove();
  };

  document.getElementById("move-cancel").onclick = () => {
    modal.remove();
  };
}

// ----------------------- Toolbar Button Actions START ----------------------- //

document.getElementById("move").onclick = () => {
  const selectedEl = document.querySelector(".file.active, .folder.active");
  if (!selectedEl) {
    alert("Select a file or folder to move.");
    return;
  }
  const path = selectedEl.title;
  const name = path.split('/').pop();
  if (bulletproof.includes(name)) {
    alert(`Cannot move protected folder: ${name}`);
    return;
  }
  openMoveToDialog(path);
};

document.getElementById("new-file").onclick = async () => {
  const name = prompt('Enter new file name (without ".md")');
  if (!name || name.trim() === '') return;
  const fullName = name.endsWith('.md') ? name : `${name}.md`;
  const path = activeFolderPath ? `${activeFolderPath}/${fullName}` : fullName;
  fetch('/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'file' }),
  }).then(() => {
    fetchTree();
    setTimeout(() => loadFile(normalizePath(path)), 500);
  });
};

document.getElementById("new-folder").onclick = async () => {
  const name = prompt('Enter new folder name (e.g.: newfolder)');
  if (!name) return;
  const path = activeFolderPath ? `${activeFolderPath}/${name}` : name;
  fetch('/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'folder' }),
  }).then(() => fetchTree());
};

document.getElementById("delete").onclick = async () => {
  const selectedEl = document.querySelector(".file.active, .folder.active");
  if (!selectedEl) {
    alert("Select a file or folder to delete.");
    return;
  }
  const path = selectedEl.title;
  const name = path.split('/').pop();
  if (bulletproof.includes(name)) {
    alert(`Cannot delete protected folder: ${name}`);
    return;
  }
  const isFolder = selectedEl.classList.contains("folder");
  const confirmText = isFolder
    ? `Are you sure you want to delete the folder "${path}" and all its contents?`
    : `Are you sure you want to delete the file "${path}"?`;
  if (!confirm(confirmText)) return;
  try {
    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      const error = await res.text();
      alert(`Error while deleting: ${error}`);
      return;
    }
    clearActiveStates();
    let currentPath = localStorage.getItem('currentPath');
    if (currentPath) {
      if (isFolder && currentPath.startsWith(path + '/')) {
        localStorage.removeItem('currentPath');
        localStorage.removeItem('lastOpened');
        localStorage.removeItem('currentPath');
        // currentPath = '';
        const editor = document.getElementById("myst");
        if (editor) editor.innerHTML = "";
      } else if (!isFolder && currentPath === path) {
        localStorage.removeItem('currentPath');
        localStorage.removeItem('lastOpened');
        localStorage.removeItem('currentPath');
        // currentPath = '';
        const editor = document.getElementById("myst");
        if (editor) editor.innerHTML = "";
      }
    }
    fetchTree();
  } catch (err) {
    alert(`Error while deleting: ${err.message}`);
  }
};

document.getElementById("rename").onclick = async () => {
  const selectedEl = document.querySelector(".file.active, .folder.active");
  if (!selectedEl) {
    alert("Select a file or folder to rename.");
    return;
  }
  const path = selectedEl.title;
  const name = path.split('/').pop();
  if (bulletproof.includes(name)) {
    alert(`Cannot rename protected folder: ${name}`);
    return;
  }
  const oldPath = path.replace(/\\/g, "/");
  const segments = oldPath.split("/");
  const oldName = segments.pop();
  const dirPath = segments.join("/");

  const displayName = oldName.endsWith(".md") ? oldName.replace(/\.md$/, "") : oldName;
  const inputName = prompt("Enter new name:", displayName);
  if (!inputName || inputName.trim() === "" || inputName === displayName) return;
  const newName = oldName.endsWith(".md") && !inputName.endsWith(".md")
    ? `${inputName}.md` : inputName;
  const newPath = dirPath ? `${dirPath}/${newName}` : newName;
  const res = await fetch("/api/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newPath }),
  });
  if (!res.ok) {
    alert("Rename error.");
    return;
  }
  if (currentPath === oldPath) {
    // currentPath = newPath;
    localStorage.setItem("currentPath", newPath);
  }
  fetchTree();
};

// ----------------------- Toolbar Button Actions END ----------------------- //

// ----------------------- Upload Modal Image START ------------------------- //

//Creates the image upload modal DOM constructor to show it in a popup window.
function createuploadImageModal() {
  const modal = document.createElement("div");
  modal.id = "upload-image-modal";
  modal.className = "upload-modal hidden";

  const content = document.createElement("div");
  content.className = "upload-modal-content";

  const closeBtn = document.createElement("div");
  closeBtn.innerHTML = "&times;";
  closeBtn.className = "upload-modal-close";

  const title = document.createElement("h3");
  title.textContent = "Name Image";
  title.className = "upload-modal-title";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "upload-modal-input";

  const actions = document.createElement("div");
  actions.className = "upload-modal-actions";

  const nameBtn = document.createElement("button");
  nameBtn.textContent = "Name";
  nameBtn.className = "btn-green";

  const incrementBtn = document.createElement("button");
  incrementBtn.textContent = "Increment";
  incrementBtn.className = "btn-blue hidden";

  const overwriteBtn = document.createElement("button");
  overwriteBtn.textContent = "Overwrite";
  overwriteBtn.className = "btn-orange hidden";

  actions.appendChild(nameBtn);
  actions.appendChild(overwriteBtn);
  actions.appendChild(incrementBtn);

  content.appendChild(closeBtn);
  content.appendChild(title);
  content.appendChild(input);
  content.appendChild(actions);
  modal.appendChild(content);
  document.body.appendChild(modal);

  return { modal, input, nameBtn, incrementBtn, overwriteBtn, closeBtn, title };
}

const uploadImageModal = createuploadImageModal();

/* Shows the upload modal, handles name collision checks, and resolves with upload action.
Ensures user-controlled image naming before upload. */
function showUploadImageModal(file, currentPath) {
  return new Promise((resolve) => {
    const dotIndex = file.name.lastIndexOf(".");
    const baseName = dotIndex > -1 ? file.name.substring(0, dotIndex) : file.name;
    const extension = dotIndex > -1 ? file.name.substring(dotIndex) : "";

    uploadImageModal.input.value = baseName;
    uploadImageModal.title.textContent = "Name Image";
    uploadImageModal.nameBtn.classList.remove("hidden");
    uploadImageModal.overwriteBtn.classList.add("hidden");
    uploadImageModal.incrementBtn.classList.add("hidden");
    uploadImageModal.modal.classList.remove("hidden");
    uploadImageModal.input.focus();

    async function checkCollision(actionType) {
      const newName = uploadImageModal.input.value.trim() + extension;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);
      formData.append("action", actionType);

      const res = await fetch("/api/upload_image", { method: "POST", body: formData });
      const data = await res.json();

      if (res.status === 409 && data.collision) {
        uploadImageModal.title.textContent = `Image "${uploadImageModal.input.value.trim()}" already exists`;
        uploadImageModal.nameBtn.classList.add("hidden");
        uploadImageModal.overwriteBtn.classList.remove("hidden");
        uploadImageModal.incrementBtn.classList.remove("hidden");
      } else if (res.ok) {
        uploadImageModal.modal.classList.add("hidden");
        resolve({ action: actionType, savedPath: data.newPath });
      } else {
        alert(data.error || "Upload failed");
      }
    }

    uploadImageModal.nameBtn.onclick = () => checkCollision("check");
    uploadImageModal.incrementBtn.onclick = () => checkCollision("increment");
    uploadImageModal.overwriteBtn.onclick = () => checkCollision("overwrite");
    uploadImageModal.closeBtn.onclick = () => {
      uploadImageModal.modal.classList.add("hidden");
      resolve(null);
    };

    document.onkeydown = (e) => {
      if (e.key === "Enter") uploadImageModal.nameBtn.click();
      else if (e.key === "Escape") uploadImageModal.closeBtn.click();
    };
  });
}

document.getElementById("upload-image").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const mdPath = localStorage.getItem("currentPath") || "";
    const segments = mdPath.split("/");
    segments.pop();

    let imagePath = segments.join("/");
    if (imagePath.startsWith("/")) imagePath = imagePath.slice(1);

    const result = await showUploadImageModal(file, imagePath);
    if (result && result.savedPath) {
      insertImageMarkdown(result.savedPath);
    }
  };
  input.click();
};

// Initial load
fetchTree();
