import { linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { WorkerLinter, binary } from "harper.js/dist/harper.js";

export const harperExtension = (() => {
  const harperLinter = new WorkerLinter({ binary });

  const getValidSpan = d => {
    const span = d.span();
    return [span.start, span.end];
  };

  const severityMap = {
    Grammar: "error",
    Punctuation: "error",
    Spelling: "error",
    Typo: "error",
    Usage: "error",
    Capitalization: "warning",
    Formatting: "warning",
    Style: "warning",
    Enhancement: "info",
    Readability: "info",
    WordChoice: "info",
    Agreement: "hint",
    Redundancy: "hint",
    Repetition: "hint",
    Eggcorn: "hint",
    Miscellaneous: "hint",
    BoundaryError: "hint",
    Malapropism: "hint",
    Nonstandard: "hint",
    Regionalism: "hint",
  };

  const getSeverityForLintKind = kind => severityMap[kind] || "error";

  const addHarperStyle = (root) => {
    if (!root || root.querySelector("#harper-underline-style")) return;
    const style = document.createElement("style");
    style.id = "harper-underline-style";
    style.textContent = `
      .cm-lintRange-error { background-image: none !important; text-decoration: underline solid #e94f4f 1.5px !important; }
      .cm-lintRange-warning { background-image: none !important; text-decoration: underline solid #f6a631 1.5px !important; }
      .cm-lintRange-info { background-image: none !important; text-decoration: underline solid #2c7bfc 1.5px !important; }
      .cm-lintRange-hint { background-image: none !important; text-decoration: underline solid #6c757d 1.5px !important; }
      .cm-diagnostic-hint, .cm-diagnostic-info, .cm-diagnostic-warning, .cm-diagnostic-error { border-radius: 5px !important; }

      .cm-tooltip {
  border: 1px solid rgb(187, 187, 187)!important;
  border-radius: 9px !important;
  box-shadow: 0px 0px 11px #7f7f7f !important;
  background-color: rgb(255 255 255) !important;
  white-space: normal; /* allow wrapping inside */
}

.cm-harper-suggestions-container {
  display: block;
    gap: 4px;
    margin-top: 4px !important;
    width: 100%;
}

.cm-harper-suggestion-btn {
      flex: 1 1 auto;
    margin: 2px;
    padding: 3px;
    border: 1px dotted;
    background: white !important;
    border-radius: 5px;
 
}

      .cm-harper-suggestion-btn:hover { background: #ddd; }
    `;
    root.appendChild(style);
  };

  const harperLint = async view => {
    const shadowRoot = view.dom.getRootNode();
    if (shadowRoot instanceof ShadowRoot) {
      addHarperStyle(shadowRoot);
    } else {
      addHarperStyle(document.head); // fallback
    }
    const text = view.state.doc.toString();
    if (!text.trim()) return [];

    try {
      await harperLinter.setLintConfig({
        SpellCheck: true,
        ForNoun: true,
        ExplanationMarks: true,
      });

      const results = await harperLinter.lint(text, "plaintext");

      const diagnostics = results.map(d => {
        let span = null;

        for (const sug of d.suggestions()) {
          const rs = sug.replace_span?.();
          if (Array.isArray(rs) && rs.length === 2 && rs[0] >= 0 && rs[1] > rs[0] && rs[1] <= text.length) {
            span = rs;
            break;
          }
        }

        if (!span) span = getValidSpan(d);
        if (!span) return null;

        const message = d.message();
        const severity = getSeverityForLintKind(d.lint_kind());

        const suggestions = d.suggestions().map(sug => ({
          kind: sug.kind(),
          text: sug.get_replacement_text(),
          replaceSpan: (() => {
            const rs = sug.replace_span?.();
            return Array.isArray(rs) && rs.length === 2 ? rs : null;
          })(),
        })).filter(s => s.text);

        return {
          from: span[0],
          to: span[1],
          severity,
          message,
          renderMessage(view) {
            const dom = document.createElement("div");
            dom.textContent = message;

            if (suggestions.length) {
              const suggestionContainer = document.createElement("div");
              suggestionContainer.className = "cm-harper-suggestions-container";

              suggestions.forEach(({ kind, text, replaceSpan }) => {
                const btn = document.createElement("button");
                btn.className = "cm-harper-suggestion-btn";

                switch (kind) {
                  case 1:
                    btn.textContent = `Remove "${view.state.doc.sliceString(
                      replaceSpan?.[0] ?? span[0],
                      replaceSpan?.[1] ?? span[1]
                    )}"`;
                    break;
                  case 2:
                    btn.textContent = `Insert "${text}" after`;
                    break;
                  default:
                    btn.textContent = `Replace with "${text}"`;
                }

                btn.addEventListener("click", () => {
                  const from = replaceSpan?.[0] ?? span[0];
                  const to = replaceSpan?.[1] ?? span[1];

                  if (to > from && to <= view.state.doc.length) {
                    const changes = (() => {
                      switch (kind) {
                        case 1: return { from, to, insert: "" };
                        case 2: return { from: to, to, insert: text };
                        default: return { from, to, insert: text };
                      }
                    })();
                    view.dispatch({ changes, effects: EditorView.scrollIntoView(from) });
                  }
                });

                suggestionContainer.appendChild(btn);
              });

              dom.appendChild(suggestionContainer);
            }

            return dom;
          },
        };
      });

      return diagnostics.filter(d => d && d.from >= 0 && d.to > d.from && d.to <= text.length);
    } catch (err) {
      console.error("[Harper] Lint error:", err);
      return [];
    }
  };

  return [linter(harperLint, { delay: 700 })];
})();
