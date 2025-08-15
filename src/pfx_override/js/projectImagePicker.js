import { insertImageMarkdown } from "./MainOverride.js";

// New Image Picker modal code
let imagePickerModal = null;
let folderList = null;
let imageList = null;
let currentFolder = '';

export function openImagePicker(startFolder = '') {
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
