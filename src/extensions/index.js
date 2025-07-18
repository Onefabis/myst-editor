import { lineNumbers, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, keymap } from "@codemirror/view";
import { Compartment, EditorSelection, EditorState, Facet, Prec } from "@codemirror/state";
import { EditorView } from "codemirror";
import { yCollab } from "y-codemirror.next";
import { markdown } from "@codemirror/lang-markdown";
import { indentWithTab, redo, history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import spellcheck from "./spellchecker";
import { commentExtension } from "../comments";
import { commentAuthoring } from "../comments/lineAuthors";
import {
  foldEffect,
  unfoldEffect,
  foldable,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  bracketMatching,
  foldKeymap,
  HighlightStyle,
} from "@codemirror/language";
import { syncPreviewWithCursor } from "./syncDualPane";
import { cursorIndicator } from "./cursorIndicator";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { ySync } from "./collab";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { yamlSchema } from "./yamlSchema";
import { CollaborationClient } from "../collaboration";
import { inlinePreview } from "./inlinePreview";
import { Autolink } from "@lezer/markdown";
import { checkboxParser, colonFencedCodeParser, customTransformsParser, roleParser, tableParser } from "./lezerMarkdownExtensions";
import { trackHeadings } from "./trackHeadings";
import { highlightFocusedActiveLine } from "./activeLineHighlight";
import { classHighlighter, tags } from "@lezer/highlight";
import { loggerFacet } from "../logger";
import { criticHistory, criticMarkup, suggestMode } from "./criticMarkup";

const getRelativeCursorLocation = (view) => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  return { line: line.number, ch: from - line.from };
};

const restoreCursorLocation = (view, location) => {
  if (location == undefined || location.line == undefined || location.ch == undefined) return;
  const lineNum = Math.min(view.state.doc.lines, location.line);
  const line = view.state.doc.line(lineNum);
  const pos = Math.min(view.state.doc.length, line.from + location.ch);
  view.dispatch({
    selection: { anchor: pos, head: pos },
    scrollIntoView: true,
  });
};

export const folded = (update) => update.transactions.some((t) => t.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)));
export const collabClientFacet = Facet.define();

const syntaxHighlight = HighlightStyle.define([
  { tag: [tags.heading, tags.strong], fontWeight: "bold" },
  { tag: [tags.link, tags.url], textDecoration: "underline", color: "var(--accent-dark)" },
  { tag: tags.macroName, color: "var(--accent-dark)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.meta, color: "darkgrey" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "#708" },
  { tag: tags.literal, color: "#164" },
  { tag: tags.string, color: "var(--string-fg)" },
  { tag: tags.deleted, background: "var(--deleted-bg)", textDecoration: "line-through" },
  { tag: tags.inserted, background: "var(--inserted-bg)", textDecoration: "underline" },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: "#e40" },
  { tag: tags.definition(tags.variableName), color: "#00f" },
  { tag: tags.local(tags.variableName), color: "#30a" },
  { tag: [tags.typeName, tags.namespace], color: "#085" },
  { tag: tags.className, color: "#167" },
  { tag: tags.special(tags.variableName), color: "#256" },
  { tag: tags.definition(tags.propertyName), color: "var(--accent-dark)" },
  { tag: tags.comment, color: "var(--string-fg)" },
  { tag: tags.invalid, color: "#f00" },
]);

export const lineNumbersCompartment = new Compartment();

export class ExtensionBuilder {
  constructor(base = []) {
    this.important = [EditorState.lineSeparator.of("\n")];
    this.base = [...base];
    this.extensions = ExtensionBuilder.defaultPlugins();
  }

