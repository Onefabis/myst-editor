import { insertImageMarkdown } from "./MainOverride.js";

let imagePickerModal = null;
let folderList = null;
let imageList = null;
let currentFolder = '';

/**
 * Opens the image picker modal.
 * Creates the modal structure if it doesn’t exist, fetches folder data,
 * and displays images for the selected or initial folder.
 */
export function openImagePicker(startFolder = '') {
  if (!imagePickerModal) {
    imagePickerModal = document.createElement('div');
    imagePickerModal.id = 'image-picker-modal';

    imagePickerModal.innerHTML = `
      <div id="image-picker-folder-list"></div>
      <div id="image-picker-image-list"></div>
      <button id="image-picker-close">✖</button>
    `;

    document.body.appendChild(imagePickerModal);

    folderList = document.getElementById('image-picker-folder-list');
    imageList = document.getElementById('image-picker-image-list');
    const closeBtn = document.getElementById('image-picker-close');
    closeBtn.onclick = () => {
      imagePickerModal.classList.add("hidden");
    };
  }

  imagePickerModal.classList.remove("hidden");
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

/**
 * Renders the folder tree inside the modal.
 * Builds expandable/collapsible nested folders
 * and highlights the active selection.
 */
function renderFolderTree(nodes, parent, selectedPathParts = []) {
  const ul = document.createElement("ul");

  for (const node of nodes) {
    if (node.type !== "folder") continue;

    const li = document.createElement("li");
    const container = document.createElement("div");
    container.className = "folder-container";

    const toggle = document.createElement("span");
    toggle.textContent = "➕";
    toggle.className = "folder-toggle";

    const label = document.createElement("span");
    label.textContent = node.name;
    label.className = "folder-label";
    if (node.path === selectedPathParts.join('/')) {
      label.classList.add("active");
    }

    const subtree = document.createElement("div");
    subtree.className = "picker-subtree";

    // Auto-expand if needed
    const nodeParts = node.path.split('/');
    const shouldAutoExpand =
      selectedPathParts.length >= nodeParts.length &&
      selectedPathParts.slice(0, nodeParts.length).join('/') === node.path;

    if (shouldAutoExpand) {
      subtree.classList.add("expanded");
      toggle.textContent = "➖";
    }

    toggle.onclick = () => {
      subtree.classList.toggle("expanded");
      toggle.textContent = subtree.classList.contains("expanded") ? "➖" : "➕";
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

/**
 * Renders a grid of images inside the modal.
 * Each image is clickable and inserts markdown on selection.
 */
function renderImageList(items) {
  if (!imageList) return;
  imageList.innerHTML = '';
  items.filter(i => i.type === 'file').forEach(fileItem => {
    const img = document.createElement('img');
    img.src = `/_static/${fileItem.path}`;
    img.className = "image-item";
    img.title = fileItem.name;
    img.alt = fileItem.name;
    img.onclick = () => {
      insertImageMarkdown(`_static/${fileItem.path}`);
      imagePickerModal.classList.add("hidden");
    };
    imageList.appendChild(img);
  });
}

/**
 * Loads the contents of a folder from the server.
 * Fetches files and subfolders, then updates the image list display.
 */
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
