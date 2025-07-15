import '../css/MainOverrideStyle.css';
import '../css/FuroStyleOverride.css';

import MystEditor, { defaultButtons } from '../../MystEditor.jsx';
const openFolders = new Set(JSON.parse(localStorage.getItem('openFolders') || '[]'));
const bulletproof = ["_static", "_templates"];
let currentPath = '';
let activeFolderPath = '';
let mystEditorInstance = null;
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
const editorPanel = document.getElementById('editor-panel');
// Restore sidebar width
const savedWidth = localStorage.getItem('sidebarWidth');
if (savedWidth) {
  sidebar.style.width = savedWidth + 'px';
}

// Resize logic
resizer.onmousedown = function (e) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = sidebar.offsetWidth;
  document.onmousemove = function (e) {
    const newWidth = startWidth + (e.clientX - startX);
    if (newWidth >= 250 && newWidth <= 600) {
      sidebar.style.width = newWidth + 'px';
      localStorage.setItem('sidebarWidth', newWidth);
    }
  };
  document.onmouseup = function () {
    document.onmousemove = null;
    document.onmouseup = null;
  };
};


function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

function fetchTree() {
  fetch('/api/tree')
    .then(res => res.json())
    .then(data => {
      renderTree(data, document.getElementById('tree'));
      // After rendering tree, restore selected file
      let currentPath = localStorage.getItem('currentPath');
      if (currentPath) {
        // Instead of always trying to load, check if currentPath exists in tree
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
          // File no longer exists, clear stored path
          localStorage.removeItem('currentPath');
          localStorage.removeItem('lastOpened');
        }
      }
    });
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

function clearActiveStates() {
  document.querySelectorAll('.file, .folder').forEach(el => {
    el.classList.remove('active');
  });
}

function renderTree(nodes, parent) {
  parent.innerHTML = '';
  const ul = document.createElement('ul');
  for (const node of nodes) {
    const li = document.createElement('li');
    const title = document.createElement('span');     
    //title.textContent = node.name;
    title.textContent = node.name.endsWith('.md') ? node.name.replace(/\.md$/, '') : node.name;
    title.title = node.path;
    title.className = node.type;
    if (node.type === 'folder') {
      if (node.name.startsWith('.') || node.name.startsWith('_')) {
        continue;
      }
      const icon = document.createElement('span');
      icon.textContent = '📁'; // closed folder icon
      icon.style.marginRight = '6px';
      title.prepend(icon);
    } else if (node.type === 'file') {
      const icon = document.createElement('span');
      icon.textContent = '📄'; // file icon
      icon.style.marginRight = '6px';
      title.prepend(icon);
    }
    title.onclick = e => {
      e.stopPropagation();
      clearActiveStates();
      title.classList.add('active');
      const icon = title.querySelector('span');
      if (node.type === 'file') {
        loadFile(normalizePath(node.path));
      } else {
        activeFolderPath = node.path;
        const subtreeContainer = li.querySelector('.subtree');
        const isOpen = subtreeContainer.hasChildNodes();
        if (isOpen) {
          subtreeContainer.innerHTML = '';
          if (icon) icon.textContent = '📁';
          openFolders.delete(node.path);
          localStorage.setItem('openFolders', JSON.stringify([...openFolders]));
        } else if (node.children) {
          renderTree(node.children, subtreeContainer);
          if (icon) icon.textContent = '📂';
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
    // Restore open state
    if (node.type === 'folder' && openFolders.has(node.path)) {
      renderTree(node.children || [], subtreeContainer);
      const icon = title.querySelector('span');
      if (icon) icon.textContent = '📂';
    }
  }
  parent.appendChild(ul);
  // Clicking empty space in tree clears selection
  parent.addEventListener('click', (e) => {
    if (!e.target.closest('span.file') && !e.target.closest('span.folder')) {
      clearActiveStates();
      activeFolderPath = '';
    }
  });
}

async function loadFile(filename) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(normalizePath(filename))}`);
  if (res.status === 404) {
    console.warn('Last opened file not found.');
    localStorage.removeItem('lastOpened');
    return;
  }

  if (!res.ok) {
    alert(`File loading error: ${res.statusText}`);
    return;
  }

  const data = await res.json();
  const old = document.getElementById("myst");
  const newContainer = document.createElement("div");
  newContainer.id = "myst";
  newContainer.style.flexGrow = "1";
  newContainer.style.border = "1px solid #ccc";
  newContainer.style.marginBottom = "0.5rem";
  newContainer.style.height = "80vh";
  old.replaceWith(newContainer);
  currentPath = filename;
  localStorage.setItem('currentPath', currentPath);

  // Create a CSS stylesheet and add style to remove padding
  const sheet = new CSSStyleSheet();
  const css = await (await fetch('../FuroStyleOverride.css')).text();
  await sheet.replace(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];


  // Only show the file name in title
  const title = filename.split('\\').pop().split('/').pop();
  const urlParams = new URLSearchParams(window.location.search);
  const usercolors = ["#30bced", "#60c771", "#e6aa3a", "#cbb63e", "#ee6352", "#9ac2c9", "#8acb88", "#14b2c4"];
  const env = import.meta?.env ?? {};
  const collabEnabled = !(env.VITE_COLLAB === "OFF") && urlParams.get("collab") !== "false";
  const collabUrl = env.VITE_WS_URL ?? urlParams.get("collab_server");
  const room = urlParams.get("room") || "0";
  const username = urlParams.get("username") || Math.floor(Math.random() * 1000).toString();
  const color = usercolors[Math.floor(Math.random() * usercolors.length)];


  requestAnimationFrame(() => {
    mystEditorInstance = MystEditor({
      templatelist: "linkedtemplatelist.json",
      initialText: data.content,
      title: title,
      additionalStyles: sheet,
      collaboration: {
        enabled: true,
        commentsEnabled: true,
        resolvingCommentsEnabled: true,
        wsUrl: collabUrl ?? "#",
        username,
        room,
        color,
        mode: collabUrl ? "websocket" : "local",
      },

      includeButtons: defaultButtons.concat([
        {
          text: "Excalidraw",
          action: () => {
            copyExcalidrawSceneToClipboardFromMystSelection();
          }
        }, 
        {
          text: "💾 Save",
          action: () => {
            const content = mystEditorInstance.editorView.v.contentDOM.editContext.text;
            fetch(`/api/file?path=${encodeURIComponent(currentPath)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content }),
            }).then(() => alert('Saved'));
          },
        },
        {
          text: "🗃️ Image",
          action: () => {
            openImagePicker();
          }
        }, 
        {
          text: "Clear", 
          action: () => {
            clearLineSymbols();
          }
        }, 
        {
          text: "H1", 
          action: () => {
            convertToH1();
          }
        }, 
        {
          text: "H2", 
          action: () => {
            convertToH2();
          }
        }, 
        {
          text: "B", 
          action: () => {
            convertToBold();
          }
        }
      ]),
      spellcheckOpts: { dict: "en_US", dictionaryPath: `${window.location.pathname}dictionaries` },
      syncScroll: true,
    }, newContainer);

    window._mystEditor = mystEditorInstance;
  });

  localStorage.setItem('lastOpened', filename);
}

