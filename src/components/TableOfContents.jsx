import { useContext, useEffect, useRef, useState } from "preact/hooks";
import styled from "styled-components";
import { MystState } from "../mystState";
import { EditorView } from "codemirror";
import { useSignalEffect } from "@preact/signals";

const Wrapper = styled.div`
  position: fixed;
  top: 50%;
  right: 23px;
  transform: translateY(-50%);
  width: 22px; /* collapsed width */
  min-height: 20% !important;
  border-radius: 10px;
  border-left: 0px;
  box-shadow: none;
  overflow: hidden;
  padding: 10px 5px;
  transition: width 0.4s ease, max-height 0.4s ease;
  cursor: pointer;

  &.expanded {
    width: 230px; /* expanded width */
    max-height: 96%;
    background-color: var(--panel-bg);
    border-left: 1px solid var(--border);
    box-shadow: inset 0px 0px 4px var(--box-shadow);
  }

  &.scrollable {
    overflow: auto; /* applied only after transition ends */
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
    margin: 0 0 0 4px;
    position: relative;

    /* Line for collapsed state */
    &::before {
      content: '';
      display: block;
      height: 3px;
      background-color: var(--border);
      width: 100%;
      flex-shrink: 0;
      transition: width 0.4s ease, opacity 0.4s ease;
    }

    span {
      margin-left: 5px;
      white-space: nowrap;
      font-weight: ${(props) => (props.level === 1 ? "bold" : "normal")};
      font-size: ${(props) => 20 - props.level * 2}px;
      line-height: 1.4;
      cursor: pointer;
      user-select: none;
      max-width: 0;
      overflow: hidden;
      opacity: 0;
      transition: max-width 0.4s ease, opacity 0.4s ease;
    }
  }

  /* When expanded, show text and hide line */
  ${Wrapper}.expanded & li span {
    max-width: 200px; /* enough to show text */
    opacity: 1;
  }

  ${Wrapper}.expanded & li::before {
    width: 0;
    opacity: 0;
  }

  ul ul {
    padding-left: 0px; /* nested indentation */
  }
`;

function Heading({ heading, level = 1 }) {
  return (
    <li level={level}>
      <span title="Go to heading" data-heading-pos={heading.pos}>
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
  const { headings, editorView } = useContext(MystState);
  const [expanded, setExpanded] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const wrapperRef = useRef(null);

  const hasHeadings = headings.value.length > 0;

  // useSignalEffect(() => console.log(headings.value));

  function handleClick(ev) {
    const posAttr = ev.target?.dataset?.headingPos;
    if (!posAttr) return;
    const pos = parseInt(posAttr, 10);
    editorView.value.dispatch({
      selection: { anchor: pos, head: pos },
      effects: EditorView.scrollIntoView(pos, { y: "start" }),
    });
  }

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handleTransitionEnd = (e) => {
      if (expanded && (e.propertyName === "width" || e.propertyName === "max-height")) {
        setScrollable(true); // enable scroll after animation finishes
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
