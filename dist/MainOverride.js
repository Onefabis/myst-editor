/* empty css                          */
import { s as y, M as w, d as v, r as S, a as x, o as I, c as B, b, e as C, f as E, w as T, g as F, p as W, h as f, i as l, j as P } from "./MystEditor-DiDQWUXg.js";
let e = null;
document.getElementById("editor-panel");
const u = document.getElementById("sidebar"), k = document.getElementById("resizer"), h = localStorage.getItem("sidebarWidth");
h && (u.style.width = h + "px");
k.onmousedown = function(o) {
  o.preventDefault();
  const n = o.clientX, i = u.offsetWidth;
  document.onmousemove = function(a) {
    const t = i + (a.clientX - n);
    t >= 250 && t <= 600 && (u.style.width = t + "px", localStorage.setItem("sidebarWidth", t));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function H(o) {
  return o.replace(/\\/g, "/");
}
async function R(o) {
  const n = await fetch(`/api/file?path=${encodeURIComponent(H(o))}`);
  if (n.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!n.ok) {
    alert(`File loading error: ${n.statusText}`);
    return;
  }
  const i = await n.json();
  y(i.last_modified);
  const a = document.getElementById("myst"), t = document.createElement("div");
  t.id = "myst", t.style.flexGrow = "1", t.style.border = "1px solid #ccc", t.style.marginBottom = "0.5rem", t.style.height = "80vh", a.replaceWith(t), localStorage.setItem("currentPath", o);
  const s = new CSSStyleSheet(), r = await (await fetch("../PFXStyleOverride.css")).text();
  await s.replace(r), document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
  const c = o.split("\\").pop().split("/").pop();
  requestAnimationFrame(async () => {
    e = w({
      templatelist: "linkedtemplatelist.json",
      initialText: i.content,
      title: c,
      additionalStyles: s,
      includeButtons: v.concat([{
        text: "🧹 Revert",
        action: () => S(e)
      }, {
        text: "💾 Save",
        action: () => x(!0)
      }, {
        text: "🗃️ Image",
        action: () => I()
      }, {
        text: "Clear",
        action: () => B()
      }, {
        text: "H1",
        action: () => b()
      }, {
        text: "H2",
        action: () => C()
      }, {
        text: "B",
        action: () => E()
      }]),
      spellcheckOpts: !1,
      syncScroll: !0
    }, t);
    const d = await T();
    F(d), await W, ["Both", "Source", "Inline"].includes(e.options.mode.v) && f(e), window._mystEditor = e, e.options.mode.subscribe((m) => {
      requestAnimationFrame(async () => {
        var p;
        ["Both", "Source", "Inline"].includes(m) ? (await new Promise((g) => setTimeout(g, 150)), l ? l.handleModeChange(m, e) : f(e)) : m === "Gitdiff" && (l ? l.clearMergeView(e) : (p = e.editorView) != null && p.v && e.editorView.v.dispatch({
          effects: mergeCompartment.reconfigure([])
        }), P());
      });
    });
  }), localStorage.setItem("lastOpened", o);
}
function V(o) {
  const n = o.split("/").pop() || "", i = n.lastIndexOf("."), t = `![${i > -1 ? n.substring(0, i) : n}](/${o})`, s = e == null ? void 0 : e.editorView;
  if (!s) {
    alert("Editor is not ready yet.");
    return;
  }
  console.log(s);
  const {
    state: r
  } = s.v, {
    from: c,
    to: d
  } = r.selection.main;
  s.v.dispatch({
    changes: {
      from: c,
      to: d,
      insert: t
    },
    selection: {
      anchor: c + t.length
    }
    // cursor after insert
  }), s.v.focus();
}
export {
  V as insertImageMarkdown,
  R as loadFile,
  e as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
