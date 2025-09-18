import { render } from "preact";
import { useEffect, useRef, useMemo, useContext, useState } from "preact/hooks";
import { StyleSheetManager, styled } from "styled-components";
import CodeMirror from "./components/CodeMirror";
import Preview, { PreviewFocusHighlight } from "./components/Preview";
import Diff from "./components/Diff";
import Gitdiff from "./extensions/Gitdiff";
import { EditorTopbar } from "./components/Topbar";
import ResolvedComments from "./components/Resolved";
import { handlePreviewClickToScroll } from "./extensions/syncDualPane";
import { createMystState, MystState, predefinedButtons, defaultButtons, autosaveEnabled } from "./mystState";
import { batch, computed, signal, effect, useSignal, useSignalEffect } from "@preact/signals";
import { MystContainer } from "./styles/MystStyles";
import { syncCheckboxes } from "./markdown/markdownCheckboxes";
import { TableOfContents } from "./components/TableOfContents";
import ErrorModal from "./components/ErrorModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { createLogger, Logger } from "./logger";
import { fetchGitTree } from "./pfx_override/js/leftPanelFileTree.js"



const EditorParent = styled.div`
  font-family: "Lato";
  width: 100%;
  height: 100%;
  ${(props) => props.fullscreen && "position: fixed; left: 0; top: 0; z-index: 10;"}
  ${(props) => {
    switch (props.mode) {
      case "Gitdiff":
        // return ``;
        return "#editor-wrapper { display: none }; #preview-wrapper { display: none }";
      case "Preview":
        return "#editor-wrapper { display: none }";
      case "Source":
        return "#preview-wrapper { display: none }";
      case "Diff":
        return "#editor-wrapper { display: none }; #preview-wrapper { display: none }";
      case "Both":
        return "#resolved-wrapper { display: none }";
      case "Resolved":
        return "#preview-wrapper { display: none };";
      // case "Outline":
      //   return "#preview-wrapper { display: none };";
      case "Inline":
        return "#preview-wrapper { display: none }";
      default:
        return ``;
    }
  }}
`;

const GitPanel = styled.div`
  display: table;
  table-layout: fixed;
  width: 100%;
  padding: 0;
  background-color: var(--panel-bg);
  box-sizing: border-box;
  border-bottom: 1px solid var(--accent-light);
`;

const GitHalf = styled.div`
  display: table-cell;
  vertical-align: middle;
  padding: 0.5rem 0.8rem;
  width: 50%;
  white-space: nowrap;

  /* Only labels used for dropdowns */
  label.git-dropdown-label {
    display: inline-block;
    margin-right: 6px;
    font-weight: 500;
    color: #333;
  }

  select {
    display: inline-block;
    min-width: 120px;
    padding: 4px;
    margin-right: 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
  }

  /* Keep toggle inline and unaffected */
  .toggle-wrapper {
    display: inline-block;
    margin-right: 12px;
    vertical-align: middle;
  }
`;


const ToggleWrapper = styled.label`
`;

const ToggleInput = styled.input`
`;

const Slider = styled.span`
`;

// Git panel elements style END

const MystWrapper = styled.div`
  padding: 20px;
  display: flex;
  box-sizing: border-box;
  height: calc(100% - 60px);
  width: 100%;
  position: relative;
  background-color: var(--panel-bg);
  ${(props) => props.fullscreen && "box-sizing:border-box; height: calc(100vh - 60px);"}
`;

const StatusBanner = styled.div`
  height: 40px;
  position: sticky;
  z-index: 10;
  width: 100%;
  top: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--accent-light);
  font-weight: 600;
`;

/** CSS flexbox takes the content size of elements to determine the layout and ignores padding.
 * This wrapper is here to make sure the padding is added one element deeper and elements are equal width.
 * Ideally we would use CSS Grid but that has some performance issues with CodeMirror on Chromium. */
const FlexWrapper = styled.div`
  flex: 1;
  min-width: 0;
  height: 100%;

  & > * {
    min-height: 500px;
  }
`;

const hideBodyScrollIf = (val) => (document.documentElement.style.overflow = val ? "hidden" : "visible");

