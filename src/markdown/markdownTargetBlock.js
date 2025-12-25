/**
 * Hide target blocks like:
 * (label)=
 */
export function markdownTargetBlock(md) {
  md.block.ruler.before("paragraph", "myst_target", (state, startLine, endLine) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];

    const line = state.src.slice(pos, max);

    // Match: (anything-but-newline)=
    if (!/^\([^)]+\)=$/.test(line)) return false;

    // Advance past this line without producing tokens
    state.line = startLine + 1;
    return true;
  });
}
