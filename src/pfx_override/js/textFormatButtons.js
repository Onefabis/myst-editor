import { mystEditorInstance } from "./MainOverride.js";

// Helper to insert H1/H2 style
function _convertLinePrefix(prefix) {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }
  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  const fullText = state.doc.toString();
  // Get the full line
  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = fullText.indexOf('\n', end);
  const actualEnd = lineEnd === -1 ? fullText.length : lineEnd;
  const line = fullText.slice(lineStart, actualEnd);
  const cleaned = line.replace(/^[#*_ \t]+|[#*_ \t]+$/g, '');
  const newLine = prefix + cleaned;
  view.v.dispatch({
    changes: { from: lineStart, to: actualEnd, insert: newLine },
    selection: { anchor: lineStart + newLine.length }
  });
  view.v.focus();
}

export function clearLineSymbols() {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }
  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  const fullText = state.doc.toString();
  // Get the full line
  const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = fullText.indexOf('\n', end);
  const actualEnd = lineEnd === -1 ? fullText.length : lineEnd;
  const line = fullText.slice(lineStart, actualEnd);
  // Remove all leading/trailing symbols and spaces
  const symbolPattern = `[#*_\\s]*`; // greedy match of symbols and whitespace
  const regex = new RegExp(`^${symbolPattern}(.*?)${symbolPattern}$`);
  const match = line.match(regex);
  const cleaned = match ? match[1] : line;
  view.v.dispatch({
    changes: { from: lineStart, to: actualEnd, insert: cleaned },
    selection: { anchor: lineStart + cleaned.length }
  });
  view.v.focus();
}

export function convertToH1() {
  clearLineSymbols();
  _convertLinePrefix('# ');
}

export function convertToH2() {
  clearLineSymbols();
  _convertLinePrefix('## ');
}

export function convertToBold() {
  const view = mystEditorInstance?.editorView;
  if (!view) {
    alert("Editor is not ready yet.");
    return;
  }
  const state = view.v.state;
  const { from: start, to: end } = state.selection.main;
  // Skip if no selection
  if (start === end) {
    alert("Please select text to bold.");
    return;
  }
  const fullText = state.doc.toString();

  const selectedText = fullText.slice(start, end);
  const bolded = `**${selectedText}**`;

  view.v.dispatch({
    changes: { from: start, to: end, insert: bolded },
    selection: { anchor: start + bolded.length }
  });

  view.v.focus();
}
