/* empty css                          */
import { s as p, M as f, d as h, a as y, o as g, c as w, b as S, e as v, f as x, g as I, w as b, h as B } from "./MystEditor-BKoq1aQr.js";
let a = null;
document.getElementById("editor-panel");
const d = document.getElementById("sidebar"), E = document.getElementById("resizer"), m = localStorage.getItem("sidebarWidth");
m && (d.style.width = m + "px");
E.onmousedown = function(e) {
  e.preventDefault();
  const o = e.clientX, s = d.offsetWidth;
  document.onmousemove = function(i) {
    const t = s + (i.clientX - o);
    t >= 250 && t <= 600 && (d.style.width = t + "px", localStorage.setItem("sidebarWidth", t));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function T(e) {
  return e.replace(/\\/g, "/");
}
async function F(e) {
  const o = await fetch(`/api/file?path=${encodeURIComponent(T(e))}`);
  if (o.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!o.ok) {
    alert(`File loading error: ${o.statusText}`);
    return;
  }
  const s = await o.json();
  p(s.last_modified);
  const i = document.getElementById("myst"), t = document.createElement("div");
  t.id = "myst", t.style.flexGrow = "1", t.style.border = "1px solid #ccc", t.style.marginBottom = "0.5rem", t.style.height = "80vh", i.replaceWith(t), localStorage.setItem("currentPath", e);
  const n = new CSSStyleSheet(), l = await (await fetch("../PFXStyleOverride.css")).text();
  await n.replace(l), document.adoptedStyleSheets = [...document.adoptedStyleSheets, n];
  const c = e.split("\\").pop().split("/").pop();
  requestAnimationFrame(async () => {
    a = f({
      templatelist: "linkedtemplatelist.json",
      initialText: s.content,
      title: c,
      additionalStyles: n,
      includeButtons: h.concat([{
        text: "💾 Save",
        action: () => y(!0)
      }, {
        text: "🗃️ Image",
        action: () => g()
      }, {
        text: "Clear",
        action: () => w()
      }, {
        text: "H1",
        action: () => S()
      }, {
        text: "H2",
        action: () => v()
      }, {
        text: "B",
        action: () => x()
      }]),
      spellcheckOpts: !1,
      syncScroll: !0
    }, t), window._mystEditor = a, a.options.mode.subscribe((u) => {
      u === "Gitdiff" && I();
    });
    const r = await b();
    B(r);
  }), localStorage.setItem("lastOpened", e);
}
function k(e) {
  const o = e.split("/").pop() || "", s = o.lastIndexOf("."), t = `![${s > -1 ? o.substring(0, s) : o}](/${e})`, n = a == null ? void 0 : a.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  console.log(n);
  const {
    state: l
  } = n.v, {
    from: c,
    to: r
  } = l.selection.main;
  n.v.dispatch({
    changes: {
      from: c,
      to: r,
      insert: t
    },
    selection: {
      anchor: c + t.length
    }
    // cursor after insert
  }), n.v.focus();
}
export {
  k as insertImageMarkdown,
  F as loadFile,
  a as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
