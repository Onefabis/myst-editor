import { fetchLocalTree, activeFolderPath, normalizePath, ignoredFolders, clearActiveStates, treeState } from "./leftPanelFileTree";
import { loadFile, mystEditorInstance } from "./MainOverride";
import { runGitAction } from "./commitCurentStateUI";
import { showModal, showInputModal } from "./modalWindows"

const CONFIG = {
  ignoredFolders: ["_static", "_templates", ".obsidian"],
};


// Insert image markdown into editor
export function insertImageMarkdown(path) {
  const filename = path.split("/").pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  const altText = dotIndex > -1 ? filename.substring(0, dotIndex) : filename;
  const imgSyntax = `![${altText}](/${path})`;
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }
  // console.log(view);
  const { state } = view.v;
  const { from, to } = state.selection.main; // selection range
   view.v.dispatch({
    changes: { from, to, insert: imgSyntax },
    selection: { anchor: from + imgSyntax.length } // cursor after insert
  });

  view.v.focus();
}

// ----------------------- Toolbar Button Actions START ----------------------- //

document.getElementById("new-file").onclick = async () => {
  const selectedElement = treeState.getSelectedElement();
  let targetFolder = '';

  if (selectedElement && selectedElement.type === 'folder') {
    targetFolder = selectedElement.path;
  } else if (activeFolderPath) {
    targetFolder = activeFolderPath;
  }

  // Use the existing showInputModal for consistent styling
  const name = await showInputModal("New File", "Enter file name (without .md)");
  if (!name) return;

  const fullName = name.endsWith('.md') ? name : `${name}.md`;
  const path = targetFolder ? `${targetFolder}/${fullName}` : fullName;

  try {
    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'file' }),
    });

    if (!res.ok) {
      const errText = await res.text();
      showModal("Error", `Failed to create file: ${errText}`, { isError: true });
      return;
    }

    fetchLocalTree();
    setTimeout(() => loadFile(normalizePath(path)), 500);
  } catch (err) {
    showModal("Error", `Failed to create file: ${err.message}`, { isError: true });
  }
};

document.getElementById("new-folder").onclick = async () => {
  const selectedElement = treeState.getSelectedElement();
  let targetFolder = '';

  if (selectedElement && selectedElement.type === 'folder') {
    targetFolder = selectedElement.path;
  } else if (activeFolderPath) {
    targetFolder = activeFolderPath;
  }

  // Use showInputModal for folder creation
  const name = await showInputModal("New Folder", "Enter folder name (e.g. new-folder)");
  if (!name) return;

  const path = targetFolder ? `${targetFolder}/${name}` : name;

  try {
    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'folder' }),
    });

    if (!res.ok) {
      const errText = await res.text();
      showModal("Error", `Failed to create folder: ${errText}`, { isError: true });
      return;
    }

    fetchLocalTree();
  } catch (err) {
    showModal("Error", `Failed to create folder: ${err.message}`, { isError: true });
  }
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