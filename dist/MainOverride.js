/* empty css                          */
import { s as y, M as g, d as w, a as S, o as b, c as x, b as I, e as B, f as C, w as E, g as F, p as W, h as T, r as P, i as m, j as n } from "./MystEditor-QdJIHPQe.js";
let t = null;
document.getElementById("editor-panel");
const a = document.getElementById("sidebar"), _ = document.getElementById("resizer"), u = localStorage.getItem("sidebarWidth");
u && (a.style.width = u + "px");
_.onmousedown = function(o) {
  o.preventDefault();
  const i = o.clientX, s = a.offsetWidth;
  document.onmousemove = function(r) {
    const e = s + (r.clientX - i);
    e >= 250 && e <= 600 && (a.style.width = e + "px", a.style.minWidth = e + "px", localStorage.setItem("sidebarWidth", e));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function H(o) {
  return o.replace(/\\/g, "/");
}
async function O(o) {
  const i = await fetch(`/api/file?path=${encodeURIComponent(H(o))}`);
  if (i.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!i.ok) {
    alert(`File loading error: ${i.statusText}`);
    return;
  }
  const s = await i.json();
  y(s.last_modified);
  const r = document.getElementById("myst"), e = document.createElement("div");
  e.id = "myst", e.style.flexGrow = "1", e.style.border = "1px solid #ccc", e.style.marginBottom = "0.5rem", e.style.height = "80vh", r.replaceWith(e), localStorage.setItem("currentPath", o);
  const l = new CSSStyleSheet(), p = await (await fetch("../PFXStyleOverride.css")).text();
  await l.replace(p), document.adoptedStyleSheets = [...document.adoptedStyleSheets, l];
  const f = o.split("\\").pop().split("/").pop();
  requestAnimationFrame(async () => {
    t = g({
      templatelist: "linkedtemplatelist.json",
      initialText: s.content,
      title: f,
      additionalStyles: l,
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
        action: () => b()
      }, {
        id: "clear_format",
        text: "Clear",
        visible: !0,
        action: () => x()
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
    const h = await E();
    F(h), await W, ["Both", "Source", "Inline"].includes(t.options.mode.v) && m(t), window._mystEditor = t, t.options.mode.subscribe((c) => {
      requestAnimationFrame(async () => {
        var d;
        ["Both", "Source", "Inline"].includes(c) ? (await new Promise((v) => setTimeout(v, 150)), n ? n.handleModeChange(c, t) : m(t)) : c === "Gitdiff" && (n ? n.clearMergeView(t) : (d = t.editorView) != null && d.v && t.editorView.v.dispatch({
          effects: mergeCompartment.reconfigure([])
        }), T());
      });
    });
  }), localStorage.setItem("lastOpened", o);
}
export {
  O as loadFile,
  t as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