const MystEditor = () => {

  const { editorView, cache, options, collab, text, suggestMode } = useContext(MystState);

  // Git panel elements style START
  // Initialize the signal with saved state
  const savedLeft = localStorage.getItem("gitLeftListToggle");

  const [headBranch, setHeadBranch] = useState(null);

  const showLeftCommitList = useSignal(savedLeft === null ? true : savedLeft === "true");
  // track first render to suppress auto-calls
  const firstRender = useRef(true);

  useEffect(() => {
    fetch("/api/git-head")
      .then((res) => res.json())
      .then((data) => {
        if (data.active_branch) {
          setHeadBranch(data.active_branch);
        }
      })
      .catch((err) => console.error("Failed to load HEAD branch", err));
  }, []);


  useSignalEffect(() => {
    localStorage.setItem("gitLeftListToggle", showLeftCommitList.value.toString());

    if (firstRender.current) {
      // skip first change triggered on page load
      firstRender.current = false;
      return;
    }

    // user actually changed the toggle
    if (window.reloadGitdiff) {
      window.reloadGitdiff(showLeftCommitList.value ? "commits" : "local");
    }
    fetchGitTree(showLeftCommitList.value);
  }, [showLeftCommitList]);

  const fullscreen = useSignal(false);
  useSignalEffect(() => hideBodyScrollIf(fullscreen.value));

  const preview = useRef(null);
  useEffect(() => {
    text.preview.value = preview.current;
  }, [preview.current]);

  const alert = useSignal(null);
  const alertFor = (alertText, secs) => {
    alert.value = alertText;
    setTimeout(() => (alert.value = null), secs * 1000);
  };

  const buttonActions = useMemo(
    () => ({
      "copy-html": async () => {
        await text.copy();
        alertFor("copied!", 2);
      },
      fullscreen: () => (fullscreen.value = !fullscreen.peek()),
      refresh: () => {
        cache.transform.clear();
        text.renderText(false);
        alertFor("Rich links refreshed!", 1);
      },
      "suggest-mode": () => (suggestMode.value = !suggestMode.peek()),
    }),
    [],
  );

  const buttons = useMemo(
    () =>
      options.includeButtons.value.map((b) => ({
        ...b,
        action: b.action || buttonActions[b.id],
        visible: b.visible !== false // default true
      })),
    [options.includeButtons.value, buttonActions],
  );

  return (
    <StyleSheetManager target={options.parent}>
      <MystContainer id="myst-css-namespace">
        <ErrorModal />
        <ErrorBoundary>
          <EditorParent mode={options.mode.value} fullscreen={fullscreen.value}>
            {options.topbar.value && <EditorTopbar alert={alert} buttons={buttons} />}
            {options.collaboration.value.enabled && !collab.value.ready.value && (
              <StatusBanner>Connecting to the collaboration server ...</StatusBanner>
            )}
            {options.collaboration.value.enabled && collab.value.lockMsg.value && <StatusBanner>{collab.value.lockMsg}</StatusBanner>}

            {options.mode.value === "Gitdiff" && (
              <GitPanel id="gitPanel">
              <GitHalf>

                <ToggleWrapper className="toggle-wrapper">

                  <ToggleInput className="toggle-input" 
                    type="checkbox"
                    checked={showLeftCommitList.value}
                    onChange={() => {
                      showLeftCommitList.value = !showLeftCommitList.value;
                    }}
                  />
                  <Slider className="toggle-slider" />
                </ToggleWrapper>

                {/* Left dropdowns always exist, toggle visibility */}
                <div className={showLeftCommitList.value ? "showedGitLeftpanel" : "hiddenGitLeftPanel"}>
                  <div className="git-dropdown-group">
                    <label htmlFor="branchDropdownLeft">Branch:</label>
                    <select id="branchDropdownLeft"></select>
                  </div>

                  <div className="git-dropdown-group">
                    <label htmlFor="commitDropdownLeft">Commit:</label>
                    <select id="commitDropdownLeft"></select>
                  </div>
                </div>

                {/* Current file text always exists */}
                <div className={showLeftCommitList.value ? "hiddenGitLeftPanel" : "showedGitLeftpanel"}>
                  <span id="current_file_label">Current file</span>
                </div>
              </GitHalf>

              <GitHalf>
                {/*<div className="git-dropdown-group">*/}
                <div  className={showLeftCommitList.value ? "showedGitLeftpanel" : "hiddenGitLeftPanel"}>
                  <label htmlFor="branchDropdownRight">Branch:</label>
                  <select id="branchDropdownRight"></select>
                </div>

                {/*<div className="git-dropdown-group">*/}
                <div  className={showLeftCommitList.value ? "showedGitLeftpanel" : "hiddenGitLeftPanel"}>
                  <label htmlFor="commitDropdownRight">Commit:</label>
                  <select id="commitDropdownRight"></select>
                </div>

                <div className={showLeftCommitList.value ? "hiddenGitLeftPanel" : "showedGitLeftpanel"}>
                  <span id="current_file_label">
                    HEAD Commit {headBranch ? `Branch: ${headBranch}` : ""}
                  </span>
                  {/*<span id="current_file_label">HEAD Commit</span>*/}
                </div>

              </GitHalf>
            </GitPanel>
            )}

            <MystWrapper className="myst-editor-wrapper" fullscreen={fullscreen.value}>
              {options.mode.value === "Gitdiff" ? (
                <>
                  <FlexWrapper className="flex-wrapper">
                    <Gitdiff />
                  </FlexWrapper>
                  <FlexWrapper id="preview-wrapper" className="flex-wrapper">
                    <Preview
                      className="myst-preview"
                      ref={preview}
                      mode={options.mode.value}
                      onClick={(ev) => {
                        if (options.onPreviewClick.value?.(ev)) return;
                        syncCheckboxes(ev, text.lineMap, editorView.value);
                        if (options.syncScroll.value && options.mode.value == "Both")
                          handlePreviewClickToScroll(ev, text.lineMap, preview, editorView.value);
                      }}
                    >
                      <PreviewFocusHighlight className="cm-previewFocus" />
                    </Preview>
                  </FlexWrapper>
                </>
              ) : (
                <>
                  <FlexWrapper id="editor-wrapper" className="flex-wrapper">
                    <CodeMirror />
                  </FlexWrapper>
                  <FlexWrapper id="preview-wrapper" className="flex-wrapper">
                    <Preview
                      className="myst-preview"
                      ref={preview}
                      mode={options.mode.value}
                      onClick={(ev) => {
                        if (options.onPreviewClick.value?.(ev)) return;
                        syncCheckboxes(ev, text.lineMap, editorView.value);
                        if (options.syncScroll.value && options.mode.value == "Both")
                          handlePreviewClickToScroll(ev, text.lineMap, preview, editorView.value);
                      }}
                    >
                      <PreviewFocusHighlight className="cm-previewFocus" />
                    </Preview>
                  </FlexWrapper>
                </>
              )}

              {options.mode.value === "Diff" && (
                <FlexWrapper className="flex-wrapper">
                  <Diff />
                </FlexWrapper>
              )}

              {options.mode.value == "Resolved" &&
                options.collaboration.value.commentsEnabled &&
                options.collaboration.value.resolvingCommentsEnabled &&
                collab.value.ready.value && (
                  <FlexWrapper id="resolved-wrapper" className="flex-wrapper">
                    <ResolvedComments />
                  </FlexWrapper>
                )}

              
                <FlexWrapper className="flex-wrapper" id="table-of-contents">
                  <TableOfContents />
                </FlexWrapper>
          
            </MystWrapper>

          </EditorParent>
        </ErrorBoundary>
      </MystContainer>
    </StyleSheetManager>
  );
};