// ------------------------- Typography buttons functions START -------------------------- //

const trimSymbols = ['*', '#', '_'];

function clearLineSymbols() {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }

  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  const fullText = state.doc.toString();

  // Get the full line
  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = fullText.indexOf('\n', end);
  const actualEnd = lineEnd === -1 ? fullText.length : lineEnd;

  const line = fullText.slice(lineStart, actualEnd);

  // Remove all leading/trailing symbols and spaces
  const symbolPattern = `[#*_\\s]*`; // greedy match of symbols and whitespace
  const regex = new RegExp(`^${symbolPattern}(.*?)${symbolPattern}$`);
  const match = line.match(regex);
  const cleaned = match ? match[1] : line;

  view.v.dispatch({
    changes: { from: lineStart, to: actualEnd, insert: cleaned },
    selection: { anchor: lineStart + cleaned.length }
  });

  view.v.focus();
}

// Helper to insert H1/H2 style
function _convertLinePrefix(prefix) {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }

  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  const fullText = state.doc.toString();

  // Get the full line
  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = fullText.indexOf('\n', end);
  const actualEnd = lineEnd === -1 ? fullText.length : lineEnd;

  const line = fullText.slice(lineStart, actualEnd);
  const cleaned = line.replace(/^[#*_ \t]+|[#*_ \t]+$/g, '');
  const newLine = prefix + cleaned;

  view.v.dispatch({
    changes: { from: lineStart, to: actualEnd, insert: newLine },
    selection: { anchor: lineStart + newLine.length }
  });

  view.v.focus();
}

function convertToH1() {
  clearLineSymbols();
  _convertLinePrefix('# ');
}

function convertToH2() {
  clearLineSymbols();
  _convertLinePrefix('## ');
}

function convertToBold() {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }

  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  // Skip if no selection
  if (start === end) {
    alert("Please select text to bold.");
    return;
  }
  const fullText = state.doc.toString();

  const selectedText = fullText.slice(start, end);
  const bolded = `**${selectedText}**`;

  view.v.dispatch({
    changes: { from: start, to: end, insert: bolded },
    selection: { anchor: start + bolded.length }
  });

  view.v.focus();
}


