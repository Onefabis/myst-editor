import { linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { WorkerLinter, binary } from "harper.js/dist/harper.js";

export const harperExtension = (() => {
  // This is crutial initialization of the Harper extension 
  const harperLinter = new WorkerLinter({ binary });

  // Map Harper lint kinds to CodeMirror severity levels
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

  /* Returns the CodeMirror severity string for a given Harper lint kind for underline style and color.
  In: The lint kind string from Harper. Out: Corresponding severity string. */
  const getSeverityForLintKind = kind => severityMap[kind] || "error";

  /* The main lint function called by CodeMirror. 
  Runs Harper lint asynchronously on the editor text and formats diagnostics. */
  const harperLint = async view => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];

    try { // Set Harper linting options
      await harperLinter.setLintConfig({
        SpellCheck: true,
        ForNoun: true,
        ExplanationMarks: true,
      });

      // Run linting on the full editor text
      const results = await harperLinter.lint(text, "plaintext");

      // Convert Harper results into CodeMirror diagnostics
      const diagnostics = results.map(d => {
        let span = null;

        // Prefer span from suggestions replace_span if valid
        for (const sug of d.suggestions()) {
          const rs = sug.replace_span?.();
          if (Array.isArray(rs) && rs.length === 2 && rs[0] >= 0 && rs[1] > rs[0] && rs[1] <= text.length) {
            span = rs;
            break;
          }
        }

        // Fall back to diagnostic span if no suggestion span found
        if (!span) span = [d.span().start, d.span().end];
        if (!span) return null;

        const message = d.message();
        const severity = getSeverityForLintKind(d.lint_kind());

        // Format suggestions for display and actions
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
          
          /* Renders a diagnostic message DOM popup window with suggestion buttons */
          renderMessage(view) {
            const dom = document.createElement("div");
            dom.textContent = message;

            if (suggestions.length) {
              const suggestionContainer = document.createElement("div");
              suggestionContainer.className = "cm-harper-suggestions-container";

              // Create buttons for each suggestion
              suggestions.forEach(({ kind, text, replaceSpan }) => {
                const btn = document.createElement("button");
                btn.className = "cm-harper-suggestion-btn";

                // Button text varies by suggestion kind
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

                // Click handler to apply the suggestion edit. It will insert the new corrected text instead of the underlined one
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

      // Filter out invalid diagnostics
      return diagnostics.filter(d => d && d.from >= 0 && d.to > d.from && d.to <= text.length);
    } catch (err) {
      console.error("[Harper] Lint error:", err);
      return [];
    }
  };

  // Return the configured linter extension with 700ms delay debounce
  return [linter(harperLint, { delay: 700 })];
})();
