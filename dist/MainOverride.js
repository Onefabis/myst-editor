/* empty css                          */
import { s as g, M as y, d as w, a as S, o as x, c as b, b as I, e as B, f as C, w as E, g as T, p as F, h as W, r as P, i as f, j as l } from "./MystEditor-BnQODMva.js";
let t = null;
document.getElementById("editor-panel");
const c = document.getElementById("sidebar"), _ = document.getElementById("resizer"), h = localStorage.getItem("sidebarWidth");
h && (c.style.width = h + "px");
_.onmousedown = function(o) {
  o.preventDefault();
  const i = o.clientX, s = c.offsetWidth;
  document.onmousemove = function(a) {
    const e = s + (a.clientX - i);
    e >= 250 && e <= 600 && (c.style.width = e + "px", c.style.minWidth = e + "px", localStorage.setItem("sidebarWidth", e));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function k(o) {
  return o.replace(/\\/g, "/");
}
async function L(o) {
  const i = await fetch(`/api/file?path=${encodeURIComponent(k(o))}`);
  if (i.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!i.ok) {
    alert(`File loading error: ${i.statusText}`);
    return;
  }
  const s = await i.json();
  g(s.last_modified);
  const a = document.getElementById("myst"), e = document.createElement("div");
  e.id = "myst", e.style.flexGrow = "1", e.style.border = "1px solid #ccc", e.style.marginBottom = "0.5rem", e.style.height = "80vh", a.replaceWith(e), localStorage.setItem("currentPath", o);
  const n = new CSSStyleSheet(), d = await (await fetch("../PFXStyleOverride.css")).text();
  await n.replace(d), document.adoptedStyleSheets = [...document.adoptedStyleSheets, n];
  const r = o.split("\\").pop().split("/").pop();
  requestAnimationFrame(async () => {
    t = y({
      templatelist: "linkedtemplatelist.json",
      initialText: s.content,
      title: r,
      additionalStyles: n,
      includeButtons: w.concat([{
        id: "revert",
        text: "🧹 Revert",
        visible: !1,
        action: () => {
          P();
        }
      }, {
        id: "save",
        text: "💾 Save",
        visible: !0,
        action: () => S(!0)
      }, {
        id: "image",
        text: "🗃️ Image",
        visible: !0,
        action: () => x()
      }, {
        id: "clear_format",
        text: "Clear",
        visible: !0,
        action: () => b()
      }, {
        id: "h1_format",
        text: "H1",
        visible: !0,
        action: () => I()
      }, {
        id: "h2_format",
        text: "H2",
        visible: !0,
        action: () => B()
      }, {
        id: "b_format",
        text: "B",
        visible: !0,
        action: () => C()
      }]),
      spellcheckOpts: !1,
      syncScroll: !0
    }, e);
    const m = await E();
    T(m), await F, ["Both", "Source", "Inline"].includes(t.options.mode.v) && f(t), window._mystEditor = t, t.options.mode.subscribe((u) => {
      requestAnimationFrame(async () => {
        var p;
        ["Both", "Source", "Inline"].includes(u) ? (await new Promise((v) => setTimeout(v, 150)), l ? l.handleModeChange(u, t) : f(t)) : u === "Gitdiff" && (l ? l.clearMergeView(t) : (p = t.editorView) != null && p.v && t.editorView.v.dispatch({
          effects: mergeCompartment.reconfigure([])
        }), W());
      });
    });
  }), localStorage.setItem("lastOpened", o);
}
function R(o) {
  const i = o.split("/").pop() || "", s = i.lastIndexOf("."), e = `![${s > -1 ? i.substring(0, s) : i}](/${o})`, n = t == null ? void 0 : t.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  console.log(n);
  const {
    state: d
  } = n.v, {
    from: r,
    to: m
  } = d.selection.main;
  n.v.dispatch({
    changes: {
      from: r,
      to: m,
      insert: e
    },
    selection: {
      anchor: r + e.length
    }
    // cursor after insert
  }), n.v.focus();
}
export {
  R as insertImageMarkdown,
  L as loadFile,
  t as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