  static basicSetup() {
    return new ExtensionBuilder([
      foldGutter(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      keymap.of([...historyKeymap, ...searchKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap]),
    ]);
  }

  static codeLanguage(name) {
    if (name == "yaml") {
      return yaml().language;
    }
  }

  static defaultPlugins() {
    return [
      EditorView.lineWrapping,
      highlightSpecialChars(),
      drawSelection(),
      syntaxHighlighting(classHighlighter),
      syntaxHighlighting(syntaxHighlight),
      highlightFocusedActiveLine,
      keymap.of(defaultKeymap),
      keymap.of([indentWithTab, { key: "Mod-Z", run: redo }]),
    ];
  }

  useMarkdown(transforms) {
    const md = markdown({
      codeLanguages: ExtensionBuilder.codeLanguage,
      addKeymap: false,
      extensions: [Autolink, colonFencedCodeParser, checkboxParser, tableParser, roleParser, customTransformsParser(transforms)],
    });
    this.extensions.push(yamlFrontmatter({ content: md.language }), md);
    return this;
  }

  useLineNumbers() {
    this.base.unshift(lineNumbersCompartment.of(lineNumbers()));
    return this;
  }

  disable(keys) {
    this.base.push(Prec.highest(keymap.of(keys.map((key) => ({ key, run: () => true })))));
    return this;
  }

  addUpdateListener(f) {
    this.extensions.push(EditorView.updateListener.of(f));
    return this;
  }

  useSpellcheck(opts) {
    this.extensions.push(spellcheck(opts));
    return this;
  }

  useCompartment(compartment, opts) {
    this.extensions.push(compartment.of(opts));
    return this;
  }

  useComments({ ycomments }) {
    this.important.push(commentExtension(ycomments));
    return this;
  }

  useRemoveSelectionOnBlur() {
    this.extensions.push(
      EditorView.domEventHandlers({
        blur(_, /** @type {EditorView} */ view) {
          const head = view.state.selection.main.head;

          // It is not possible to dispatch a CodeMirror update during an update listener. Putting the dispatch in a setTimeout with timeout ms set to 0 circumvents this.
          setTimeout(() => {
            view.dispatch({
              selection: EditorSelection.create([EditorSelection.range(head, head)]),
            });
          }, 0);
        },
      }),
    );

    return this;
  }

  showCommentLineAuthors(lineAuthors) {
    this.important.push(commentAuthoring(lineAuthors));
    return this;
  }

  useNoSelection() {
    this.extensions.push(EditorView.editable.of(false));
    return this;
  }

  useReadonly() {
    this.extensions.push(EditorState.readOnly.of(true));
    return this;
  }

  useDefaultHistory() {
    this.base.push(history());
    return this;
  }

  useSyncPreviewWithCursor({ text, preview, lastTyped }) {
    this.extensions.push(syncPreviewWithCursor(text, preview, lastTyped));
    return this;
  }

  useCursorIndicator({ text, preview }) {
    this.extensions.push(cursorIndicator(text, preview));
    return this;
  }

  /**
   * @param {{ collabClient: CollaborationClient, editorView: EditorView }}
   */
  useCollaboration({ collabClient, editorView }) {
    const collab = yCollab(collabClient.ytext, collabClient.provider.awareness, { undoManager: collabClient.undoManager });
    collab[1] = ySync;
    this.extensions.push(collab);
    this.extensions.push(collabClientFacet.of(collabClient));

    if (collabClient.undoManager) {
      collabClient.undoManager.on("stack-item-added", (event) => {
        event.stackItem.meta.set("cursor-location", getRelativeCursorLocation(editorView.value));
      });
      collabClient.undoManager.on("stack-item-popped", (event) => {
        restoreCursorLocation(editorView.value, event.stackItem.meta.get("cursor-location"));
      });

      this.extensions.push(
        keymap.of([
          { key: "Mod-z", run: () => collabClient.undoManager.undo(), preventDefault: true },
          { key: "Mod-y", run: () => collabClient.undoManager.redo(), preventDefault: true },
          { key: "Mod-Z", run: () => collabClient.undoManager.redo(), preventDefault: true },
        ]),
      );
    }
    return this;
  }

  // This is added due to a bug with Chrome and Codemirror, where folding a section will sometimes scroll to that section.
  useFixFoldingScroll(focusScroll) {
    this.extensions.push(
      EditorState.transactionFilter.of((tr) => {
        if (tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))) {
          focusScroll.current = window.scrollY;
        }
        return tr;
      }),
      EditorView.updateListener.of((update) => {
        if (!folded(update) || focusScroll.current == null) return;
        window.scrollTo({ top: focusScroll.current });
        focusScroll.current = null;
      }),
    );

    return this;
  }

  /** @param {(b: ExtensionBuilder) => ExtensionBuilder} extender  */
  if(condition, extender) {
    if (condition) {
      return extender(this);
    }
    return this;
  }

  useMoveCursorAfterFold() {
    this.extensions.push(
      EditorState.transactionFilter.of((tr) => {
        if (tr.effects.some((e) => e.is(foldEffect))) {
          const { from, to } = tr.effects[0].value;
          const { head } = tr.startState.selection.main;
          if (head >= from && head <= to) {
            tr.selection = EditorSelection.create([EditorSelection.range(from, from)]);
          }
        }

        return tr;
      }),
      EditorView.updateListener.of((update) => {
        if (!folded(update)) return;
        update.view.focus();
      }),
    );
    return this;
  }

  useYamlSchema(schema, editorView, linter) {
    this.extensions.push(yamlSchema(schema, editorView, linter));
    return this;
  }

  useInlinePreview(text, options, editorView) {
    this.extensions.push(inlinePreview(text, options, editorView));
    return this;
  }

  useTrackHeadings(headings) {
    this.extensions.push(trackHeadings(headings));
    return this;
  }

  useExceptionSink(error) {
    this.extensions.push(
      EditorView.exceptionSink.of((e) => {
        if (error.value) return;
        const err = e instanceof Error ? e : new Error(e.toString());
        console.error(err);
        error.value = { src: "exceptionSink", error: err };
      }),
    );
    return this;
  }

  useLogger(logger) {
    this.extensions.push(loggerFacet.of(logger));
    return this;
  }

  useCmDarkTheme() {
    this.extensions.push(EditorView.darkTheme.of(true));
    return this;
  }

  useCriticMarkup() {
    this.extensions.push([criticMarkup, criticHistory]);
    return this;
  }

  useSuggestMode() {
    this.extensions.push(suggestMode);
    return this;
  }

  create() {
    return [...this.important, ...this.base, ...this.extensions];
  }
}

/** This function folds all top level syntax nodes, while skiping a number of them defined by the `skip` parameter */
export function skipAndFoldAll(/** @type {EditorView} */ view, skip = 0) {
  let { state } = view;
  let effects = [];
  let nProcessedFoldables = 0;
  for (let pos = 0; pos < state.doc.length; ) {
    let line = view.lineBlockAt(pos),
      range = foldable(state, line.from, line.to);
    if (range && nProcessedFoldables >= skip) {
      effects.push(foldEffect.of(range));
    }
    pos = (range ? view.lineBlockAt(range.to) : line).to + 1;
    if (range) nProcessedFoldables++;
  }
  if (effects.length) view.dispatch({ effects });
}
