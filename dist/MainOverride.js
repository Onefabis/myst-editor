/* empty css                          */
import { s as u, M as p, d as f, a as y, o as h, c as g, b as w, e as v, f as x, w as S, g as I } from "./MystEditor-D22XXGGf.js";
let a = null;
document.getElementById("editor-panel");
const r = document.getElementById("sidebar"), B = document.getElementById("resizer"), d = localStorage.getItem("sidebarWidth");
d && (r.style.width = d + "px");
B.onmousedown = function(e) {
  e.preventDefault();
  const o = e.clientX, s = r.offsetWidth;
  document.onmousemove = function(i) {
    const t = s + (i.clientX - o);
    t >= 250 && t <= 600 && (r.style.width = t + "px", localStorage.setItem("sidebarWidth", t));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function E(e) {
  return e.replace(/\\/g, "/");
}
async function T(e) {
  const o = await fetch(`/api/file?path=${encodeURIComponent(E(e))}`);
  if (o.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!o.ok) {
    alert(`File loading error: ${o.statusText}`);
    return;
  }
  const s = await o.json();
  u(s.last_modified);
  const i = document.getElementById("myst"), t = document.createElement("div");
  t.id = "myst", t.style.flexGrow = "1", t.style.border = "1px solid #ccc", t.style.marginBottom = "0.5rem", t.style.height = "80vh", i.replaceWith(t), localStorage.setItem("currentPath", e);
  const n = new CSSStyleSheet(), c = await (await fetch("../PFXStyleOverride.css")).text();
  await n.replace(c), document.adoptedStyleSheets = [...document.adoptedStyleSheets, n];
  const l = e.split("\\").pop().split("/").pop();
  requestAnimationFrame(async () => {
    a = p({
      templatelist: "linkedtemplatelist.json",
      initialText: s.content,
      title: l,
      additionalStyles: n,
      includeButtons: f.concat([{
        text: "💾 Save",
        action: () => y(!0)
      }, {
        text: "🗃️ Image",
        action: () => h()
      }, {
        text: "Clear",
        action: () => g()
      }, {
        text: "H1",
        action: () => w()
      }, {
        text: "H2",
        action: () => v()
      }, {
        text: "B",
        action: () => x()
      }]),
      spellcheckOpts: !1,
      syncScroll: !0
    }, t), window._mystEditor = a;
    const m = await S();
    I(m);
  }), localStorage.setItem("lastOpened", e);
}
function O(e) {
  const o = e.split("/").pop() || "", s = o.lastIndexOf("."), t = `![${s > -1 ? o.substring(0, s) : o}](/${e})`, n = a == null ? void 0 : a.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  n.v;
  const c = n.v.contentDOM.editContext.selectionStart, l = n.v.contentDOM.editContext.selectionEnd;
  n.v.dispatch({
    changes: {
      from: c,
      to: l,
      insert: t
    },
    selection: {
      anchor: c + t.length
    }
  }), n.v.focus();
}
export {
  O as insertImageMarkdown,
  T as loadFile,
  a as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
