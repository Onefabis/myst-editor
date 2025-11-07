import { useContext, useEffect, useRef, useState } from "preact/hooks";
import styled from "styled-components";
import { MystState } from "../mystState";
import { EditorView } from "codemirror";
import { useSignalEffect } from "@preact/signals";
import { Compartment } from "@codemirror/state";

const Wrapper = styled.div`
  position: fixed;
  top: 50%;
  right: 25px;
  transform: translateY(-50%);
  width: 17px;
  min-height: 20% !important;
  max-height: 80% !important;
  border-radius: 10px;
  border-left: 0px;
  box-shadow: none;
  overflow: hidden;
  padding: 10px 4px;
  transition: width 0.2s ease, max-height 0.4s ease;
  cursor: pointer;

  &.expanded {
    width: 230px;
    max-height: 96%;
    background-color: var(--panel-bg);
    border-left: 1px solid var(--border);
    box-shadow: 0px 0px 4px var(--box-shadow);
  }

  &.scrollable {
    overflow: auto;
    scrollbar-width: thin;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: var(--border);
    border-radius: 3px;
  }
`;

const HeadingList = styled.div`
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    margin: 0 0 0 3px;
    position: relative;

    &::before {
      content: '';
      display: block;
      position: relative;
      top: 13px;
      height: 2px;
      border-radius: 3px;
      background-color: rgb(145 145 145);
      border: 1px solid rgb(121 121 121);
      width: 100%;
      flex-shrink: 0;
      transition: width 0.2s ease, opacity 0.4s ease;
    }

    span {
      margin-left: 5px;
      white-space: nowrap;
      font-weight: normal;
      font-size: ${(props) => 20 - props.level * 2}px;
      line-height: 1.4;
      cursor: pointer;
      user-select: none;
      max-width: 0;
      overflow: hidden;
      opacity: 0;
      transition: max-width 0.2s ease, opacity 0.4s ease;
    }

    span.active {
      font-weight: bold;
      color: var(--text-strong, #000);
    }

    &:has(> span.active)::before {
      background-color: black;
      border-color: black;
    }
  }

  ${Wrapper}.expanded & li {
    margin: 0 0 0 6px !important;
  }

  ${Wrapper}.expanded & li span {
    max-width: 200px;
    opacity: 1;
  }

  ${Wrapper}.expanded & li::before {
    width: 0;
    opacity: 0;
  }

  ul ul {
    padding-left: 0px;
  }
`;

function Heading({ heading, level = 1, activePos, onClick }) {
  const isActive = activePos === heading.pos;

  return (
    <li level={level}>
      <span
        title="Go to heading"
        data-heading-pos={heading.pos}
        className={isActive ? "active" : ""}
        onClick={(ev) => {
          ev.stopPropagation();
          onClick(ev, heading.pos); // pass known pos explicitly
        }}
      >
        {heading.text}
      </span>
      {heading.children.length > 0 && (
        <ul>
          {heading.children.map((c) => (
            <Heading
              heading={c}
              key={c.pos}
              level={level + 1}
              activePos={activePos}
              onClick={onClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export const TableOfContents = () => {
  const { headings, editorView, options } = useContext(MystState);
  const [expanded, setExpanded] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const [activePos, setActivePos] = useState(null);
  const [manualSelect, setManualSelect] = useState(false);

  const wrapperRef = useRef(null);
  const manualScrollRef = useRef(false);


  const hasHeadings = headings.value.length > 0;

  if (["Gitdiff", "GitCommit", "Preview"].includes(options.mode.value)) {
    return null;
  }

  function handleClick(ev, pos) {
    ev.stopPropagation();

    manualScrollRef.current = true;
    setActivePos(pos);

    editorView.value.dispatch({
      selection: { anchor: pos, head: pos },
      effects: EditorView.scrollIntoView(pos, { y: "start" }),
    });

    // Wait longer than the editor’s scroll animation
    setTimeout(() => {
      manualScrollRef.current = false;
    }, 800);
  }

  useSignalEffect(() => {
    const mystHost = document.getElementById("myst");
    if (!mystHost?.shadowRoot) return;

    // Find the preview container inside the shadow root
    const previewEl = mystHost.shadowRoot.querySelector(".myst-preview");
    if (!previewEl) return;

    const onScroll = () => {
      if (!headings.value?.length) return;

      const previewRect = previewEl.getBoundingClientRect();

      // Flatten nested heading structure into a list
      const flattenHeadings = (nodes, acc = []) => {
        for (const h of nodes) {
          acc.push(h);
          if (h.children?.length) flattenHeadings(h.children, acc);
        }
        return acc;
      };
      const allHeadings = flattenHeadings(headings.value);

      // Find all rendered headings (H1–H6) in preview, in document order
      const headingEls = Array.from(
        previewEl.querySelectorAll("h1, h2, h3, h4, h5, h6")
      );
      if (!headingEls.length) return;

      let current = null;
      let minDelta = Infinity;

      // Iterate through rendered heading elements in order
      for (let i = 0; i < headingEls.length && i < allHeadings.length; i++) {
        const el = headingEls[i];
        const rect = el.getBoundingClientRect();
        const delta = Math.abs(rect.top - previewRect.top);

        if (rect.top >= previewRect.top - 10 && delta < minDelta) {
          current = allHeadings[i];
          minDelta = delta;
        }
      }

      // Fallback to last visible heading if none matched
      if (!current && headingEls.length) {
        const lastVisibleIndex = headingEls.findLastIndex(
          (el) => el.getBoundingClientRect().top < previewRect.bottom
        );
        if (lastVisibleIndex >= 0 && allHeadings[lastVisibleIndex]) {
          current = allHeadings[lastVisibleIndex];
        }
      }

      if (current && !manualScrollRef.current) {
        setActivePos(current.pos);
      }
    };

    previewEl.addEventListener("scroll", onScroll);
    return () => previewEl.removeEventListener("scroll", onScroll);
  });



  // Mark first heading active on initial load when scrolled to top
  useEffect(() => {
    // only run if headings exist and we're at top of editor
    const view = editorView.value;
    if (!view || !headings.value.length) return;

    const scrollParent = view.dom.parentElement;
    const isAtTop = scrollParent.scrollTop === 0;

    if (isAtTop) {
      // Get the first heading in document order (topmost)
      const firstHeading = (() => {
        const flatten = (nodes, acc = []) => {
          for (const h of nodes) {
            acc.push(h);
            if (h.children?.length) flatten(h.children, acc);
          }
          return acc;
        };
        return flatten(headings.value)[0];
      })();

      if (firstHeading) {
        setActivePos(firstHeading.pos);
      }
    }
  }, [headings.value, editorView]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handleTransitionEnd = (e) => {
      if (expanded && (e.propertyName === "width" || e.propertyName === "max-height")) {
        setScrollable(true);
      }
    };

    el.addEventListener("transitionend", handleTransitionEnd);
    return () => el.removeEventListener("transitionend", handleTransitionEnd);
  }, [expanded]);

  return (
    <Wrapper
      ref={wrapperRef}
      onMouseEnter={() => {
        if (hasHeadings) {
          setExpanded(true);
          setScrollable(false);
        }
      }}
      onMouseLeave={() => {
        setExpanded(false);
        setScrollable(false);
      }}
      className={`${expanded ? "expanded" : ""} ${scrollable ? "scrollable" : ""}`}
    >
      <HeadingList>
        <ul>
          {headings.value.map((h) => (
            <Heading
              heading={h}
              key={h.pos}
              activePos={activePos}
              onClick={handleClick}
            />
          ))}
        </ul>
      </HeadingList>
    </Wrapper>
  );
};