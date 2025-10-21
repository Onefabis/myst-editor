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
      background-color: rgb(59 59 59);
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
    const view = editorView.value;
    if (!view) return;

    const scrollParent = view.dom.parentElement;

    const onScroll = () => {
      if (!view.visibleRanges.length) return;

      // The visible part of the document
      const visible = view.visibleRanges[0];
      const scrollTop = scrollParent.scrollTop;
      const containerTop = scrollParent.getBoundingClientRect().top;

      // Flatten all headings
      const flattenHeadings = (nodes, acc = []) => {
        for (const h of nodes) {
          acc.push(h);
          if (h.children?.length) flattenHeadings(h.children, acc);
        }
        return acc;
      };
      const allHeadings = flattenHeadings(headings.value);

      // Filter headings that fall inside the visible range (rendered)
      const visibleHeadings = allHeadings.filter(
        (h) => h.pos >= visible.from && h.pos <= visible.to
      );

      // Among visible ones, find the one whose top is closest to but >= the scroll container top
      let current = null;
      let minDelta = Infinity;

      for (const h of visibleHeadings) {
        const rect = view.coordsAtPos(h.pos);
        if (!rect) continue;

        const y = rect.top - containerTop + scrollTop; // position inside scroll container
        const delta = Math.abs(y - scrollTop);

        if (y >= scrollTop && delta < minDelta) {
          current = h;
          minDelta = delta;
        }
      }

      // Fallback if none matched (e.g. scrolled beyond last heading)
      if (!current && visibleHeadings.length) {
        current = visibleHeadings[visibleHeadings.length - 1];
      }

      if (current) {
        // console.log("Topmost visible heading:", current.text, current.pos);
        if (!manualScrollRef.current) setActivePos(current.pos);
      }
    };

    scrollParent.addEventListener("scroll", onScroll);
    return () => scrollParent.removeEventListener("scroll", onScroll);
  });

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