export default ({ additionalStyles, id, ...params }, /** @type {HTMLElement} */ target) => {
  if (!target.shadowRoot) {
    target.attachShadow({
      mode: "open",
    });
  }
  if (additionalStyles) {
    target.shadowRoot.adoptedStyleSheets = target.shadowRoot.adoptedStyleSheets.filter((s) => !additionalStyles.includes(s));
    target.shadowRoot.adoptedStyleSheets.push(...(Array.isArray(additionalStyles) ? additionalStyles : [additionalStyles]));
  }
  params.parent = target.shadowRoot;

  const editorId = id ?? crypto.randomUUID();
  if (!window.myst_editor) window.myst_editor = {};
  if (editorId in window.myst_editor) {
    throw `Editor with id ${editorId} is already on the page. Pick a different id, or leave it empty for a random one.`;
  }
  window.myst_editor[editorId] = {};

  const form = target.closest("form");
  if (form) {
    form.addEventListener("formdata", (e) => e.formData.append(params.name, window.myst_editor[editorId].text));
  }

  const state = createMystState({ id: editorId, ...params });
  window.myst_editor[editorId].state = state;
  const logger = createLogger(state);
  window.myst_editor[editorId].logger = logger;

  // cleanup function
  function remove() {
    state.cleanups.forEach((c) => c());
    delete window.myst_editor[editorId];
    render(null, target.shadowRoot);
  }
  window.myst_editor[editorId].remove = remove;
  // runs Preact cleanup logic when target is removed
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (Array.prototype.some.call(mutation.removedNodes, (n) => n == target)) {
        remove();
        observer.disconnect();
      }
    }
  });
  observer.observe(target.parentElement, { childList: true });

  render(
    <MystState.Provider value={state}>
      <Logger.Provider value={logger}>
        <MystEditor />
      </Logger.Provider>
    </MystState.Provider>,
    target.shadowRoot,
  );

  return state;
};

export { autosaveEnabled, defaultButtons, predefinedButtons, batch, computed, signal, effect, MystEditor as MystEditorPreact };
export { default as MystEditorGit } from "./myst-git/MystEditorGit";
export { CollaborationClient } from "./collaboration";
export { darkTheme } from "./styles/MystStyles";
