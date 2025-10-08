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

function Heading({ heading, level = 1 }) {
  return (
    <li level={level}>
      <span
        title="Go to heading"
        data-heading-pos={heading.pos}
      >
        {heading.text}
      </span>
      {heading.children.length > 0 && (
        <ul>
          {heading.children.map((c) => (
            <Heading heading={c} key={c.pos} level={level + 1} />
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
  const wrapperRef = useRef(null);

  const hasHeadings = headings.value.length > 0;

  if (["Gitdiff", "GitCommit", "Preview"].includes(options.mode.value)) {
    return null;
  }

  function handleClick(ev) {
    const posAttr = ev.target?.dataset?.headingPos;
    if (!posAttr) return;
    const pos = parseInt(posAttr, 10);
    editorView.value.dispatch({
      selection: { anchor: pos, head: pos },
      effects: EditorView.scrollIntoView(pos, { y: "start" }),
    });
  }

  useSignalEffect(() => {
    const view = editorView.value;
    if (!view) return;

    const scrollParent = view.dom.parentElement;

    const onScroll = () => {
      const visible = view.visibleRanges;
      if (!visible.length) return;

      const topFrom = visible[0].from; // first visible char in viewport

      // Flatten headings (including children) into one list
      const flattenHeadings = (nodes, acc = []) => {
        for (const h of nodes) {
          acc.push(h);
          if (h.children?.length) flattenHeadings(h.children, acc);
        }
        return acc;
      };
      const allHeadings = flattenHeadings(headings.value);

      // Find the heading with the largest pos <= topFrom
      let current = null;
      for (const h of allHeadings) {
        if (h.pos <= topFrom) {
          if (!current || h.pos > current.pos) {
            current = h;
          }
        }
      }

      if (current) {
        console.log("Topmost visible heading:", current.text, current.pos);
        setActivePos(current.pos);
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
      onClick={handleClick}
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
            <Heading heading={h} key={h.pos} />
          ))}
        </ul>
      </HeadingList>
    </Wrapper>
  );
};