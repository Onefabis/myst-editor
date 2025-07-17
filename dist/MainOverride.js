/* empty css                           */
/* empty css                           */
import J, { defaultButtons as R } from "./MystEditor.js";
const v = new Set(JSON.parse(localStorage.getItem("openFolders") || "[]")), L = ["_static", "_templates"];
let u = "", g = "", d = null;
const O = document.getElementById("sidebar"), H = document.getElementById("resizer");
document.getElementById("editor-panel");
const F = localStorage.getItem("sidebarWidth");
F && (O.style.width = F + "px");
H.onmousedown = function(o) {
  o.preventDefault();
  const e = o.clientX, t = O.offsetWidth;
  document.onmousemove = function(n) {
    const i = t + (n.clientX - e);
    i >= 250 && i <= 600 && (O.style.width = i + "px", localStorage.setItem("sidebarWidth", i));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function C(o) {
  return o.replace(/\\/g, "/");
}
function y() {
  fetch("/api/tree").then((o) => o.json()).then((o) => {
    $(o, document.getElementById("tree"));
    let e = localStorage.getItem("currentPath");
    e && (W(e, o) ? fetch(`/api/file?path=${encodeURIComponent(e)}`).then((t) => {
      if (!t.ok) throw new Error("File missing");
      return t.json();
    }).then(() => N(C(e))).catch(() => {
      console.warn("Last opened file not found."), localStorage.removeItem("currentPath");
    }) : (localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened")));
  });
}
function W(o, e) {
  for (const t of e)
    if (t.path === o && t.type === "file" || t.type === "folder" && t.children && W(o, t.children))
      return !0;
  return !1;
}
function P() {
  document.querySelectorAll(".file, .folder").forEach((o) => {
    o.classList.remove("active");
  });
}
function $(o, e) {
  e.innerHTML = "";
  const t = document.createElement("ul");
  for (const n of o) {
    const i = document.createElement("li"), r = document.createElement("span");
    if (r.textContent = n.name.endsWith(".md") ? n.name.replace(/\.md$/, "") : n.name, r.title = n.path, r.className = n.type, n.type === "folder") {
      if (n.name.startsWith(".") || n.name.startsWith("_"))
        continue;
      const c = document.createElement("span");
      c.textContent = "📁", c.style.marginRight = "6px", r.prepend(c);
    } else if (n.type === "file") {
      const c = document.createElement("span");
      c.textContent = "📄", c.style.marginRight = "6px", r.prepend(c);
    }
    r.onclick = (c) => {
      c.stopPropagation(), P(), r.classList.add("active");
      const a = r.querySelector("span");
      if (n.type === "file")
        N(C(n.path));
      else {
        g = n.path;
        const s = i.querySelector(".subtree");
        s.hasChildNodes() ? (s.innerHTML = "", a && (a.textContent = "📁"), v.delete(n.path), localStorage.setItem("openFolders", JSON.stringify([...v]))) : n.children && ($(n.children, s), a && (a.textContent = "📂"), v.add(n.path), localStorage.setItem("openFolders", JSON.stringify([...v])));
      }
    };
    const l = document.createElement("div");
    if (l.className = "subtree", i.appendChild(r), i.appendChild(l), t.appendChild(i), n.type === "folder" && v.has(n.path)) {
      $(n.children || [], l);
      const c = r.querySelector("span");
      c && (c.textContent = "📂");
    }
  }
  e.appendChild(t), e.addEventListener("click", (n) => {
    !n.target.closest("span.file") && !n.target.closest("span.folder") && (P(), g = "");
  });
}
async function N(o) {
  var S;
  const e = await fetch(`/api/file?path=${encodeURIComponent(C(o))}`);
  if (e.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!e.ok) {
    alert(`File loading error: ${e.statusText}`);
    return;
  }
  const t = await e.json(), n = document.getElementById("myst"), i = document.createElement("div");
  i.id = "myst", i.style.flexGrow = "1", i.style.border = "1px solid #ccc", i.style.marginBottom = "0.5rem", i.style.height = "80vh", n.replaceWith(i), u = o, localStorage.setItem("currentPath", u);
  const r = new CSSStyleSheet(), l = await (await fetch("../FuroStyleOverride.css")).text();
  await r.replace(l), document.adoptedStyleSheets = [...document.adoptedStyleSheets, r];
  const c = o.split("\\").pop().split("/").pop(), a = new URLSearchParams(window.location.search), s = ["#30bced", "#60c771", "#e6aa3a", "#cbb63e", "#ee6352", "#9ac2c9", "#8acb88", "#14b2c4"], m = ((S = import.meta) == null ? void 0 : S.env) ?? {};
  m.VITE_COLLAB !== "OFF" && a.get("collab");
  const p = m.VITE_WS_URL ?? a.get("collab_server"), h = a.get("room") || "0", T = a.get("username") || Math.floor(Math.random() * 1e3).toString(), k = s[Math.floor(Math.random() * s.length)];
  requestAnimationFrame(() => {
    d = J({
      templatelist: "linkedtemplatelist.json",
      initialText: t.content,
      title: c,
      additionalStyles: r,
      collaboration: {
        enabled: !0,
        commentsEnabled: !0,
        resolvingCommentsEnabled: !0,
        wsUrl: p ?? "#",
        username: T,
        room: h,
        color: k,
        mode: p ? "websocket" : "local"
      },
      includeButtons: R.concat([{
        text: "Excalidraw",
        action: () => {
          q();
        }
      }, {
        text: "💾 Save",
        action: () => {
          const I = d.editorView.v.contentDOM.editContext.text;
          fetch(`/api/file?path=${encodeURIComponent(u)}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: I
            })
          }).then(() => alert("Saved"));
        }
      }, {
        text: "🗃️ Image",
        action: () => {
          X();
        }
      }, {
        text: "Clear",
        action: () => {
          M();
        }
      }, {
        text: "H1",
        action: () => {
          D();
        }
      }, {
        text: "H2",
        action: () => {
          z();
        }
      }, {
        text: "B",
        action: () => {
          A();
        }
      }]),
      spellcheckOpts: {
        dict: "en_US",
        dictionaryPath: `${window.location.pathname}dictionaries`
      },
      syncScroll: !0
    }, i), window._mystEditor = d;
  }), localStorage.setItem("lastOpened", o);
}
function M() {
  const o = d == null ? void 0 : d.editorView;
  if (!o) {
    alert("Editor is not ready yet.");
    return;
  }
  const e = o.v.state, {
    from: t,
    to: n
  } = e.selection.main, i = e.doc.toString(), r = i.lastIndexOf(`
`, t - 1) + 1, l = i.indexOf(`
`, n), c = l === -1 ? i.length : l, a = i.slice(r, c), s = "[#*_\\s]*", m = new RegExp(`^${s}(.*?)${s}$`), p = a.match(m), h = p ? p[1] : a;
  o.v.dispatch({
    changes: {
      from: r,
      to: c,
      insert: h
    },
    selection: {
      anchor: r + h.length
    }
  }), o.v.focus();
}
function _(o) {
  const e = d == null ? void 0 : d.editorView;
  if (!e) {
    alert("Editor is not ready yet.");
    return;
  }
  const t = e.v.state, {
    from: n,
    to: i
  } = t.selection.main, r = t.doc.toString(), l = r.lastIndexOf(`
`, n - 1) + 1, c = r.indexOf(`
`, i), a = c === -1 ? r.length : c, m = r.slice(l, a).replace(/^[#*_ \t]+|[#*_ \t]+$/g, ""), p = o + m;
  e.v.dispatch({
    changes: {
      from: l,
      to: a,
      insert: p
    },
    selection: {
      anchor: l + p.length
    }
  }), e.v.focus();
}
function D() {
  M(), _("# ");
}
function z() {
  M(), _("## ");
}
function A() {
  const o = d == null ? void 0 : d.editorView;
  if (!o) {
    alert("Editor is not ready yet.");
    return;
  }
  const e = o.v.state, {
    from: t,
    to: n
  } = e.selection.main;
  if (t === n) {
    alert("Please select text to bold.");
    return;
  }
  const l = `**${e.doc.toString().slice(t, n)}**`;
  o.v.dispatch({
    changes: {
      from: t,
      to: n,
      insert: l
    },
    selection: {
      anchor: t + l.length
    }
  }), o.v.focus();
}
let f = null, w = null, E = null, x = "";
async function q() {
  const o = d == null ? void 0 : d.editorView;
  if (!o) {
    alert("Editor is not ready yet.");
    return;
  }
  const e = o.v.state, {
    from: t,
    to: n
  } = e.selection.main, r = e.doc.sliceString(t, n).match(/<img[^>]*src="([^"]+)"[^>]*>|!\[[^\]]*\]\(([^)]+)\)/), l = (r == null ? void 0 : r[1]) || (r == null ? void 0 : r[2]);
  if (!l) {
    alert("No image selected.");
    return;
  }
  const a = await (await fetch(l)).blob(), s = await new Promise((j, U) => {
    const b = new FileReader();
    b.onloadend = () => j(b.result.split(",")[1]), b.onerror = U, b.readAsDataURL(a);
  }), m = crypto.randomUUID(), p = Date.now(), h = [{
    id: crypto.randomUUID(),
    type: "image",
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    angle: 0,
    fileId: m,
    status: "saved",
    seed: Math.floor(Math.random() * 1e5),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e8),
    isDeleted: !1,
    updated: p,
    scale: [1, 1]
  }], T = {
    backgroundColor: "#ffffff"
  }, k = {
    [m]: {
      mimeType: a.type,
      id: m,
      dataURL: `data:${a.type};base64,${s}`,
      created: p
    }
  }, S = V(h, T), I = {
    ...JSON.parse(S),
    files: k
    // Include files separately
  };
  await navigator.clipboard.writeText(JSON.stringify(I)), alert("Copied image to clipboard as Excalidraw scene!");
}
function V(o, e) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "myst",
    elements: o,
    appState: e
  });
}
function X() {
  if (!f) {
    f = document.createElement("div"), f.id = "image-picker-modal", f.style = `
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
    `, f.innerHTML = `
      <div id="image-picker-folder-list" style="width: 30%; overflow-y: auto; border-right: 1px solid #ccc; padding: 10px; box-sizing: border-box;"></div>
      <div id="image-picker-image-list" style="flex-grow: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px;"></div>
      <button id="image-picker-close" style="width: 28px; padding: 0; margin: 0; position: absolute; top: 8px; right: 12px; font-size: 20px; cursor: pointer; background: transparent; border: none;">✖</button>
    `, document.body.appendChild(f), w = document.getElementById("image-picker-folder-list"), E = document.getElementById("image-picker-image-list");
    const o = document.getElementById("image-picker-close");
    o.onclick = () => {
      f.style.display = "none";
    };
  }
  f.style.display = "flex", x = "", B("");
}
function G(o) {
  const e = o.startsWith("_static") ? `![image](/_static/${o.split("/").slice(1).join("/")})` : `![image](${o.split("/").pop()})`, t = d == null ? void 0 : d.editorView;
  if (!t) {
    alert("Editor is not ready yet.");
    return;
  }
  t.v;
  const n = t.v.contentDOM.editContext.selectionStart, i = t.v.contentDOM.editContext.selectionEnd;
  t.v.dispatch({
    changes: {
      from: n,
      to: i,
      insert: e
    },
    selection: {
      anchor: n + e.length
    }
  }), t.v.focus();
}
function K(o) {
  if (!(!w || !E) && (w.innerHTML = "", E.innerHTML = "", o.filter((e) => e.type === "folder").forEach((e) => {
    const t = document.createElement("div");
    t.textContent = "📁 " + e.name, t.style.cursor = "pointer", t.style.padding = "4px", t.style.userSelect = "none", t.onclick = () => {
      x = e.path, B(e.path);
    }, w.appendChild(t);
  }), o.filter((e) => e.type === "file").forEach((e) => {
    const t = document.createElement("img");
    t.src = `/source/${e.path}`, t.style.width = "100px", t.style.height = "fit-content", t.style.cursor = "pointer", t.title = e.name, t.alt = e.name, t.onclick = () => {
      G(e.path), f.style.display = "none";
    }, E.appendChild(t);
  }), x)) {
    const e = x.split("/").slice(0, -1).join("/"), t = document.createElement("div");
    t.textContent = "⬆️ .. (up one folder)", t.style.cursor = "pointer", t.style.padding = "4px", t.style.userSelect = "none", t.style.fontWeight = "bold", t.onclick = () => {
      x = e, B(e);
    }, w.prepend(t);
  }
}
async function B(o) {
  try {
    const e = await fetch(`/api/images_in_folder?folder=${encodeURIComponent(o)}`);
    if (!e.ok) {
      alert("Failed to load list of images/folders");
      return;
    }
    const t = await e.json();
    K(t);
  } catch (e) {
    alert("Error: " + e.message);
  }
}
function Q(o) {
  const e = document.createElement("div");
  e.style = `
    position: fixed;
    top: 20%; left: 30%;
    width: 40%; height: 50%;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
    z-index: 10000;
    padding: 1rem;
    overflow-y: auto;
  `, e.innerHTML = `<h3>Select folder to move to</h3>
    <div id="move-tree" style="display: block; width:100%; height: 80%;"></div>
    <div style="text-align: right; margin-top: 10px;">
      <button id="move-cancel">❌ Cancel</button>
      <button id="move-ok">✅ OK</button>
    </div>`, document.body.appendChild(e);
  let t = "";
  fetch("/api/tree").then((i) => i.json()).then((i) => {
    const r = document.getElementById("move-tree");
    n([{
      type: "folder",
      name: "root",
      path: "",
      children: i
    }], r);
  });
  function n(i, r) {
    const l = document.createElement("ul");
    for (const c of i) {
      if (c.type !== "folder") continue;
      const a = document.createElement("li"), s = document.createElement("div");
      s.textContent = "📁 " + c.name, s.style.cursor = "pointer", s.onclick = () => {
        t = c.path.replace(/\\/g, "/"), document.querySelectorAll("#move-tree div").forEach((m) => m.style.fontWeight = "normal"), s.style.fontWeight = "bold";
      }, a.appendChild(s), c.children && n(c.children, a), l.appendChild(a);
    }
    r.appendChild(l);
  }
  document.getElementById("move-ok").onclick = async () => {
    if (t === null) {
      alert("Select a file or folder to move.");
      return;
    }
    const i = o.replace(/\\/g, "/").split("/").pop(), r = t ? `${t}/${i}` : i;
    (await fetch("/api/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        oldPath: o,
        newPath: r
      })
    })).ok ? (u === o && (u = r, localStorage.setItem("currentPath", r)), y()) : alert("Error while moving."), e.remove();
  }, document.getElementById("move-cancel").onclick = () => {
    e.remove();
  };
}
document.getElementById("move").onclick = () => {
  const o = document.querySelector(".file.active, .folder.active");
  if (!o) {
    alert("Select a file or folder to move.");
    return;
  }
  const e = o.title, t = e.split("/").pop();
  if (L.includes(t)) {
    alert(`Cannot move protected folder: ${t}`);
    return;
  }
  Q(e);
};
document.getElementById("new-file").onclick = async () => {
  const o = prompt('Enter new file name (without ".md")');
  if (!o || o.trim() === "") return;
  const e = o.endsWith(".md") ? o : `${o}.md`, t = g ? `${g}/${e}` : e;
  fetch("/api/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      path: t,
      type: "file"
    })
  }).then(() => {
    y(), setTimeout(() => N(C(t)), 500);
  });
};
document.getElementById("new-folder").onclick = async () => {
  const o = prompt("Enter new folder name (e.g.: newfolder)");
  if (!o) return;
  const e = g ? `${g}/${o}` : o;
  fetch("/api/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      path: e,
      type: "folder"
    })
  }).then(() => y());
};
document.getElementById("delete").onclick = async () => {
  const o = document.querySelector(".file.active, .folder.active");
  if (!o) {
    alert("Select a file or folder to delete.");
    return;
  }
  const e = o.title, t = e.split("/").pop();
  if (L.includes(t)) {
    alert(`Cannot delete protected folder: ${t}`);
    return;
  }
  const n = o.classList.contains("folder"), i = n ? `Are you sure you want to delete the folder "${e}" and all its contents?` : `Are you sure you want to delete the file "${e}"?`;
  if (confirm(i))
    try {
      const r = await fetch("/api/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: e
        })
      });
      if (!r.ok) {
        const c = await r.text();
        alert(`Error while deleting: ${c}`);
        return;
      }
      P();
      let l = localStorage.getItem("currentPath");
      if (l) {
        if (n && l.startsWith(e + "/")) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), l = "";
          const c = document.getElementById("myst");
          c && (c.innerHTML = "");
        } else if (!n && l === e) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), l = "";
          const c = document.getElementById("myst");
          c && (c.innerHTML = "");
        }
      }
      y();
    } catch (r) {
      alert(`Error while deleting: ${r.message}`);
    }
};
document.getElementById("rename").onclick = async () => {
  const o = document.querySelector(".file.active, .folder.active");
  if (!o) {
    alert("Select a file or folder to rename.");
    return;
  }
  const e = o.title, t = e.split("/").pop();
  if (L.includes(t)) {
    alert(`Cannot rename protected folder: ${t}`);
    return;
  }
  const n = e.replace(/\\/g, "/"), i = n.split("/"), r = i.pop(), l = i.join("/"), c = r.endsWith(".md") ? r.replace(/\.md$/, "") : r, a = prompt("Enter new name:", c);
  if (!a || a.trim() === "" || a === c) return;
  const s = r.endsWith(".md") && !a.endsWith(".md") ? `${a}.md` : a, m = l ? `${l}/${s}` : s;
  if (!(await fetch("/api/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      oldPath: n,
      newPath: m
    })
  })).ok) {
    alert("Rename error.");
    return;
  }
  u === n && (u = m, localStorage.setItem("currentPath", m)), y();
};
y();
//# sourceMappingURL=MainOverride.js.map