// ------------------------- Typography buttons functions END -------------------------- //


// New Image Picker modal code
let imagePickerModal = null;
let folderList = null;
let imageList = null;
let currentFolder = '';

async function copyExcalidrawSceneToClipboardFromMystSelection() {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }

  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  const selectedText = state.doc.sliceString(start, end);

  const imgMatch = selectedText.match(/<img[^>]*src="([^"]+)"[^>]*>|!\[[^\]]*\]\(([^)]+)\)/);
  const imgSrc = imgMatch?.[1] || imgMatch?.[2];

  if (!imgSrc) {
    alert("No image selected.");
    return;
  }

  const response = await fetch(imgSrc);
  const imageBlob = await response.blob();

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(imageBlob);
  });

  const fileId = crypto.randomUUID();
  const now = Date.now();

  // Prepare Excalidraw elements
  const elements = [
    {
      id: crypto.randomUUID(),
      type: "image",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      angle: 0,
      fileId,
      status: "saved",
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000000),
      isDeleted: false,
      updated: now,
      scale: [1, 1],
    },
  ];

  // Prepare appState
  const appState = {
    backgroundColor: "#ffffff",
  };

  // Prepare files
  const files = {
    [fileId]: {
      mimeType: imageBlob.type,
      id: fileId,
      dataURL: `data:${imageBlob.type};base64,${base64}`,
      created: now,
    },
  };

  // Create the full scene data
  const sceneData = {
    type: "excalidraw",
    version: 2,
    source: "myst",
    elements,
    appState,
    files
  };

  // Serialize using Excalidraw's recommended method
  const serialized = serializeAsJSON(elements, appState);

  // Create the final clipboard data
  const clipboardData = {
    ...JSON.parse(serialized),
    files  // Include files separately
  };

  await navigator.clipboard.writeText(JSON.stringify(clipboardData));
  alert("Copied image to clipboard as Excalidraw scene!");
}

// Implement the required serialization function
function serializeAsJSON(elements, appState) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "myst",
    elements,
    appState
  });
}

function openImagePicker() {
  // Create modal if it doesn't exist
  if (!imagePickerModal) {
    imagePickerModal = document.createElement('div');
    imagePickerModal.id = 'image-picker-modal';
    imagePickerModal.style = `
      position: fixed;
      top: 10%; left: 10%;
      width: 80%; height: 80%;
      background: #fff;
      border: 1px solid #ccc;
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
      z-index: 9999;
      display: flex;
      flex-direction: row;
      user-select: none;
    `;

    imagePickerModal.innerHTML = `
      <div id="image-picker-folder-list" style="width: 30%; overflow-y: auto; border-right: 1px solid #ccc; padding: 10px; box-sizing: border-box;"></div>
      <div id="image-picker-image-list" style="flex-grow: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px;"></div>
      <button id="image-picker-close" style="width: 28px; padding: 0; margin: 0; position: absolute; top: 8px; right: 12px; font-size: 20px; cursor: pointer; background: transparent; border: none;">✖</button>
    `;

    document.body.appendChild(imagePickerModal);

    folderList = document.getElementById('image-picker-folder-list');
    imageList = document.getElementById('image-picker-image-list');
    const closeBtn = document.getElementById('image-picker-close');

    closeBtn.onclick = () => {
      imagePickerModal.style.display = 'none';
    };
  }

  // Show the modal
  imagePickerModal.style.display = 'flex';

  // Reset to root folder and load images
  currentFolder = '';
  loadImagePickerFolder('');
}

// Insert image markdown into editor
function insertImageMarkdown(path) {
  // const imgSyntax = `![image](/source/${path})`;
  const imgSyntax = path.startsWith('_static') 
? `![image](/_static/${path.split('/').slice(1).join('/')})`
: `![image](${path.split('/').pop()})`;  // For local images next to .md file
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }
  const state = view.v;
  const start = view.v.contentDOM.editContext.selectionStart;
  const end = view.v.contentDOM.editContext.selectionEnd;
  view.v.dispatch({
    changes: { from: start, to: end, insert: imgSyntax },
    selection: { anchor: start + imgSyntax.length }
  });

  view.v.focus();
}


