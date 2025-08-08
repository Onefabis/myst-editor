import '../css/MainOverrideStyle.css';
import '../css/FuroStyleOverride.css';

import MystEditor, { defaultButtons } from '../../MystEditor.jsx';
import { showExcalidraw } from "../../extensions/excalidrawExtension.js";
import { showOllamaPopup } from "../../extensions/ollamaAIQuery.js";
import { showAIRephrasePopup } from "../../extensions/aiRephrase.js";
import { showRenamePopup } from "../../extensions/renameImage.js";

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
        updateGitPanel(normalizePath(node.path)); 
        setupGitDiffListeners();
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

function setupGitDiffListeners() {
  const branchDropdown = document.getElementById("branchDropdown");
  const commitDropdown = document.getElementById("commitDropdown");

  if (branchDropdown) {
    branchDropdown.addEventListener("change", () => {
      if (window.reloadGitDiff) window.reloadGitDiff();
    });
  }

  if (commitDropdown) {
    commitDropdown.addEventListener("change", () => {
      if (window.reloadGitDiff) window.reloadGitDiff();
    });
  }
}

const fileTree = document.getElementById("tree-panel");
const hor_resizer = document.querySelector(".resizer-vertical");
const gitPanel = document.getElementById("gitPanel");

hor_resizer.onmousedown = function (e) {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = fileTree.offsetHeight;

  document.onmousemove = function (e) {
    const newHeight = startHeight + (e.clientY - startY);
    if (newHeight >= 100) {
      fileTree.style.height = newHeight + 'px';
      localStorage.setItem('fileTreeHeight', newHeight);
    }
  };

  document.onmouseup = function () {
    document.onmousemove = null;
    document.onmouseup = null;
  };
};

function setHiddenFilename(filename) {
  const hiddenInput = document.getElementById('hidden-filename');
  if (hiddenInput) {
    hiddenInput.value = filename;
  }
}

// Restore saved height
const savedHeight = localStorage.getItem('fileTreeHeight');
if (savedHeight) {
  fileTree.style.height = savedHeight + 'px';
}

const branchSelect = document.getElementById('branch-select');
const commitSelect = document.getElementById('commit-select');
const commitDetails = document.getElementById('commit-details');

async function updateGitPanel(filename) {
  const branchDropdown = document.getElementById("branchDropdown");
  const commitDropdown = document.getElementById("commitDropdown");
  const commitDetails = document.getElementById("commitDetails");
  branchDropdown.innerHTML = "";
  commitDropdown.innerHTML = "";
  commitDetails.innerText = "";
  const response = await fetch("/search-file", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename })
  });
  const data = await response.json();
  setHiddenFilename(filename);
  data.branches.forEach(branch => {
    const opt = document.createElement("option");
    opt.value = branch;
    opt.innerText = branch;
    branchDropdown.appendChild(opt);
  });
  data.commits.forEach(commit => {
    const opt = document.createElement("option");
    opt.value = commit.hash;
    opt.innerText = commit.summary || commit.hash;
    opt.dataset.message = commit.message;
    commitDropdown.appendChild(opt);
  });
  commitDropdown.onchange = function () {
    const selected = commitDropdown.options[commitDropdown.selectedIndex];
    commitDetails.innerText = selected.dataset.message || '';
  };
  // Auto-select first
  if (commitDropdown.options.length) {
    commitDropdown.selectedIndex = 0;
    commitDropdown.onchange();
  }
}

let commitsMeta = [];

async function loadCommitTitles(branch, filepath) {
  try {
    const res = await fetch('/search-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filepath })
    });

    const data = await res.json();
    const { commits = [] } = data;

    // Fetch full info per commit hash (you may optimize this backend-side)
    commitsMeta = await Promise.all(commits.map(async hash => {
      try {
        const res = await fetch(`/api/git-commit-info?branch=${branch}&commit=${hash}&filename=${filepath}`);
        const data = await res.json();
        return {
          hash,
          summary: data.summary || hash.slice(0, 7),
          full: data.message || "No message"
        };
      } catch {
        return { hash, summary: hash.slice(0, 7), full: "" };
      }
    }));

    // Update commit dropdown
    commitSelect.innerHTML = '';
    commitsMeta.forEach(commit => {
      const opt = document.createElement('option');
      opt.value = commit.hash;
      opt.textContent = commit.summary;
      commitSelect.appendChild(opt);
    });

    if (commitsMeta.length > 0) {
      commitSelect.value = commitsMeta[0].hash;
      commitDetails.textContent = commitsMeta[0].full;
    }

  } catch (err) {
    console.error("Failed to load commit details:", err);
  }
}

