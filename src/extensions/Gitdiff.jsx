import { MergeView } from "@codemirror/merge";
import { useRef, useEffect, useContext } from "preact/hooks";
import { CodeEditor } from "../components/CodeMirror";
import { styled } from "styled-components";
import { ExtensionBuilder } from "../extensions";
import { MystState } from "../mystState";
import { useSignalEffect } from "@preact/signals";
import { highlightActiveLine } from "@codemirror/view";

// Layout for diff view
const GitDiffContainer = styled.div`
  display: flex;
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
  display: table;
`;

/**
 * Initialize MergeView.
 *  - "a" = OLDER (red/removed)
 *  - "b" = NEWER (green/added, editable)
 */
const initMergeView = ({ aDoc, bDoc, root, transforms, useReadonlyA = true, useReadonlyB = true }) => {
  const builderA = new ExtensionBuilder().useMarkdown(transforms);
  if (useReadonlyA) builderA.useReadonly();
  const extensionsA = builderA.create();

  const builderB = new ExtensionBuilder().useMarkdown(transforms);
  if (useReadonlyB) builderB.useReadonly();
  const extensionsB = builderB.create();

  extensionsA.push(highlightActiveLine());
  extensionsB.push(highlightActiveLine());

  return new MergeView({
    a: { doc: aDoc, extensions: extensionsA, editable: true },
    b: { doc: bDoc, extensions: extensionsB, editable: true },
    orientation: "a-b",
    root,
  });
};

/** Gitdiff component: shows commit vs commit diff using MergeView */
const Gitdiff = () => {
  const { options, text } = useContext(MystState);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const mergeView = useRef(null);

  useEffect(() => {
    const getEl = (id) => {
      try {
        return options.parent?.getElementById?.(id) ?? document.getElementById(id);
      } catch {
        return document.getElementById(id);
      }
    };

    const getFilename = () => localStorage.getItem("currentPath") || "";
    

    // Parse numeric index from label like "[37]" or "[37*] Commit msg"
    const parseIndexFromOption = (opt) => {
      if (!opt) return 0;
      const m = (opt.textContent || "").match(/\[(\d+)\*?\]/);
      return m ? parseInt(m[1], 10) : 0;
    };

    const reloadGitdiff = async (modeArg) => {
      try {
        const branchLeft = getEl("branchDropdownLeft");
        const commitLeft = getEl("commitDropdownLeft");
        const branchRight = getEl("branchDropdownRight");
        const commitRight = getEl("commitDropdownRight");

        const filename = getFilename();
        // const gitCommitToggle = localStorage.getItem("gitLeftListToggle") || true;
        const gitCommitToggle = localStorage.getItem("gitLeftListToggle") === "true";
        const mode = modeArg || (gitCommitToggle ? "commits" : "local") || "commits";

        if (!filename) {
          console.warn("[Gitdiff] Missing filename — skipping reload.");
          return;
        }

        let aDoc, bDoc, newerSide;

        if (mode === "local") {
          // Compare HEAD vs working tree file
          const headRes = await fetch("/api/git-head");
          const headJson = await headRes.json();
          const headCommit = headJson.head;

          const gitRes = await fetch("/get-file-from-git", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename,
              branch_left: "", // unused
              commit_left: headCommit,
              branch_right: "", // unused
              commit_right: headCommit,
            }),
          });
          const gitJson = await gitRes.json();
          const headContent = gitJson.right_content ?? "// Failed to fetch HEAD";

          let localContent = text.text.value;
          try {
            const localRes = await fetch(`/api/file?path=${encodeURIComponent(filename)}`);
            if (localRes.ok) {
              const localJson = await localRes.json();
              localContent = localJson.content ?? localContent;
            }
          } catch (err) {
            console.warn("[Gitdiff] Failed to fetch local file:", err);
          }

          aDoc = headContent;
          bDoc = localContent;
          newerSide = "right";
        } else {
          // Commits mode
          const leftCommit = commitLeft?.value || "";
          const rightCommit = commitRight?.value || "";
          const leftBranch = branchLeft?.value || "";
          const rightBranch = branchRight?.value || "";

          if (!leftCommit || !rightCommit) {
            console.warn("[Gitdiff] Missing commits — skipping reload.");
            return;
          }

          const res = await fetch("/get-file-from-git", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename,
              branch_left: leftBranch,
              commit_left: leftCommit,
              branch_right: rightBranch,
              commit_right: rightCommit,
            }),
          });

          if (!res.ok) {
            console.error("[Gitdiff] Fetch failed:", res.status, await res.text());
            return;
          }

          const result = await res.json();
          const leftContentFromGit = result.left_content ?? "// Failed left commit";
          const rightContent = result.right_content ?? "// Failed right commit";

          const leftIdx = parseIndexFromOption(commitLeft?.selectedOptions?.[0]);
          const rightIdx = parseIndexFromOption(commitRight?.selectedOptions?.[0]);

          if (leftIdx > rightIdx) {
            aDoc = rightContent;
            bDoc = leftContentFromGit;
            newerSide = "left";
          } else {
            aDoc = leftContentFromGit;
            bDoc = rightContent;
            newerSide = "right";
          }
        }

        // Init MergeView
        mergeView.current?.destroy();
        mergeView.current = initMergeView({
          aDoc,
          bDoc,
          root: options.parent,
          transforms: options.transforms.value,
          useReadonlyA: true,
          useReadonlyB: mode === "local" ? false : true, // local file editable
        });

        if (leftRef.current && rightRef.current) {
          leftRef.current.innerHTML = "";
          rightRef.current.innerHTML = "";
          if (mode === "local"){
              leftRef.current.appendChild(mergeView.current.b.dom);
              rightRef.current.appendChild(mergeView.current.a.dom);
          } else {
            if (newerSide === "left") {
              leftRef.current.appendChild(mergeView.current.b.dom);
              rightRef.current.appendChild(mergeView.current.a.dom);
            } else {
              leftRef.current.appendChild(mergeView.current.a.dom);
              rightRef.current.appendChild(mergeView.current.b.dom);
            }
          }
          
        }
      } catch (err) {
        console.error("[Gitdiff] reload error:", err);
      }
    };



    // Expose for external triggers
    window.reloadGitdiff = reloadGitdiff;

    const dropdowns = [
      getEl("branchDropdownLeft"),
      getEl("commitDropdownLeft"),
      getEl("branchDropdownRight"),
      getEl("commitDropdownRight"),
    ];
    dropdowns.forEach((el) => el?.addEventListener("change", reloadGitdiff));

    reloadGitdiff();

    return () => {
      mergeView.current?.destroy();
      mergeView.current = null;
      delete window.reloadGitdiff;
      dropdowns.forEach((el) => el?.removeEventListener("change", reloadGitdiff));
    };
  }, []);

  // Keep reactive signals in sync (B is the editable/newer side)
  useSignalEffect(() => {
    if (mergeView.current?.b) {
      mergeView.current.b.dispatch({
        changes: { from: 0, to: mergeView.current.b.state.doc.length, insert: text.text.value },
      });
    }
  });

  useSignalEffect(() => {
    if (mergeView.current?.a) {
      mergeView.current.a.dispatch({
        changes: { from: 0, to: mergeView.current.a.state.doc.length, insert: options.initialText.value },
      });
    }
  });

  return (
    <GitDiffContainer>
      <MergeViewCodeEditor className="gitDiffEditor" ref={leftRef} />
      <MergeViewCodeEditor className="gitDiffEditor" ref={rightRef} />
    </GitDiffContainer>
  );
};

Gitdiff.defaultProps = { className: "Gitdiff" };
export default Gitdiff;
