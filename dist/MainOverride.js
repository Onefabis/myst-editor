/* empty css                          */
import { M as p, d as f, r as h, s as v, o as y, c as g, a as w, b as x, e as S } from "./MystEditor-Dm9C1cX3.js";
let n = null;
document.getElementById("editor-panel");
const u = document.getElementById("sidebar"), b = document.getElementById("resizer"), m = localStorage.getItem("sidebarWidth");
m && (u.style.width = m + "px");
b.onmousedown = function(e) {
  e.preventDefault();
  const o = e.clientX, s = u.offsetWidth;
  document.onmousemove = function(i) {
    const t = s + (i.clientX - o);
    t >= 250 && t <= 600 && (u.style.width = t + "px", localStorage.setItem("sidebarWidth", t));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function I(e) {
  return e.replace(/\\/g, "/");
}
function B(e, o = null) {
  var s;
  try {
    if ((s = n == null ? void 0 : n.editorView) != null && s.v && !n.editorView.v.isDestroyed)
      return e(n.editorView.v);
  } catch (i) {
    console.warn("Safe editor access failed:", i);
  }
  return o;
}
async function E(e) {
  var a;
  const o = await fetch(`/api/file?path=${encodeURIComponent(I(e))}`);
  if (o.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!o.ok) {
    alert(`File loading error: ${o.statusText}`);
    return;
  }
  const s = await o.json();
  if ((a = n == null ? void 0 : n.editorView) != null && a.v) {
    try {
      n.editorView.v.destroy();
    } catch (l) {
      console.warn("Error destroying old editor:", l);
    }
    n = null;
  }
  const i = document.getElementById("myst"), t = document.createElement("div");
  t.id = "myst", t.style.flexGrow = "1", t.style.border = "1px solid #ccc", t.style.marginBottom = "0.5rem", t.style.height = "80vh", i.replaceWith(t), localStorage.setItem("currentPath", e);
  const c = new CSSStyleSheet(), r = await (await fetch("../PFXStyleOverride.css")).text();
  await c.replace(r), document.adoptedStyleSheets = [...document.adoptedStyleSheets, c];
  const d = e.split("\\").pop().split("/").pop();
  await new Promise((l) => setTimeout(l, 50)), n = p({
    templatelist: "linkedtemplatelist.json",
    initialText: s.content,
    title: d,
    additionalStyles: c,
    includeButtons: f.concat([{
      id: "revert",
      text: "🧹 Revert",
      visible: !1,
      action: () => h()
    }, {
      text: "💾 Save",
      visible: !0,
      action: () => v(!0)
    }, {
      text: "🗃️ Image",
      visible: !0,
      action: () => y()
    }, {
      text: "Clear",
      visible: !0,
      action: () => g()
    }, {
      text: "H1",
      visible: !0,
      action: () => w()
    }, {
      text: "H2",
      visible: !0,
      action: () => x()
    }, {
      text: "B",
      visible: !0,
      action: () => S()
    }]),
    spellcheckOpts: !1,
    syncScroll: !0
  }, t), localStorage.setItem("lastOpened", e);
}
function W(e) {
  const o = e.split("/").pop() || "", s = o.lastIndexOf("."), t = `![${s > -1 ? o.substring(0, s) : o}](/${e})`;
  B((r) => {
    const {
      state: d
    } = r, {
      from: a,
      to: l
    } = d.selection.main;
    return r.dispatch({
      changes: {
        from: a,
        to: l,
        insert: t
      },
      selection: {
        anchor: a + t.length
      }
    }), r.focus(), !0;
  }) || alert("Editor is not ready yet.");
}
export {
  W as insertImageMarkdown,
  E as loadFile,
  n as mystEditorInstance
};
//# sourceMappingURL=MainOverride.js.map