async function loadFile(filename) {
  // ⏳ Save current content if dirty
  if (mystEditorInstance) {
    const currentContent = mystEditorInstance.editorView.v.contentDOM.editContext.text;
    if (currentContent !== lastSavedContent) {
      await saveCurrentEditorContent();
    }
  }

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

  const sheet = new CSSStyleSheet();
  const css = await (await fetch('../FuroStyleOverride.css')).text();
  await sheet.replace(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

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
      includeButtons: defaultButtons.concat([
        {
          text: "💾 Save",
          action: () => {
            saveCurrentEditorContent(true);
          }
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
      // spellcheckOpts: { dict: "en_US", dictionaryPath: `${window.location.pathname}dictionaries` },
      spellcheckOpts: false, 
      syncScroll: true,
    }, newContainer);

    window._mystEditor = mystEditorInstance;
    lastSavedContent = data.content;

    // 💾 Start/restart autosave interval
    if (autosaveInterval) clearInterval(autosaveInterval);
    autosaveInterval = setInterval(() => {
      saveCurrentEditorContent();
    }, 60 * 1000); // 1 min
  });

  localStorage.setItem('lastOpened', filename);
}


let lastSavedContent = '';
let autosaveInterval = null;

async function saveCurrentEditorContent(manual = false) {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    if (manual) alert("Editor is not ready.");
    return;
  }
  const content = view.v.contentDOM.editContext.text;
  try {
    await fetch(`/api/file?path=${encodeURIComponent(currentPath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    lastSavedContent = content;
    if (manual) alert('Saved');
  } catch (err) {
    if (manual) alert("Save failed: " + err.message);
  }
}


// ============================
// Create Upload Modal (styled like Rename modal)
// ============================
function createUploadModal() {
  const modal = document.createElement("div");
  modal.id = "upload-image-modal";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.4)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "2000";
  modal.style.display = "none";

  const content = document.createElement("div");
  content.style.position = "relative";
  content.style.background = "white";
  content.style.padding = "14px";
  content.style.borderRadius = "7px";
  content.style.minWidth = "320px";
  content.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";

  // Close button (circle "x")
  const closeBtn = document.createElement("div");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "-11px";
  closeBtn.style.right = "-11px";
  closeBtn.style.width = "25px";
  closeBtn.style.height = "25px";
  closeBtn.style.background = "rgb(209 29 24)";
  closeBtn.style.color = "white";
  closeBtn.style.borderRadius = "50%";
  closeBtn.style.display = "flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontWeight = "bold";
  closeBtn.style.fontSize = "18px";

  const title = document.createElement("h3");
  title.textContent = "Name Image";
  title.style.margin = "0 0 10px 0";

  const input = document.createElement("input");
  input.type = "text";
  input.style.width = "98%";
  input.style.lineHeight = "22px";
  input.style.margin = "0 0 12px";
  input.style.border = "1px solid rgb(219 209 209)";
  input.style.borderRadius = "3px";
  input.style.outline = "none";

  const actions = document.createElement("div");
  actions.style.display = "grid";
  actions.style.gridTemplateColumns = "1fr 1fr";
  actions.style.gap = "8px";

  const nameBtn = document.createElement("button");
  nameBtn.textContent = "Name";
  nameBtn.style.padding = "6px 8px";
  nameBtn.style.border = "1px dashed rgb(92, 184, 92)";
  nameBtn.style.borderLeft = "3px solid rgb(92, 184, 92)";
  nameBtn.style.borderRadius = "6px";
  nameBtn.style.cursor = "pointer";

  const incrementBtn = document.createElement("button");
  incrementBtn.textContent = "Increment";
  incrementBtn.style.padding = "6px 8px";
  incrementBtn.style.border = "1px dashed rgb(2, 117, 216)";
  incrementBtn.style.borderLeft = "3px solid rgb(2, 117, 216)";
  incrementBtn.style.borderRadius = "6px";
  incrementBtn.style.cursor = "pointer";
  incrementBtn.style.display = "none"; // hidden until collision

  const overwriteBtn = document.createElement("button");
  overwriteBtn.textContent = "Overwrite";
  overwriteBtn.style.padding = "6px 8px";
  overwriteBtn.style.border = "1px dashed rgb(240, 173, 78)";
  overwriteBtn.style.borderLeft = "3px solid rgb(240, 173, 78)";
  overwriteBtn.style.borderRadius = "6px";
  overwriteBtn.style.cursor = "pointer";
  overwriteBtn.style.display = "none"; // hidden until collision

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

const uploadModal = createUploadModal();

// ============================
// Show Upload Modal & Handle Logic
// ============================
function showUploadModal(file, currentPath) {
  return new Promise((resolve) => {
    const dotIndex = file.name.lastIndexOf(".");
    const baseName = dotIndex > -1 ? file.name.substring(0, dotIndex) : file.name;
    const extension = dotIndex > -1 ? file.name.substring(dotIndex) : "";

    uploadModal.input.value = baseName;
    uploadModal.title.textContent = "Name Image";
    uploadModal.nameBtn.style.display = "inline-block";
    uploadModal.overwriteBtn.style.display = "none";
    uploadModal.incrementBtn.style.display = "none";
    uploadModal.modal.style.display = "flex";
    uploadModal.input.focus();

    async function checkCollision(actionType) {
      const newName = uploadModal.input.value.trim() + extension;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);
      formData.append("action", actionType);

      const res = await fetch("/api/upload_image", { method: "POST", body: formData });
      const data = await res.json();

      if (res.status === 409 && data.collision) {
        // Show Overwrite + Increment buttons
        uploadModal.title.textContent = `Image "${uploadModal.input.value.trim()}" already exists`;
        uploadModal.nameBtn.style.display = "none";
        uploadModal.overwriteBtn.style.display = "inline-block";
        uploadModal.incrementBtn.style.display = "inline-block";
      } else if (res.ok) {
        uploadModal.modal.style.display = "none";
        resolve({ action: actionType, savedPath: data.newPath });
      } else {
        alert(data.error || "Upload failed");
      }
    }

    uploadModal.nameBtn.onclick = () => checkCollision("check");
    uploadModal.incrementBtn.onclick = () => checkCollision("increment");
    uploadModal.overwriteBtn.onclick = () => checkCollision("overwrite");
    uploadModal.closeBtn.onclick = () => {
      uploadModal.modal.style.display = "none";
      resolve(null);
    };

    document.onkeydown = (e) => {
      if (e.key === "Enter") uploadModal.nameBtn.click();
      else if (e.key === "Escape") uploadModal.closeBtn.click();
    };
  });
}

// ============================
// Hook into Upload Button
// ============================
document.getElementById("upload-image").onclick = () => { 
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const mdPath = localStorage.getItem("currentPath") || "";
    const segments = mdPath.split("/");
    segments.pop(); // remove .md filename

    let imagePath = segments.join("/");
    if (imagePath.startsWith("/")) imagePath = imagePath.slice(1);

    // Don't add _static here — backend already handles it
    const currentPath = imagePath;

    const result = await showUploadModal(file, currentPath);
    if (result && result.savedPath) {
      insertImageMarkdown(result.savedPath); // already has _static/ once
    }
  };
  input.click();
};



// ------------------------- Typography buttons functions START -------------------------- //

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


// -------------------------- Custom Right Mouse Button menu START --------------------------- //

const menu = document.createElement("div");
menu.id = "custom-menu";
menu.style.position = "fixed"; // Ensures positioning is relative to the viewport
menu.style.display = "none";   // Hidden by default
menu.innerHTML = `
  <div class="item" id="rename_image">✍️ Rename Image</div>
  <div class="item" id="excalidraw_image">🖼️ Excalidraw Image</div>
  <div class="item" style="display: flex; align-items: center; gap: 4px;">
    <button id="ai_rephrase_btn" style="flex: 9; height: 100%;border: 0px;border-right: 1px solid gray; border-radius: 0px; background: none; padding: 0px; text-align: left; font-size: 16px;">🪄 AI Rephrase</button>
    <button id="ai_rephrase_settings" title="Settings" style="flex: 1;background: none;border: none;">⚙️</button>
  </div>
  <div class="item" id="ask_ollama">🤖 Ask Ollama</div>
`;
document.body.appendChild(menu);

document.addEventListener("contextmenu", (e) => {
  const path = e.composedPath();

  const isInMystMainEditor = path.some(el => el.classList?.contains("cm-content"));

  const isInExcalidraw = path.some(el =>
    typeof el.id === "string" && el.id.startsWith("excalidraw")
  );

  const isInOllamaAI = path.some(el =>
    el.classList?.contains("ollama-ai") ||
    typeof el.id === "string" && el.id === "ollama-ai"
  );

  const isInAIRephrase = path.some(el =>
    el.classList?.contains("ollama-ai-rephrase-settings") ||
    typeof el.id === "string" && el.id === "ollama-ai-reprhase-settings"
  );

  if (isInMystMainEditor && !isInExcalidraw && !isInOllamaAI && !isInAIRephrase) {
    e.preventDefault();

    // Show temporarily to measure size
    menu.style.display = "block";
    menu.style.visibility = "hidden"; // Hide visually while measuring
    menu.style.top = "0px";
    menu.style.left = "0px";

    const menuRect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;

    // Check right edge
    if (x + menuRect.width > window.innerWidth) {
      x = window.innerWidth - menuRect.width;
    }

    // Check bottom edge
    if (y + menuRect.height > window.innerHeight) {
      y = window.innerHeight - menuRect.height;
    }

    // Apply corrected position
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.style.visibility = "visible";
  } else {
    menu.style.display = "none";
  }
});

// Hide menu on click
document.addEventListener("click", () => {
  menu.style.display = "none";
});


// ------------------------- Excalidraw image editing START ---------------------------- //

// Edit Image handler
document.getElementById("excalidraw_image").addEventListener("click", async () => {
  const view = mystEditorInstance?.editorView;
  if (!view) return alert("Editor not ready");
  const state = view.v.state;
  const pos = state.selection.main.head;
  const fullText = state.doc.toString();
  const lineStart = fullText.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = fullText.indexOf('\n', pos);
  const actualEnd = lineEnd === -1 ? fullText.length : lineEnd;
  const line = fullText.slice(lineStart, actualEnd);
  const match = line.match(/!\[.*?\]\((.*?)\)/);

  if (match) {
    showExcalidraw(match[1], view);
    return;
  }

  // No image found - ask for name and create image
  const rawName = prompt("No image found.\nEnter name for new Excalidraw image (without extension):");
  if (!rawName) return;

  const nameBase = rawName.trim().replace(/\s+/g, '_');
  if (!nameBase) return;

  const mdPath = (localStorage.getItem("currentPath") || "").toString();
  const mdParts = mdPath.replace(/\\/g, "/").split("/").slice(0, -1);

  const targetFolder = `_static/${mdParts.join("/")}`;
  const filename = `${nameBase}.png`;

  // Request empty file creation and backend handles incrementing
  const formData = new FormData();

  const emptyFile = new Blob([], { type: "image/png" });
  formData.append("file", emptyFile, filename);
  formData.append("path", mdPath);

  try {
    const res = await fetch("/api/upload_image", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text();
      alert("Failed to create image: " + errText);
      return;
    }

    const result = await res.json();
    console.log("📦 Backend response:", result);

    let savedPath = result.savedPath || result.newPath;

    // Strip `.md/` from the path if present
    if (savedPath) {
      const pathParts = savedPath.split("/");
      const mdIndex = pathParts.findIndex(p => p.endsWith(".md"));
      if (mdIndex !== -1) {
        pathParts.splice(mdIndex, 1);
        savedPath = pathParts.join("/");
        console.log("🧼 Cleaned path:", savedPath);
      }
    }

    if (!savedPath || typeof savedPath !== "string") {
      alert("Image creation failed: Invalid path returned by server.");
      return;
    }

    insertImageMarkdown(savedPath);
    showExcalidraw(savedPath, view);

  } catch (err) {
    alert("Image creation failed: " + err.message);
  }
});

// ------------------------- Excalidraw image editing END --------------------- //

// ------------------------- Ollama AI window START --------------------------- //

document.getElementById("ask_ollama").addEventListener("click", () => {
  const view = mystEditorInstance?.editorView;
  if (!view) return alert("Editor not ready");
  showOllamaPopup(view);
});

// ------------------------- Ollama AI window END ---------------------------- //

// ------------------------- Rename Image START ------------------------------ //

document.getElementById("rename_image").addEventListener("click", () => {
  const view = mystEditorInstance?.editorView;
  if (!view) return alert("Editor not ready");
  showRenamePopup(view);
});

// ------------------------- Rename Image END -------------------------------- //

// ------------------------- AI Rephrase START ------------------------------- //

// AI Rephrase main action
document.getElementById("ai_rephrase_btn").addEventListener("click", () => {
  const view = mystEditorInstance?.editorView;
  if (!view) return alert("Editor not ready");

  const sel = view.v.state.selection.main;
  if (sel.empty) {
    alert("Please select some text first.");
    return;
  }

  showAIRephrasePopup(view, { type: "rephrase", from: sel.from, to: sel.to });
});

// AI Rephrase settings action
document.getElementById("ai_rephrase_settings").addEventListener("click", () => {
  const view = mystEditorInstance?.editorView;
  if (!view) return alert("Editor not ready");

  showAIRephrasePopup(view, { type: "settings" });
});


// ------------------------- AI Rephrase END --------------------------------- //

// ------------------- Custom Right Mouse Button menu END -------------------- //

// New Image Picker modal code
let imagePickerModal = null;
let folderList = null;
let imageList = null;
let currentFolder = '';

function openImagePicker(startFolder = '') {
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
  currentFolder = startFolder;
  loadImagePickerFolder(currentFolder);
  const selectedParts = startFolder ? startFolder.split('/') : [];
  fetch('/api/image_tree')
    .then(res => res.json())
    .then(data => {
      folderList.innerHTML = '';
      renderFolderTree(data, folderList, selectedParts);
    });
}

// Insert image markdown into editor
function insertImageMarkdown(path) {
  // Extract filename from path (after last slash)
  const filename = path.split("/").pop() || "";
  // Remove file extension from filename
  const dotIndex = filename.lastIndexOf(".");
  const altText = dotIndex > -1 ? filename.substring(0, dotIndex) : filename;
  const imgSyntax = `![${altText}](/${path})`;
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
function renderFolderTree(nodes, parent, selectedPathParts = []) {
  const ul = document.createElement("ul");

  for (const node of nodes) {
    if (node.type !== "folder") continue;

    const li = document.createElement("li");
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";

    const toggle = document.createElement("span");
    toggle.textContent = "➕";
    toggle.style.cursor = "pointer";
    toggle.style.width = "20px";

    const label = document.createElement("span");
    label.textContent = node.name;
    label.style.cursor = "pointer";
    label.style.userSelect = "none";
    label.style.padding = "2px 4px";

    if (node.path === selectedPathParts.join('/')) {
      label.style.fontWeight = "bold";
    }

    const subtree = document.createElement("div");
    subtree.style.marginLeft = "16px";
    subtree.style.display = "none";

    // Expand only matching selectedPathParts
    const nodeParts = node.path.split('/');
    const shouldAutoExpand = selectedPathParts.length >= nodeParts.length &&
                             selectedPathParts.slice(0, nodeParts.length).join('/') === node.path;

    if (shouldAutoExpand) {
      subtree.style.display = "block";
      toggle.textContent = "➖";
    }

    toggle.onclick = () => {
      if (subtree.style.display === "none") {
        subtree.style.display = "block";
        toggle.textContent = "➖";
      } else {
        subtree.style.display = "none";
        toggle.textContent = "➕";
      }
    };

    label.onclick = () => {
      currentFolder = node.path;
      loadImagePickerFolder(currentFolder);
      fetch('/api/image_tree')
        .then(res => res.json())
        .then(data => {
          folderList.innerHTML = '';
          renderFolderTree(data, folderList, node.path.split('/'));
        });
    };

    container.appendChild(toggle);
    container.appendChild(label);
    li.appendChild(container);

    if (node.children && node.children.length > 0) {
      renderFolderTree(node.children, subtree, selectedPathParts);
    }

    li.appendChild(subtree);
    ul.appendChild(li);
  }
  parent.appendChild(ul);
}

function renderImageList(items) {
  if (!imageList) return;
  imageList.innerHTML = '';
  items.filter(i => i.type === 'file').forEach(fileItem => {
    const img = document.createElement('img');
    img.src = `/_static/${fileItem.path}`;
    img.style.width = '100px';
    img.style.height = 'fit-content';
    img.style.cursor = 'pointer';
    img.title = fileItem.name;
    img.alt = fileItem.name;
    img.onclick = () => {
      insertImageMarkdown(`_static/${fileItem.path}`);
      imagePickerModal.style.display = 'none';
    };
    imageList.appendChild(img);
  });
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
    renderImageList(items);
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
  console.log(oldPath);
  console.log(newPath);
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
