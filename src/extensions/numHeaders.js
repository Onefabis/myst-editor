import { ensureSyntaxTree } from '@codemirror/language';

function cleanHeadingText(text) {
  return text.replace(/^[\d.\s]*/, '');
}

const headerTypes = {
  'SetextHeading1': 1,
  'SetextHeading2': 2,
  'ATXHeading1': 1,
  'ATXHeading2': 2,
  'ATXHeading3': 3,
};

function stripExistingNumbers(text) {
  text = text.replace(/^#+\s*/, '');
  return text.replace(/^\d+(\.\d+)*\.\s*/, '');
}

function getPathPrefix(path) {
  if (!path) return "unknown";
  path = path.replace(/\\/g, "/");       // normalize slashes
  path = path.replace(/\s+/g, "_");      // replace spaces
  const parts = path.split("/");
  // Remove file extension from the last part
  const last = parts[parts.length - 1].replace(/\.[^/.]+$/, "");
  parts[parts.length - 1] = last;
  return parts.join("-");                // join with dashes
}

export function renumberHeadings(editorView) {
  const doc = editorView.v.state.doc;
  const headings = [];
  const tree = ensureSyntaxTree(editorView.v.state, doc.length, 5000);

  tree.iterate({
    enter: (node) => {
      if (headerTypes[node.name]) {
        const level = headerTypes[node.name];
        const text = doc.sliceString(node.from, node.to);

        if (node.name.startsWith('ATX')) {
          headings.push({ type: 'atx', level, from: node.from, to: node.to, text });
        } else {
          const lines = text.split('\n');
          if (lines.length < 2) return;

          headings.push({
            type: 'setext',
            level,
            from: node.from,
            to: node.to,
            text: lines[0],
            underline: lines[1]
          });
        }
      }
    }
  });

  headings.sort((a, b) => a.from - b.from);

  const counters = [0, 0, 0, 0, 0, 0];
  const changes = [];

  const fileBase = getPathPrefix(localStorage.getItem("currentPath"));

  for (let heading of headings) {
    const level = heading.level;
    counters[level - 1]++;
    for (let i = level; i < 6; i++) counters[i] = 0;

    const number = counters.slice(0, level).join('.');
    const cleanTextWithoutHashes = stripExistingNumbers(heading.text);
    const slug = cleanTextWithoutHashes.trim().replace(/\s+/g, '_');

    const anchor = `(${fileBase}_${number}._${slug})=`;

    // --- Build updated heading text ---
    let newText;
    if (heading.type === 'atx') {
      newText = '#'.repeat(level) + ' ' + number + '. ' + cleanTextWithoutHashes;
    } else {
      newText = number + '. ' + cleanTextWithoutHashes;
      heading.to = doc.lineAt(heading.from).to;
    }

    // --- Anchor logic ---
    const line = doc.lineAt(heading.from);

    // Look TWO lines above the heading:
    // 1: possible anchor
    // 2: possible blank line
    const linesAbove = [];
    if (line.number > 1) linesAbove.push(doc.line(line.number - 1));
    if (line.number > 2) linesAbove.push(doc.line(line.number - 2));

    let foundAnchorLine = null;

    for (const l of linesAbove) {
      if (/^\(.+\)=\s*$/.test(l.text.trim())) {
        foundAnchorLine = l;
        break;
      }
    }

    // CASE 1 — Correct anchor already exists → skip
    if (foundAnchorLine && foundAnchorLine.text.trim() === anchor) {
      // ensure exactly one blank line between anchor and heading
      if (foundAnchorLine.number < line.number - 1) {
        // too many empty lines → remove them
        const start = doc.line(foundAnchorLine.number + 1).from;
        const end = doc.line(line.number - 1).to;
        changes.push({ from: start, to: end, insert: "\n" });
      }
    }

    // CASE 2 — Wrong anchor exists → replace it
    else if (foundAnchorLine) {
      changes.push({
        from: foundAnchorLine.from,
        to: foundAnchorLine.to,
        insert: anchor
      });
    }

    // CASE 3 — No anchor exists → insert correct anchor with EXACT spacing
    else {
      const insertPos = line.from;
      changes.push({
        from: insertPos,
        to: insertPos,
        insert: `${anchor}\n`
      });
    }

    // --- Replace heading text if needed ---
    const oldText = doc.sliceString(heading.from, heading.to);
    if (oldText !== newText) {
      changes.push({ from: heading.from, to: heading.to, insert: newText });
    }
  }

  if (changes.length > 0) {
    editorView.v.dispatch({
      changes,
      annotations: [{ type: 'renumber-headings', value: 'updated' }]
    });
  }
}
