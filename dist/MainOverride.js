/* empty css                           */
/* empty css                           */
import { M as z, d as X, s as A, a as G } from "./MystEditor-Brf8ekcZ.js";
const S = new Set(JSON.parse(localStorage.getItem("openFolders") || "[]")), j = ["_static", "_templates"];
let g = "", v = "", d = null;
const $ = document.getElementById("sidebar"), K = document.getElementById("resizer");
document.getElementById("editor-panel");
const D = localStorage.getItem("sidebarWidth");
D && ($.style.width = D + "px");
K.onmousedown = function(e) {
  e.preventDefault();
  const t = e.clientX, n = $.offsetWidth;
  document.onmousemove = function(o) {
    const i = n + (o.clientX - t);
    i >= 250 && i <= 600 && ($.style.width = i + "px", localStorage.setItem("sidebarWidth", i));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function k(e) {
  return e.replace(/\\/g, "/");
}
function x() {
  fetch("/api/tree").then((e) => e.json()).then((e) => {
    B(e, document.getElementById("tree"));
    let t = localStorage.getItem("currentPath");
    t && (U(t, e) ? fetch(`/api/file?path=${encodeURIComponent(t)}`).then((n) => {
      if (!n.ok) throw new Error("File missing");
      return n.json();
    }).then(() => N(k(t))).catch(() => {
      console.warn("Last opened file not found."), localStorage.removeItem("currentPath");
    }) : (localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened")));
  });
}
function U(e, t) {
  for (const n of t)
    if (n.path === e && n.type === "file" || n.type === "folder" && n.children && U(e, n.children))
      return !0;
  return !1;
}
function L() {
  document.querySelectorAll(".file, .folder").forEach((e) => {
    e.classList.remove("active");
  });
}
function B(e, t) {
  t.innerHTML = "";
  const n = document.createElement("ul");
  for (const o of e) {
    const i = document.createElement("li"), a = document.createElement("span");
    if (a.textContent = o.name.endsWith(".md") ? o.name.replace(/\.md$/, "") : o.name, a.title = o.path, a.className = o.type, o.type === "folder") {
      if (o.name.startsWith(".") || o.name.startsWith("_"))
        continue;
      const r = document.createElement("span");
      r.textContent = "📁", r.style.marginRight = "6px", a.prepend(r);
    } else if (o.type === "file") {
      const r = document.createElement("span");
      r.textContent = "📄", r.style.marginRight = "6px", a.prepend(r);
    }
    a.onclick = (r) => {
      r.stopPropagation(), L(), a.classList.add("active");
      const c = a.querySelector("span");
      if (o.type === "file")
        N(k(o.path));
      else {
        v = o.path;
        const s = i.querySelector(".subtree");
        s.hasChildNodes() ? (s.innerHTML = "", c && (c.textContent = "📁"), S.delete(o.path), localStorage.setItem("openFolders", JSON.stringify([...S]))) : o.children && (B(o.children, s), c && (c.textContent = "📂"), S.add(o.path), localStorage.setItem("openFolders", JSON.stringify([...S])));
      }
    };
    const l = document.createElement("div");
    if (l.className = "subtree", i.appendChild(a), i.appendChild(l), n.appendChild(i), o.type === "folder" && S.has(o.path)) {
      B(o.children || [], l);
      const r = a.querySelector("span");
      r && (r.textContent = "📂");
    }
  }
  t.appendChild(n), t.addEventListener("click", (o) => {
    !o.target.closest("span.file") && !o.target.closest("span.folder") && (L(), v = "");
  });
}
async function N(e) {
  var y;
  d && d.editorView.v.contentDOM.editContext.text !== M && await O();
  const t = await fetch(`/api/file?path=${encodeURIComponent(k(e))}`);
  if (t.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!t.ok) {
    alert(`File loading error: ${t.statusText}`);
    return;
  }
  const n = await t.json(), o = document.getElementById("myst"), i = document.createElement("div");
  i.id = "myst", i.style.flexGrow = "1", i.style.border = "1px solid #ccc", i.style.marginBottom = "0.5rem", i.style.height = "80vh", o.replaceWith(i), g = e, localStorage.setItem("currentPath", g);
  const a = new CSSStyleSheet(), l = await (await fetch("../FuroStyleOverride.css")).text();
  await a.replace(l), document.adoptedStyleSheets = [...document.adoptedStyleSheets, a];
  const r = e.split("\\").pop().split("/").pop(), c = new URLSearchParams(window.location.search), s = ["#30bced", "#60c771", "#e6aa3a", "#cbb63e", "#ee6352", "#9ac2c9", "#8acb88", "#14b2c4"], m = ((y = import.meta) == null ? void 0 : y.env) ?? {};
  m.VITE_COLLAB !== "OFF" && c.get("collab");
  const p = m.VITE_WS_URL ?? c.get("collab_server"), f = c.get("room") || "0", T = c.get("username") || Math.floor(Math.random() * 1e3).toString(), b = s[Math.floor(Math.random() * s.length)];
  requestAnimationFrame(() => {
    d = z({
      templatelist: "linkedtemplatelist.json",
      initialText: n.content,
      title: r,
      additionalStyles: a,
      collaboration: {
        enabled: !1,
        commentsEnabled: !1,
        resolvingCommentsEnabled: !0,
        wsUrl: p ?? "#",
        username: T,
        room: f,
        color: b,
        mode: p ? "websocket" : "local"
      },
      includeButtons: X.concat([{
        text: "💾 Save",
        action: () => {
          O(!0);
        }
      }, {
        text: "🗃️ Image",
        action: () => {
          ee();
        }
      }, {
        text: "Clear",
        action: () => {
          F();
        }
      }, {
        text: "H1",
        action: () => {
          Y();
        }
      }, {
        text: "H2",
        action: () => {
          Q();
        }
      }, {
        text: "B",
        action: () => {
          Z();
        }
      }]),
      spellcheckOpts: {
        dict: "en_US",
        dictionaryPath: `${window.location.pathname}dictionaries`
      },
      syncScroll: !0
    }, i), window._mystEditor = d, M = n.content, P && clearInterval(P), P = setInterval(() => {
      O();
    }, 60 * 1e3);
  }), localStorage.setItem("lastOpened", e);
}
let M = "", P = null;
async function O(e = !1) {
  const t = d == null ? void 0 : d.editorView;
  if (!t) {
    e && alert("Editor is not ready.");
    return;
  }
  const n = t.v.contentDOM.editContext.text;
  try {
    await fetch(`/api/file?path=${encodeURIComponent(g)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: n
      })
    }), M = n, e && alert("Saved");
  } catch (o) {
    e && alert("Save failed: " + o.message);
  }
}
document.getElementById("upload-image").onclick = () => {
  const e = document.createElement("input");
  e.type = "file", e.accept = "image/*", e.onchange = async () => {
    const t = e.files[0];
    if (!t) return;
    const n = localStorage.getItem("currentPath") || "", o = new FormData();
    o.append("file", t), o.append("currentPath", n);
    try {
      const i = await fetch("/api/upload_image", {
        method: "POST",
        body: o
      });
      if (!i.ok) {
        const c = await i.text();
        alert("Upload failed: " + c);
        return;
      }
      const a = await i.json(), l = a.savedPath, r = a.savedPath.split("/").slice(0, -1).join("/");
      W(l);
    } catch (i) {
      alert("Upload error: " + i.message);
    }
  }, e.click();
};
function F() {
  const e = d == null ? void 0 : d.editorView;
  if (!e) {
    alert("Editor is not ready yet.");
    return;
  }
  const t = e.v.state, {
    from: n,
    to: o
  } = t.selection.main, i = t.doc.toString(), a = i.lastIndexOf(`
`, n - 1) + 1, l = i.indexOf(`
`, o), r = l === -1 ? i.length : l, c = i.slice(a, r), s = "[#*_\\s]*", m = new RegExp(`^${s}(.*?)${s}$`), p = c.match(m), f = p ? p[1] : c;
  e.v.dispatch({
    changes: {
      from: a,
      to: r,
      insert: f
    },
    selection: {
      anchor: a + f.length
    }
  }), e.v.focus();
}
function R(e) {
  const t = d == null ? void 0 : d.editorView;
  if (!t) {
    alert("Editor is not ready yet.");
    return;
  }
  const n = t.v.state, {
    from: o,
    to: i
  } = n.selection.main, a = n.doc.toString(), l = a.lastIndexOf(`
`, o - 1) + 1, r = a.indexOf(`
`, i), c = r === -1 ? a.length : r, m = a.slice(l, c).replace(/^[#*_ \t]+|[#*_ \t]+$/g, ""), p = e + m;
  t.v.dispatch({
    changes: {
      from: l,
      to: c,
      insert: p
    },
    selection: {
      anchor: l + p.length
    }
  }), t.v.focus();
}
function Y() {
  F(), R("# ");
}
function Q() {
  F(), R("## ");
}
function Z() {
  const e = d == null ? void 0 : d.editorView;
  if (!e) {
    alert("Editor is not ready yet.");
    return;
  }
  const t = e.v.state, {
    from: n,
    to: o
  } = t.selection.main;
  if (n === o) {
    alert("Please select text to bold.");
    return;
  }
  const l = `**${t.doc.toString().slice(n, o)}**`;
  e.v.dispatch({
    changes: {
      from: n,
      to: o,
      insert: l
    },
    selection: {
      anchor: n + l.length
    }
  }), e.v.focus();
}
const h = document.createElement("div");
h.id = "custom-menu";
h.innerHTML = `
  <div class="item" id="excalidraw_image">🖼️ Excalidraw Image</div>
  <div class="item" id="ai_popup">🤖 AI Assistant</div>
`;
document.body.appendChild(h);
document.addEventListener("contextmenu", (e) => {
  const t = e.composedPath(), n = t.some((a) => {
    var l;
    return (l = a.classList) == null ? void 0 : l.contains("cm-content");
  }), o = t.some((a) => typeof a.id == "string" && a.id.startsWith("excalidraw")), i = t.some((a) => {
    var l;
    return ((l = a.classList) == null ? void 0 : l.contains("ollama-ai")) || typeof a.id == "string" && a.id === "ollama-ai";
  });
  n && !o && !i ? (e.preventDefault(), h.style.top = `${e.clientY}px`, h.style.left = `${e.clientX}px`, h.style.display = "block") : h.style.display = "none";
});
document.addEventListener("click", () => {
  h.style.display = "none";
});
document.getElementById("excalidraw_image").addEventListener("click", async () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  const t = e.v.state, n = t.selection.main.head, o = t.doc.toString(), i = o.lastIndexOf(`
`, n - 1) + 1, a = o.indexOf(`
`, n), l = a === -1 ? o.length : a, c = o.slice(i, l).match(/!\[.*?\]\((.*?)\)/);
  if (c) {
    A(c[1], e);
    return;
  }
  const s = prompt(`No image found.
Enter name for new Excalidraw image (without extension):`);
  if (!s) return;
  const m = s.trim().replace(/\s+/g, "_");
  if (!m) return;
  const p = localStorage.getItem("currentPath") || "", T = `_static/${p.replace(/\\/g, "/").split("/").slice(0, -1).join("/")}`, b = `${m}.png`, y = new FormData(), H = new Blob([], {
    type: "image/png"
  });
  y.append("file", H, b), y.append("currentPath", p);
  try {
    const w = await fetch("/api/upload_image", {
      method: "POST",
      body: y
    });
    if (!w.ok) {
      const J = await w.text();
      alert("Failed to create image: " + J);
      return;
    }
    const q = (await w.json()).savedPath;
    W(q), A(`${T}/${b}`, e);
  } catch (w) {
    alert("Image creation failed: " + w.message);
  }
});
document.getElementById("ai_popup").addEventListener("click", () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  G(e);
});
let u = null, E = null, C = null, I = "";
function ee(e = "") {
  if (!u) {
    u = document.createElement("div"), u.id = "image-picker-modal", u.style = `
      position: fixed;
      top: 10%; left: 10%;
      width: 80%; height: 80%;
      background: #fff;
      border: 1px solid #ccc;
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
      z-index: 9999;
      display: flex;
      flex-direction: row;
      user-select: none;
    `, u.innerHTML = `
      <div id="image-picker-folder-list" style="width: 30%; overflow-y: auto; border-right: 1px solid #ccc; padding: 10px; box-sizing: border-box;"></div>
      <div id="image-picker-image-list" style="flex-grow: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px;"></div>
      <button id="image-picker-close" style="width: 28px; padding: 0; margin: 0; position: absolute; top: 8px; right: 12px; font-size: 20px; cursor: pointer; background: transparent; border: none;">✖</button>
    `, document.body.appendChild(u), E = document.getElementById("image-picker-folder-list"), C = document.getElementById("image-picker-image-list");
    const n = document.getElementById("image-picker-close");
    n.onclick = () => {
      u.style.display = "none";
    };
  }
  u.style.display = "flex", I = e, V(I);
  const t = e ? e.split("/") : [];
  fetch("/api/image_tree").then((n) => n.json()).then((n) => {
    E.innerHTML = "", _(n, E, t);
  });
}
function W(e) {
  const t = `![image](/_static/${e})`, n = d == null ? void 0 : d.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  n.v;
  const o = n.v.contentDOM.editContext.selectionStart, i = n.v.contentDOM.editContext.selectionEnd;
  n.v.dispatch({
    changes: {
      from: o,
      to: i,
      insert: t
    },
    selection: {
      anchor: o + t.length
    }
  }), n.v.focus();
}
function _(e, t, n = []) {
  const o = document.createElement("ul");
  for (const i of e) {
    if (i.type !== "folder") continue;
    const a = document.createElement("li"), l = document.createElement("div");
    l.style.display = "flex", l.style.alignItems = "center";
    const r = document.createElement("span");
    r.textContent = "➕", r.style.cursor = "pointer", r.style.width = "20px";
    const c = document.createElement("span");
    c.textContent = i.name, c.style.cursor = "pointer", c.style.userSelect = "none", c.style.padding = "2px 4px", i.path === n.join("/") && (c.style.fontWeight = "bold");
    const s = document.createElement("div");
    s.style.marginLeft = "16px", s.style.display = "none";
    const m = i.path.split("/");
    n.length >= m.length && n.slice(0, m.length).join("/") === i.path && (s.style.display = "block", r.textContent = "➖"), r.onclick = () => {
      s.style.display === "none" ? (s.style.display = "block", r.textContent = "➖") : (s.style.display = "none", r.textContent = "➕");
    }, c.onclick = () => {
      I = i.path, V(I), fetch("/api/image_tree").then((f) => f.json()).then((f) => {
        E.innerHTML = "", _(f, E, i.path.split("/"));
      });
    }, l.appendChild(r), l.appendChild(c), a.appendChild(l), i.children && i.children.length > 0 && _(i.children, s, n), a.appendChild(s), o.appendChild(a);
  }
  t.appendChild(o);
}
function te(e) {
  C && (C.innerHTML = "", e.filter((t) => t.type === "file").forEach((t) => {
    const n = document.createElement("img");
    n.src = `/_static/${t.path}`, n.style.width = "100px", n.style.height = "fit-content", n.style.cursor = "pointer", n.title = t.name, n.alt = t.name, n.onclick = () => {
      W(t.path), u.style.display = "none";
    }, C.appendChild(n);
  }));
}
async function V(e) {
  try {
    const t = await fetch(`/api/images_in_folder?folder=${encodeURIComponent(e)}`);
    if (!t.ok) {
      alert("Failed to load list of images/folders");
      return;
    }
    const n = await t.json();
    te(n);
  } catch (t) {
    alert("Error: " + t.message);
  }
}
function ne(e) {
  const t = document.createElement("div");
  t.style = `
    position: fixed;
    top: 20%; left: 30%;
    width: 40%; height: 50%;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
    z-index: 10000;
    padding: 1rem;
    overflow-y: auto;
  `, t.innerHTML = `<h3>Select folder to move to</h3>
    <div id="move-tree" style="display: block; width:100%; height: 80%;"></div>
    <div style="text-align: right; margin-top: 10px;">
      <button id="move-cancel">❌ Cancel</button>
      <button id="move-ok">✅ OK</button>
    </div>`, document.body.appendChild(t);
  let n = "";
  fetch("/api/tree").then((i) => i.json()).then((i) => {
    const a = document.getElementById("move-tree");
    o([{
      type: "folder",
      name: "root",
      path: "",
      children: i
    }], a);
  });
  function o(i, a) {
    const l = document.createElement("ul");
    for (const r of i) {
      if (r.type !== "folder") continue;
      const c = document.createElement("li"), s = document.createElement("div");
      s.textContent = "📁 " + r.name, s.style.cursor = "pointer", s.onclick = () => {
        n = r.path.replace(/\\/g, "/"), document.querySelectorAll("#move-tree div").forEach((m) => m.style.fontWeight = "normal"), s.style.fontWeight = "bold";
      }, c.appendChild(s), r.children && o(r.children, c), l.appendChild(c);
    }
    a.appendChild(l);
  }
  document.getElementById("move-ok").onclick = async () => {
    if (n === null) {
      alert("Select a file or folder to move.");
      return;
    }
    const i = e.replace(/\\/g, "/").split("/").pop(), a = n ? `${n}/${i}` : i;
    (await fetch("/api/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        oldPath: e,
        newPath: a
      })
    })).ok ? (g === e && (g = a, localStorage.setItem("currentPath", a)), x()) : alert("Error while moving."), t.remove();
  }, document.getElementById("move-cancel").onclick = () => {
    t.remove();
  };
}
document.getElementById("move").onclick = () => {
  const e = document.querySelector(".file.active, .folder.active");
  if (!e) {
    alert("Select a file or folder to move.");
    return;
  }
  const t = e.title, n = t.split("/").pop();
  if (j.includes(n)) {
    alert(`Cannot move protected folder: ${n}`);
    return;
  }
  ne(t);
};
document.getElementById("new-file").onclick = async () => {
  const e = prompt('Enter new file name (without ".md")');
  if (!e || e.trim() === "") return;
  const t = e.endsWith(".md") ? e : `${e}.md`, n = v ? `${v}/${t}` : t;
  fetch("/api/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      path: n,
      type: "file"
    })
  }).then(() => {
    x(), setTimeout(() => N(k(n)), 500);
  });
};
document.getElementById("new-folder").onclick = async () => {
  const e = prompt("Enter new folder name (e.g.: newfolder)");
  if (!e) return;
  const t = v ? `${v}/${e}` : e;
  fetch("/api/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      path: t,
      type: "folder"
    })
  }).then(() => x());
};
document.getElementById("delete").onclick = async () => {
  const e = document.querySelector(".file.active, .folder.active");
  if (!e) {
    alert("Select a file or folder to delete.");
    return;
  }
  const t = e.title, n = t.split("/").pop();
  if (j.includes(n)) {
    alert(`Cannot delete protected folder: ${n}`);
    return;
  }
  const o = e.classList.contains("folder"), i = o ? `Are you sure you want to delete the folder "${t}" and all its contents?` : `Are you sure you want to delete the file "${t}"?`;
  if (confirm(i))
    try {
      const a = await fetch("/api/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: t
        })
      });
      if (!a.ok) {
        const r = await a.text();
        alert(`Error while deleting: ${r}`);
        return;
      }
      L();
      let l = localStorage.getItem("currentPath");
      if (l) {
        if (o && l.startsWith(t + "/")) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), l = "";
          const r = document.getElementById("myst");
          r && (r.innerHTML = "");
        } else if (!o && l === t) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), l = "";
          const r = document.getElementById("myst");
          r && (r.innerHTML = "");
        }
      }
      x();
    } catch (a) {
      alert(`Error while deleting: ${a.message}`);
    }
};
document.getElementById("rename").onclick = async () => {
  const e = document.querySelector(".file.active, .folder.active");
  if (!e) {
    alert("Select a file or folder to rename.");
    return;
  }
  const t = e.title, n = t.split("/").pop();
  if (j.includes(n)) {
    alert(`Cannot rename protected folder: ${n}`);
    return;
  }
  const o = t.replace(/\\/g, "/"), i = o.split("/"), a = i.pop(), l = i.join("/"), r = a.endsWith(".md") ? a.replace(/\.md$/, "") : a, c = prompt("Enter new name:", r);
  if (!c || c.trim() === "" || c === r) return;
  const s = a.endsWith(".md") && !c.endsWith(".md") ? `${c}.md` : c, m = l ? `${l}/${s}` : s;
  if (!(await fetch("/api/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      oldPath: o,
      newPath: m
    })
  })).ok) {
    alert("Rename error.");
    return;
  }
  g === o && (g = m, localStorage.setItem("currentPath", m)), x();
};
x();
//# sourceMappingURL=MainOverride.js.map
