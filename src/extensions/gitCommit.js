import { MergeView } from "@codemirror/merge";
import { EditorView, basicSetup } from "codemirror";
import {EditorState} from "@codemirror/state"

/**
 * Fetch helper
 */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

export async function logFilePaths() {
  const treeDiv = document.getElementById("tree");
  const filePaths = [];
  if (!treeDiv) return;

  const spans = treeDiv.querySelectorAll("span");
  spans.forEach((span) => {
    const type = span.getAttribute("data-element-type");
    const path = span.getAttribute("data-element-path");
    if (type === "file" && path) filePaths.push(path);
  });

  const mystHost = document.getElementById("myst");
  if (!mystHost || !mystHost.shadowRoot) return;

  const commitWrapper = mystHost.shadowRoot.querySelector("#commit-wrapper");
  if (!commitWrapper) return;
  commitWrapper.innerHTML = "";

  // Store checkboxes globally
  window.gitCommitCheckboxes = [];

  let headCommit = null;
  try {
    const headRes = await fetchJson("/api/git-head");
    headCommit = headRes.head;
  } catch (err) {
    console.error("Failed to fetch HEAD commit:", err);
  }

  for (const path of filePaths) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.minHeight = "auto";
    container.style.marginBottom = "12px";

    // Header
    const titleDiv = document.createElement("div");
    titleDiv.style.cursor = "pointer";
    titleDiv.style.fontWeight = "bold";
    titleDiv.style.padding = "6px";
    titleDiv.style.border = "1px solid rgb(195 195 195)";
    titleDiv.style.borderRadius = "4px 4px 0 0";
    titleDiv.style.background = "rgb(235 235 235)";
    titleDiv.style.display = "flex";
    titleDiv.style.alignItems = "center";
    titleDiv.style.justifyContent = "space-between";

    // Left: arrow + filename
    const leftGroup = document.createElement("div");
    leftGroup.style.display = "flex";
    leftGroup.style.alignItems = "center";

    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("width", "12");
    arrow.setAttribute("height", "12");
    arrow.setAttribute("viewBox", "0 0 24 24");
    arrow.style.marginRight = "6px";
    arrow.style.transition = "transform 0.2s ease";
    const tickPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tickPath.setAttribute("d", "M6 9l6 6 6-6");
    tickPath.setAttribute("stroke", "#555");
    tickPath.setAttribute("stroke-width", "2");
    tickPath.setAttribute("fill", "none");
    tickPath.setAttribute("stroke-linecap", "round");
    tickPath.setAttribute("stroke-linejoin", "round");
    arrow.appendChild(tickPath);

    const textSpan = document.createElement("span");
    textSpan.textContent = path;

    leftGroup.appendChild(arrow);
    leftGroup.appendChild(textSpan);

    // Right: checkbox
    const checkbox = document.createElement("input");
    checkbox.classList.add("commit_file_checkbox");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.style.marginLeft = "8px";
    checkbox.style.accentColor = "#000";
     // style={{
     //            width: "12px",
     //            height: "12px",
     //            margin: "2px 0 0 2px", 
     //            accentColor: "#000",
     //          }}
    checkbox.dataset.path = path;
    window.gitCommitCheckboxes.push(checkbox);

    titleDiv.appendChild(leftGroup);
    titleDiv.appendChild(checkbox);

    // Content (diff)
    const childDiv = document.createElement("div");
    childDiv.style.display = "block";
    childDiv.style.minHeight = "10px";
    childDiv.style.borderRadius = "0 0 4px 4px";
    childDiv.style.border = "1px solid rgb(195 195 195)";
    childDiv.style.borderTop = "none";
    childDiv.style.padding = "5px";

    (async () => {
      let headContent = "";
      let localContent = "";
      try {
        if (headCommit) {
          const gitRes = await fetchJson("/get-file-from-git", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: path,
              branch_left: "",
              commit_left: headCommit,
              branch_right: "",
              commit_right: headCommit,
            }),
          });
          headContent = gitRes.right_content ?? "";
          if (headContent.startsWith("// File not found")) headContent = "";
        }
        const localRes = await fetchJson(`/api/file?path=${encodeURIComponent(path)}`);
        localContent = localRes.content ?? "";
      } catch (err) {
        console.error(err);
      }

      const mergeViewInstance = new MergeView({
        a: { doc: headContent, extensions: [basicSetup, EditorState.readOnly.of(true)], editable: false },
        b: { doc: localContent, extensions: [basicSetup, EditorState.readOnly.of(true)], editable: false },
        orientation: "a-b",
        root: commitWrapper.getRootNode(),
        useReadonlyA: true,
        useReadonlyB: true,
      });

      childDiv.appendChild(mergeViewInstance.dom);
    })();

    titleDiv.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      const isCollapsed = childDiv.style.display === "none";
      childDiv.style.display = isCollapsed ? "block" : "none";
      arrow.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(-90deg)";
      titleDiv.style.borderRadius = isCollapsed ? "4px 4px 0 0" : "4px";
    });

    container.appendChild(titleDiv);
    container.appendChild(childDiv);
    commitWrapper.appendChild(container);
  }
}
