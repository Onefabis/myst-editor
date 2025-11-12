import { MergeView } from "@codemirror/merge";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { highlightFocusedActiveLine } from "./activeLineHighlight";
import { MystState } from "../mystState";
import { ExtensionBuilder } from "../extensions";

/**
 * SVG Icons (return DOM elements)
 */
const CollapseMergeViewIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M7.41 18.59L8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z"
  );
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
};

const ExpandMergeViewIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"
  );
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
};

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
    container.className = "commit-file-container";
    // Header
    const titleDiv = document.createElement("div");
    titleDiv.className = "commit-file-header";
    // Left: arrow + filename
    const leftGroup = document.createElement("div");
    leftGroup.className = "commit-file-header-left";
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.classList.add("commit-file-arrow");
    arrow.setAttribute("width", "12");
    arrow.setAttribute("height", "12");
    arrow.setAttribute("viewBox", "0 0 24 24");
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

    // Right: collapse icon + checkbox
    const rightGroup = document.createElement("div");
    rightGroup.className = "commit-file-header-right";
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "collapse-btn";
    collapseBtn.appendChild(CollapseMergeViewIcon());
    collapseBtn.title = "Collapse identical lines";
    const checkbox = document.createElement("input");
    checkbox.classList.add("commit_file_checkbox");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.path = path;
    window.gitCommitCheckboxes.push(checkbox);
    rightGroup.appendChild(collapseBtn);
    rightGroup.appendChild(checkbox);
    titleDiv.appendChild(leftGroup);
    titleDiv.appendChild(rightGroup);

    // Diff area
    const childDiv = document.createElement("div");
    childDiv.className = "commit-file-diff";

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
      let isCollapsed = true;
      const builder = ExtensionBuilder.basicSetup(); // returns an ExtensionBuilder instance
      let extensions = builder.create().filter(
        ext => ext !== highlightFocusedActiveLine
      );
      // Now you can add readOnly / editable as needed
      extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
      function buildMergeView() {
        childDiv.innerHTML = "";
        const mv = new MergeView({
          a: { doc: headContent, extensions: extensions },
          b: { doc: localContent, extensions: extensions },
          orientation: "b-a",
          collapseUnchanged: isCollapsed ? { margin: 3, minSize: 4 } : null,
          root: commitWrapper.getRootNode(),
          useReadonlyA: true,
          useReadonlyB: true,
        });
        childDiv.appendChild(mv.dom);
        return mv;
      }

      let mergeViewInstance = buildMergeView();
      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isCollapsed = !isCollapsed;
        collapseBtn.innerHTML = "";
        collapseBtn.appendChild(isCollapsed ? CollapseMergeViewIcon() : ExpandMergeViewIcon());
        collapseBtn.title = isCollapsed ? "Collapse identical lines" : "Expand identical lines";
        // destroy and rebuild to apply collapse state
        mergeViewInstance?.destroy();
        mergeViewInstance = buildMergeView();
      });
    })();

    titleDiv.addEventListener("click", (e) => {
      if (e.composedPath().includes(checkbox)) return;
      const hidden = childDiv.classList.toggle("hidden");
      arrow.classList.toggle("collapsed", hidden);
      titleDiv.classList.toggle("collapsed", hidden);
    });

    container.appendChild(titleDiv);
    container.appendChild(childDiv);
    commitWrapper.appendChild(container);
  }
}