// Render folders and images in the modal
function renderFoldersAndImages(items) {
  if (!folderList || !imageList) return;
  folderList.innerHTML = '';
  imageList.innerHTML = '';
  // Render folders
  items.filter(i => i.type === 'folder').forEach(folderItem => {
    const el = document.createElement('div');
    el.textContent = '📁 ' + folderItem.name;
    el.style.cursor = 'pointer';
    el.style.padding = '4px';
    el.style.userSelect = 'none';
    el.onclick = () => {
      currentFolder = folderItem.path;
      loadImagePickerFolder(folderItem.path);
    };
    folderList.appendChild(el);
  });


  // Render images as thumbnails
  items.filter(i => i.type === 'file').forEach(fileItem => {
    const img = document.createElement('img');
    img.src = `/source/${fileItem.path}`;
    img.style.width = '100px';
    img.style.height = 'fit-content';
    img.style.cursor = 'pointer';
    img.title = fileItem.name;
    img.alt = fileItem.name;
    img.onclick = () => {
      insertImageMarkdown(fileItem.path);
      imagePickerModal.style.display = 'none';
    };
    imageList.appendChild(img);
  });


  // Add "up one folder" button if not root
  if (currentFolder) {
    const upFolder = currentFolder.split('/').slice(0, -1).join('/');
    const upEl = document.createElement('div');
    upEl.textContent = '⬆️ .. (up one folder)';
    upEl.style.cursor = 'pointer';
    upEl.style.padding = '4px';
    upEl.style.userSelect = 'none';
    upEl.style.fontWeight = 'bold';
    upEl.onclick = () => {
      currentFolder = upFolder;
      loadImagePickerFolder(upFolder);
    };
    folderList.prepend(upEl);
  }
}


// Load folder content from server and render
async function loadImagePickerFolder(folder) {
  try {
    const res = await fetch(`/api/images_in_folder?folder=${encodeURIComponent(folder)}`);
    if (!res.ok) {
      alert('Failed to load list of images/folders');
      return;
    }
    const items = await res.json();
    renderFoldersAndImages(items);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}


// ----------------- 'MOVE TO' SECTION START ---------------- // 
// Functions for 'Move to' feature, we can move folders and files in the tree structure. 
// TODO: Make tracing of that file tree changes so we can change all links (maybe button), in all file references


function openMoveToDialog(itemPath) {
  const modal = document.createElement("div");
  modal.style = `
    position: fixed;
    top: 20%; left: 30%;
    width: 40%; height: 50%;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
    z-index: 10000;
    padding: 1rem;
    overflow-y: auto;
  `;

  modal.innerHTML = `<h3>Select folder to move to</h3>
    <div id="move-tree" style="display: block; width:100%; height: 80%;"></div>
    <div style="text-align: right; margin-top: 10px;">
      <button id="move-cancel">❌ Cancel</button>
      <button id="move-ok">✅ OK</button>
    </div>`;

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
      btn.style.cursor = "pointer";
      btn.onclick = () => {
        selectedMovePath = node.path.replace(/\\/g, "/");
        document.querySelectorAll("#move-tree div").forEach(el => el.style.fontWeight = "normal");
        btn.style.fontWeight = "bold";
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
    const name = itemPath.replace(/\\/g, "/").split("/").pop();  // get filename/folder only
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
        currentPath = newPath;
        localStorage.setItem("currentPath", newPath);
      }
      fetchTree();
    }
    modal.remove();
  };

  document.getElementById("move-cancel").onclick = () => {
    modal.remove();
  };
}


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


// ------------- 'MOVE TO' SECTION END --------------- //

  // Create new file
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
      setTimeout(() => loadFile(normalizePath(path)), 500); // Open the new file
    });
  };


  // Create new folder
  document.getElementById("new-folder").onclick = async () => {
    const name = prompt('Enter new folder name (e.g.: newfolder)');
    if (!name) return;
    // If no folder selected, create in root
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
      // Clear active state and reload tree
      clearActiveStates();
      let currentPath = localStorage.getItem('currentPath');
      // If the currently opened file is inside the deleted folder or is the deleted file itself, clear the editor and localStorage
      if (currentPath) {
        if (isFolder && currentPath.startsWith(path + '/')) {
          localStorage.removeItem('currentPath');
          localStorage.removeItem('lastOpened');
          currentPath = '';
          const editor = document.getElementById("myst");
          if (editor) editor.innerHTML = "";
        } else if (!isFolder && currentPath === path) {
          localStorage.removeItem('currentPath');
          localStorage.removeItem('lastOpened');
          currentPath = '';
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

  // Show name without .md extension to user
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
    currentPath = newPath;
    localStorage.setItem("currentPath", newPath);
  }
  fetchTree();
};

  // Load tree and default file on start
  fetchTree();
