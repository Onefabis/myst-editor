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
    window.reloadGitdiff = async () => {
      try {
        const branchDropdown = document.getElementById("branchDropdown");
        const commitDropdown = document.getElementById("commitDropdown");
        const hiddenInput = document.getElementById("hidden-filename");

        const branch = branchDropdown?.value || "";
        const commit = commitDropdown?.value || "";
        const filename = hiddenInput?.value || "";

        if (!branch || !commit || !filename) {
          console.warn("Missing branch, commit, or filename, skipping Git diff.");
          return;
        }

        // Fetch old content from backend API with current text for context
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

        const result = await response.json();
        const oldContent = result.content || "// Failed to fetch content";

        // Destroy any previous MergeView instance before creating new one
        mergeView.current?.destroy();

        mergeView.current = initMergeView({
          old: oldContent,
          current: text.text.peek(),
          root: options.parent,
          transforms: options.transforms.value,
        });

        // Clear containers and append new MergeView editors
        leftRef.current.innerHTML = "";
        rightRef.current.innerHTML = "";
        leftRef.current.appendChild(mergeView.current.b.dom);
        rightRef.current.appendChild(mergeView.current.a.dom);

      } catch (error) {
        console.error("Failed to reload Git diff:", error);
      }
    };

    // Initial load of the diff view
    window.reloadGitdiff();

    // Cleanup function on unmount
    return () => {
      mergeView.current?.destroy();
      mergeView.current = null;
      delete window.reloadGitdiff;
    };
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
