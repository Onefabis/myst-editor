import { MergeView } from "@codemirror/merge"; 
import { useRef, useEffect, useContext } from "preact/hooks";
import { CodeEditor } from "../components/CodeMirror";
import { styled } from "styled-components";
import { ExtensionBuilder } from "../extensions";
import { MystState } from "../mystState";
import { DefaultButton, Modal } from "../components/CommonUI";
import { useSignalEffect } from "@preact/signals";


const GitDiffContainer = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: max-content;
  width: 100%;
  height: 100%;
  scrollbar-width: thin;
  overflow-y: auto;
  overscroll-behavior: contain;`
;

const MergeViewCodeEditor = styled(CodeEditor)`
  overflow-y: visible;
  overscroll-behavior: contain;
  display: block;`
;


/* Initializes and returns a new MergeView instance. 
Configures git commit document as readonly and latest current document as editable, with markdown and transforms extensions. */
const initMergeView = ({ old, current, root, transforms }) => {
  const extensionsOld = new ExtensionBuilder()
    .useReadonly()
    .useMarkdown(transforms)
    .create();

  const extensionsCurrent = new ExtensionBuilder()
    .useMarkdown(transforms)
    .create();

  return new MergeView({
    a: { doc: old, extensions: extensionsOld },
    b: { doc: current, extensions: extensionsCurrent, allowEdit: true },
    orientation: "b-a",
    root,
  });
};

/* React component displaying a Git-style diff view with side-by-side
editors for commit and latest current file versions. Handles syncing, fetching, and reloading diffs from the backend API */
const Gitdiff = () => {
  const { options, text } = useContext(MystState); // Shared state context
  const leftRef = useRef();   // Ref to left editor container
  const rightRef = useRef();  // Ref to right editor container
  const mergeView = useRef(); // Ref to MergeView instance

  /* This fetches file content from git backend and initializes the MergeView. Also cleans up on unmount */
  useEffect(() => {
    // helper to get element inside editor's shadow root (fallback to document)
    const getEl = (id) => {
      try {
        return options.parent?.getElementById?.(id) ?? document.getElementById(id);
      } catch (e) {
        return document.getElementById(id);
      }
    };

    // read filename from a hidden input (same shadow root)
    const getFilename = () => {
      const hidden = getEl("hidden-filename");
      return hidden?.value || "";
    };

    // the actual reload function (reads branch/commit from shadow root)
    window.reloadGitdiff = async () => {
      try {
        const branchDropdown = getEl("branchDropdownRight");
        const commitDropdown = getEl("commitDropdownRight");

        const branch = branchDropdown?.value || "";
        const commit = commitDropdown?.value || "";
        const filename = getFilename();

        console.log("git diff extension run — branch:", branch, "commit:", commit, "file:", filename);

        if (!branch || !commit || !filename) {
          console.warn("Missing branch, commit or filename — skipping Git diff reload.");
          return;
        }

        const response = await fetch("/get-file-from-git", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename,
            branch,
            commit,
            current_text: text.text.peek(),
          }),
        });

        if (!response.ok) {
          console.error("Failed to fetch file from git:", response.status, await response.text());
          return;
        }

        const result = await response.json();
        const oldContent = result.content ?? "// Failed to fetch content";

        // destroy previous MergeView if present
        mergeView.current?.destroy();

        mergeView.current = initMergeView({
          old: oldContent,
          current: text.text.peek(),
          root: options.parent, // keep using editor's root/transforms
          transforms: options.transforms.value,
        });

        // Ensure left/right refs exist
        if (!leftRef.current || !rightRef.current) {
          console.warn("Left/right containers not ready yet");
          return;
        }

        // Clear containers and append new MergeView editors
        leftRef.current.innerHTML = "";
        rightRef.current.innerHTML = "";
        // mergeView.current.a is left (old), b is right (current) — you used b/a previously, keep consistent
        leftRef.current.appendChild(mergeView.current.b.dom);
        rightRef.current.appendChild(mergeView.current.a.dom);

      } catch (error) {
        console.error("Failed to reload Git diff:", error);
      }
    };

    // find branch/commit selects in shadow root and attach change listeners to trigger reload
    const branchR = getEl("branchDropdownRight");
    const commitR = getEl("commitDropdownRight");

    const onChangeTrigger = () => {
      if (typeof window.reloadGitdiff === "function") window.reloadGitdiff();
    };

    if (branchR) branchR.addEventListener("change", onChangeTrigger);
    if (commitR) commitR.addEventListener("change", onChangeTrigger);

    // Call it once on mount to try load initial state
    window.reloadGitdiff();

    // Cleanup
    return () => {
      mergeView.current?.destroy();
      mergeView.current = null;
      delete window.reloadGitdiff;
      if (branchR) branchR.removeEventListener("change", onChangeTrigger);
      if (commitR) commitR.removeEventListener("change", onChangeTrigger);
    };
    // NOTE: we intentionally run this effect once on mount so keep deps empty
  }, []);


  /* Sync current text changes to right side editor document. Uses signals for reactive updates. */
  useSignalEffect(() => { mergeView.current?.b?.dispatch?.({ changes: { from: 0, to: mergeView.current?.b?.state?.doc?.length, insert: text.text.value, }, }); });

  /* Sync initial text changes to left side editor document. Uses signals for reactive updates. */
  useSignalEffect(() => { mergeView.current?.a?.dispatch?.({ changes: { from: 0, to: mergeView.current?.a?.state?.doc?.length, insert: options.initialText.value, }, }); });

  // Render the diff UI and discard changes modal dialog
  return (
    <>
      <GitDiffContainer>
        <MergeViewCodeEditor ref={leftRef} />
        <MergeViewCodeEditor ref={rightRef} />
      </GitDiffContainer>
    </>
  );
};

Gitdiff.defaultProps = { className: "Gitdiff" };

export default Gitdiff;
