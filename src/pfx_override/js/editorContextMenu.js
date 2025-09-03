import { mystEditorInstance, insertImageMarkdown } from "./MainOverride.js";
import { showExcalidraw } from "../../extensions/excalidrawExtension.js";
import { showOllamaPopup } from "../../extensions/ollamaAIQuery.js";
import { showAIRephrasePopup } from "../../extensions/aiRephrase.js";
import { showRenamePopup } from "../../extensions/renameImage.js";


const menu = document.createElement("div");
menu.id = "custom-menu";
menu.style.position = "fixed"; // Ensures positioning is relative to the viewport
menu.style.display = "none";   // Hidden by default
menu.innerHTML = `
  <div class="item" id="rename_image">✏️ Rename Image</div>
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

  const isInGitEditor = path.some(el => el.classList?.contains("gitDiffEditor"));

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

  if (isInMystMainEditor && !isInExcalidraw && !isInOllamaAI && !isInAIRephrase && !isInGitEditor) {
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

  showAIRephrasePopup(view, { type: "rephrase" });  // Just pass the view
});

// AI Rephrase settings action
document.getElementById("ai_rephrase_settings").addEventListener("click", () => {
  const view = mystEditorInstance?.editorView;
  if (!view) return alert("Editor not ready");

  showAIRephrasePopup(view, { type: "settings" });
});


// ------------------------- AI Rephrase END --------------------------------- //