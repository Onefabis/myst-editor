import { MergeView } from "@codemirror/merge";
import { useRef, useEffect, useContext } from "preact/hooks";
import { CodeEditor } from "./CodeMirror";
import { styled } from "styled-components";
import { ExtensionBuilder } from "../extensions";
import { MystState } from "../mystState";
import { DefaultButton, Modal } from "./CommonUI";
import { useSignalEffect } from "@preact/signals";

const DiffContainer = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: max-content;
  width: 100%;
  height: 100%;
  scrollbar-width: thin;
  overflow-y: auto;
  overscroll-behavior: contain;
`;

const MergeViewCodeEditor = styled(CodeEditor)`
  overflow-y: visible;
  overscroll-behavior: contain;
  display: block;
`;

const initMergeView = ({ old, current, root, transforms }) => {
  const extensions = new ExtensionBuilder().useReadonly().useMarkdown(transforms).create();
  return new MergeView({
    a: { doc: old, extensions },
    b: { doc: current, extensions },
    orientation: "b-a",
    root,
  });
};

const GitDiff = () => {
  const { options, text } = useContext(MystState);
  const leftRef = useRef();
  const rightRef = useRef();
  const mergeView = useRef();
  const modalRef = useRef();

  useEffect(() => {
  // expose reload function globally
  window.reloadGitDiff = async () => {
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

      // Clean up old view
      mergeView.current?.destroy();
      mergeView.current = initMergeView({
        old: oldContent,
        current: text.text.peek(),
        root: options.parent,
        transforms: options.transforms.value,
      });

      leftRef.current.innerHTML = "";
      rightRef.current.innerHTML = "";
      leftRef.current.appendChild(mergeView.current.b.dom);
      rightRef.current.appendChild(mergeView.current.a.dom);

    } catch (error) {
      console.error("Failed to reload Git diff:", error);
    }
  };

  // Initial load
  window.reloadGitDiff();

  return () => {
    mergeView.current?.destroy();
    mergeView.current = null;
    delete window.reloadGitDiff;
  };
}, []);

    // Sync text changes with diff view
  useSignalEffect(() => {
    mergeView.current?.b?.dispatch?.({ changes: { from: 0, to: mergeView.current?.b?.state?.doc?.length, insert: text.text.value } });
  });
  useSignalEffect(() => {
    mergeView.current?.a?.dispatch?.({ changes: { from: 0, to: mergeView.current?.a?.state?.doc?.length, insert: options.initialText.value } });
  });


  return (
    <>
      <DiffContainer>
        <MergeViewCodeEditor ref={leftRef} />
        <MergeViewCodeEditor ref={rightRef} />
      </DiffContainer>
      <Modal ref={modalRef} title="Discard Changes?">
        <p>Are you sure you want to discard your local changes?</p>
        <DefaultButton
          onClick={() => {
            text.text.value = options.initialText.peek();
            modalRef.current.close();
          }}
        >
          Discard
        </DefaultButton>
        <DefaultButton onClick={() => modalRef.current.close()}>Cancel</DefaultButton>
      </Modal>
    </>
  );
};

GitDiff.defaultProps = { className: "gitDiff" };

export default GitDiff;
