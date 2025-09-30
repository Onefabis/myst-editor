/* empty css                          */
import { s as g, M as y, d as w, r as S, a as x, o as b, c as I, b as B, e as C, f as E, w as T, g as F, p as W, h as f, i as r, j as P } from "./MystEditor-DK2V0BhE.js";
let t = null;
document.getElementById("editor-panel");
const c = document.getElementById("sidebar"), k = document.getElementById("resizer"), h = localStorage.getItem("sidebarWidth");
h && (c.style.width = h + "px");
k.onmousedown = function(o) {
  o.preventDefault();
  const n = o.clientX, s = c.offsetWidth;
  document.onmousemove = function(a) {
    const e = s + (a.clientX - n);
    e >= 250 && e <= 600 && (c.style.width = e + "px", c.style.minWidth = e + "px", localStorage.setItem("sidebarWidth", e));
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
  const s = await n.json();
  g(s.last_modified);
  const a = document.getElementById("myst"), e = document.createElement("div");
  e.id = "myst", e.style.flexGrow = "1", e.style.border = "1px solid #ccc", e.style.marginBottom = "0.5rem", e.style.height = "80vh", a.replaceWith(e), localStorage.setItem("currentPath", o);
  const i = new CSSStyleSheet(), d = await (await fetch("../PFXStyleOverride.css")).text();
  await i.replace(d), document.adoptedStyleSheets = [...document.adoptedStyleSheets, i];
  const l = o.split("\\").pop().split("/").pop();
  requestAnimationFrame(async () => {
    t = y({
      templatelist: "linkedtemplatelist.json",
      initialText: s.content,
      title: l,
      additionalStyles: i,
      includeButtons: w.concat([{
        id: "revert",
        text: "🧹 Revert",
        visible: !1,
        action: () => S()
      }, {
        text: "💾 Save",
        visible: !0,
        action: () => x(!0)
      }, {
        text: "🗃️ Image",
        visible: !0,
        action: () => b()
      }, {
        text: "Clear",
        visible: !0,
        action: () => I()
      }, {
        text: "H1",
        visible: !0,
        action: () => B()
      }, {
        text: "H2",
        visible: !0,
        action: () => C()
      }, {
        text: "B",
        visible: !0,
        action: () => E()
      }]),
      spellcheckOpts: !1,
      syncScroll: !0
    }, e);
    const u = await T();
    F(u), await W, ["Both", "Source", "Inline"].includes(t.options.mode.v) && f(t), window._mystEditor = t, t.options.mode.subscribe((m) => {
      requestAnimationFrame(async () => {
        var p;
        ["Both", "Source", "Inline"].includes(m) ? (await new Promise((v) => setTimeout(v, 150)), r ? r.handleModeChange(m, t) : f(t)) : m === "Gitdiff" && (r ? r.clearMergeView(t) : (p = t.editorView) != null && p.v && t.editorView.v.dispatch({
          effects: mergeCompartment.reconfigure([])
        }), P());
      });
    });
  }), localStorage.setItem("lastOpened", o);
}
function V(o) {
  const n = o.split("/").pop() || "", s = n.lastIndexOf("."), e = `![${s > -1 ? n.substring(0, s) : n}](/${o})`, i = t == null ? void 0 : t.editorView;
  if (!i) {
    alert("Editor is not ready yet.");
    return;
  }
  console.log(i);
  const {
    state: d
  } = i.v, {
    from: l,
    to: u
  } = d.selection.main;
  i.v.dispatch({
    changes: {
      from: l,
      to: u,
      insert: e
    },
    selection: {
      anchor: l + e.length
    }
    // cursor after insert
  }), i.v.focus();
}
export {
  V as insertImageMarkdown,
  R as loadFile,
  t as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
