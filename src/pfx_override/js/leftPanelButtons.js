import { fetchLocalTree, activeFolderPath, normalizePath, ignoredFolders, clearActiveStates, treeState, fetchGitCommitTree } from "./leftPanelFileTree";
import { loadFile, insertImageMarkdown } from "./MainOverride";
import { runGitAction } from "./commitCurentStateUI";

const CONFIG = {
  ignoredFolders: ["_static", "_templates", ".obsidian"],
};

// ----------------------- Move To Dialog ----------------------- //

/* Opens the "Move To" dialog for relocating files or folders.
Allows restructuring of the project's file/folder hierarchy on a raw "doc" (markdown) folder.
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

// ----------------------- Toolbar Button Actions START ----------------------- //

document.getElementById("move").onclick = () => {
  const selectedElement = treeState.getSelectedElement();
  
  if (!selectedElement) {
    alert("Select a file or folder to move.");
    return;
  }
  
  const name = selectedElement.name;
  if (ignoredFolders.includes(name)) {
    alert(`Cannot move protected folder: ${name}`);
    return;
  }
  
  openMoveToDialog(selectedElement.path);
};

document.getElementById("new-file").onclick = async () => {
  const selectedElement = treeState.getSelectedElement();
  let targetFolder = '';

  if (selectedElement && selectedElement.type === 'folder') {
    targetFolder = selectedElement.path; // use selected folder
  } else if (activeFolderPath) {
    targetFolder = activeFolderPath; // fallback
  }

  const name = prompt('Enter new file name (without ".md")');
  if (!name || name.trim() === '') return;
  const fullName = name.endsWith('.md') ? name : `${name}.md`;
  const path = targetFolder ? `${targetFolder}/${fullName}` : fullName;

  fetch('/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'file' }),
  }).then(() => {
    fetchLocalTree();
    setTimeout(() => loadFile(normalizePath(path)), 500);
  });
};

document.getElementById("new-folder").onclick = async () => {
  const selectedElement = treeState.getSelectedElement();
  let targetFolder = '';

  if (selectedElement && selectedElement.type === 'folder') {
    targetFolder = selectedElement.path;
  } else if (activeFolderPath) {
    targetFolder = activeFolderPath;
  }

  const name = prompt('Enter new folder name (e.g.: newfolder)');
  if (!name) return;
  const path = targetFolder ? `${targetFolder}/${name}` : name;

  fetch('/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type: 'folder' }),
  }).then(() => fetchLocalTree());
};


document.getElementById("delete").onclick = async () => {
  const selectedElement = treeState.getSelectedElement();
  
  if (!selectedElement) {
    alert("Select a file or folder to delete.");
    return;
  }

  const path = selectedElement.path;
  const name = selectedElement.name;
  
  if (ignoredFolders.includes(name)) {
    alert(`Cannot delete protected folder: ${name}`);
    return;
  }
  
  const isFolder = selectedElement.type === 'folder';
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
    treeState.clearSelectedElement(); // Clear the selection after deletion
    
    let currentPath = localStorage.getItem('currentPath') || "";
    if (currentPath) {
      if (isFolder && currentPath.startsWith(path + '/')) {
        localStorage.removeItem('currentPath');
        localStorage.removeItem('lastOpened');
        localStorage.removeItem('currentPath');
        const editor = document.getElementById("myst");
        if (editor) editor.innerHTML = "";
      } else if (!isFolder && currentPath === path) {
        localStorage.removeItem('currentPath');
        localStorage.removeItem('lastOpened');
        localStorage.removeItem('currentPath');
        const editor = document.getElementById("myst");
        if (editor) editor.innerHTML = "";
      }
    }
    
    fetchLocalTree();
  } catch (err) {
    alert(`Error while deleting: ${err.message}`);
  }
};

document.getElementById("rename").onclick = async () => {
  const selectedElement = treeState.getSelectedElement();
  
  if (!selectedElement) {
    alert("Select a file or folder to rename.");
    return;
  }

  const path = selectedElement.path;
  const name = selectedElement.name;
  
  if (ignoredFolders.includes(name)) {
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
    body: JSON.stringify({ oldPath, newPath, action: "check" }),
  });

  if (!res.ok) {
    const error = await res.json();
    alert("Rename error: " + (error.error || "Unknown"));
    return;
  }

  let currentPath = localStorage.getItem('currentPath') || "";
  if (currentPath === oldPath) {
    localStorage.setItem("currentPath", newPath);
  }
  
  // Update the selected element to reflect the new path/name
  treeState.setSelectedElement({
    path: newPath,
    name: newName,
    type: selectedElement.type
  });
  
  fetchLocalTree();
};

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

document.getElementById("git-refresh").onclick = () =>
  runGitAction(
    "refresh",
    "Refresh Branch?",
    "Fetch and rebase from remote? Local changes may cause conflicts."
  );

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

      // Wrap original Blob into a new File with the new name
      const renamedFile = new File([file], newName, { type: file.type });

      const formData = new FormData();
      formData.append("file", renamedFile); // use renamed file
      // formData.append("file", file);
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