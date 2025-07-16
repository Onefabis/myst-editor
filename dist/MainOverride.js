/* empty css                           */
/* empty css                           */
import J, { defaultButtons as R } from "./MystEditor.js";
const H = {}, v = new Set(JSON.parse(localStorage.getItem("openFolders") || "[]")), M = ["_static", "_templates"];
let u = "", g = "", f = null;
const k = document.getElementById("sidebar"), D = document.getElementById("resizer");
document.getElementById("editor-panel");
const N = localStorage.getItem("sidebarWidth");
N && (k.style.width = N + "px");
D.onmousedown = function(n) {
  n.preventDefault();
  const e = n.clientX, t = k.offsetWidth;
  document.onmousemove = function(o) {
    const i = t + (o.clientX - e);
    i >= 250 && i <= 600 && (k.style.width = i + "px", localStorage.setItem("sidebarWidth", i));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function E(n) {
  return n.replace(/\\/g, "/");
}
function y() {
  fetch("/api/tree").then((n) => n.json()).then((n) => {
    P(n, document.getElementById("tree"));
    let e = localStorage.getItem("currentPath");
    e && (_(e, n) ? fetch(`/api/file?path=${encodeURIComponent(e)}`).then((t) => {
      if (!t.ok) throw new Error("File missing");
      return t.json();
    }).then(() => B(E(e))).catch(() => {
      console.warn("Last opened file not found."), localStorage.removeItem("currentPath");
    }) : (localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened")));
  });
}
function _(n, e) {
  for (const t of e)
    if (t.path === n && t.type === "file" || t.type === "folder" && t.children && _(n, t.children))
      return !0;
  return !1;
}
function O() {
  document.querySelectorAll(".file, .folder").forEach((n) => {
    n.classList.remove("active");
  });
}
function P(n, e) {
  e.innerHTML = "";
  const t = document.createElement("ul");
  for (const o of n) {
    const i = document.createElement("li"), r = document.createElement("span");
    if (r.textContent = o.name.endsWith(".md") ? o.name.replace(/\.md$/, "") : o.name, r.title = o.path, r.className = o.type, o.type === "folder") {
      if (o.name.startsWith(".") || o.name.startsWith("_"))
        continue;
      const c = document.createElement("span");
      c.textContent = "📁", c.style.marginRight = "6px", r.prepend(c);
    } else if (o.type === "file") {
      const c = document.createElement("span");
      c.textContent = "📄", c.style.marginRight = "6px", r.prepend(c);
    }
    r.onclick = (c) => {
      c.stopPropagation(), O(), r.classList.add("active");
      const l = r.querySelector("span");
      if (o.type === "file")
        B(E(o.path));
      else {
        g = o.path;
        const s = i.querySelector(".subtree");
        s.hasChildNodes() ? (s.innerHTML = "", l && (l.textContent = "📁"), v.delete(o.path), localStorage.setItem("openFolders", JSON.stringify([...v]))) : o.children && (P(o.children, s), l && (l.textContent = "📂"), v.add(o.path), localStorage.setItem("openFolders", JSON.stringify([...v])));
      }
    };
    const a = document.createElement("div");
    if (a.className = "subtree", i.appendChild(r), i.appendChild(a), t.appendChild(i), o.type === "folder" && v.has(o.path)) {
      P(o.children || [], a);
      const c = r.querySelector("span");
      c && (c.textContent = "📂");
    }
  }
  e.appendChild(t), e.addEventListener("click", (o) => {
    !o.target.closest("span.file") && !o.target.closest("span.folder") && (O(), g = "");
  });
}
async function B(n) {
  const e = await fetch(`/api/file?path=${encodeURIComponent(E(n))}`);
  if (e.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!e.ok) {
    alert(`File loading error: ${e.statusText}`);
    return;
  }
  const t = await e.json(), o = document.getElementById("myst"), i = document.createElement("div");
  i.id = "myst", i.style.flexGrow = "1", i.style.border = "1px solid #ccc", i.style.marginBottom = "0.5rem", i.style.height = "80vh", o.replaceWith(i), u = n, localStorage.setItem("currentPath", u);
  const r = new CSSStyleSheet(), a = await (await fetch("../FuroStyleOverride.css")).text();
  await r.replace(a), document.adoptedStyleSheets = [...document.adoptedStyleSheets, r];
  const c = n.split("\\").pop().split("/").pop(), l = new URLSearchParams(window.location.search), s = ["#30bced", "#60c771", "#e6aa3a", "#cbb63e", "#ee6352", "#9ac2c9", "#8acb88", "#14b2c4"], d = H ?? {};
  d.VITE_COLLAB !== "OFF" && l.get("collab");
  const m = d.VITE_WS_URL ?? l.get("collab_server"), h = l.get("room") || "0", I = l.get("username") || Math.floor(Math.random() * 1e3).toString(), C = s[Math.floor(Math.random() * s.length)];
  requestAnimationFrame(() => {
    f = J({
      templatelist: "linkedtemplatelist.json",
      initialText: t.content,
      title: c,
      additionalStyles: r,
      collaboration: {
        enabled: !0,
        commentsEnabled: !0,
        resolvingCommentsEnabled: !0,
        wsUrl: m ?? "#",
        username: I,
        room: h,
        color: C,
        mode: m ? "websocket" : "local"
      },
      includeButtons: R.concat([{
        text: "Excalidraw",
        action: () => {
          V();
        }
      }, {
        text: "💾 Save",
        action: () => {
          const T = f.editorView.v.contentDOM.editContext.text;
          fetch(`/api/file?path=${encodeURIComponent(u)}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: T
            })
          }).then(() => alert("Saved"));
        }
      }, {
        text: "🗃️ Image",
        action: () => {
          G();
        }
      }, {
        text: "Clear",
        action: () => {
          L();
        }
      }, {
        text: "H1",
        action: () => {
          z();
        }
      }, {
        text: "H2",
        action: () => {
          A();
        }
      }, {
        text: "B",
        action: () => {
          q();
        }
      }]),
      spellcheckOpts: {
        dict: "en_US",
        dictionaryPath: `${window.location.pathname}dictionaries`
      },
      syncScroll: !0
    }, i), window._mystEditor = f;
  }), localStorage.setItem("lastOpened", n);
}
function L() {
  const n = f?.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  const e = n.v.state, {
    from: t,
    to: o
  } = e.selection.main, i = e.doc.toString(), r = i.lastIndexOf(`
`, t - 1) + 1, a = i.indexOf(`
`, o), c = a === -1 ? i.length : a, l = i.slice(r, c), s = "[#*_\\s]*", d = new RegExp(`^${s}(.*?)${s}$`), m = l.match(d), h = m ? m[1] : l;
  n.v.dispatch({
    changes: {
      from: r,
      to: c,
      insert: h
    },
    selection: {
      anchor: r + h.length
    }
  }), n.v.focus();
}
function F(n) {
  const e = f?.editorView;
  if (!e) {
    alert("Editor is not ready yet.");
    return;
  }
  const t = e.v.state, {
    from: o,
    to: i
  } = t.selection.main, r = t.doc.toString(), a = r.lastIndexOf(`
`, o - 1) + 1, c = r.indexOf(`
`, i), l = c === -1 ? r.length : c, d = r.slice(a, l).replace(/^[#*_ \t]+|[#*_ \t]+$/g, ""), m = n + d;
  e.v.dispatch({
    changes: {
      from: a,
      to: l,
      insert: m
    },
    selection: {
      anchor: a + m.length
    }
  }), e.v.focus();
}
function z() {
  L(), F("# ");
}
function A() {
  L(), F("## ");
}
function q() {
  const n = f?.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  const e = n.v.state, {
    from: t,
    to: o
  } = e.selection.main;
  if (t === o) {
    alert("Please select text to bold.");
    return;
  }
  const a = `**${e.doc.toString().slice(t, o)}**`;
  n.v.dispatch({
    changes: {
      from: t,
      to: o,
      insert: a
    },
    selection: {
      anchor: t + a.length
    }
  }), n.v.focus();
}
let p = null, w = null, b = null, x = "";
async function V() {
  const n = f?.editorView;
  if (!n) {
    alert("Editor is not ready yet.");
    return;
  }
  const e = n.v.state, {
    from: t,
    to: o
  } = e.selection.main, r = e.doc.sliceString(t, o).match(/<img[^>]*src="([^"]+)"[^>]*>|!\[[^\]]*\]\(([^)]+)\)/), a = r?.[1] || r?.[2];
  if (!a) {
    alert("No image selected.");
    return;
  }
  const l = await (await fetch(a)).blob(), s = await new Promise((j, U) => {
    const S = new FileReader();
    S.onloadend = () => j(S.result.split(",")[1]), S.onerror = U, S.readAsDataURL(l);
  }), d = crypto.randomUUID(), m = Date.now(), h = [{
    id: crypto.randomUUID(),
    type: "image",
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    angle: 0,
    fileId: d,
    status: "saved",
    seed: Math.floor(Math.random() * 1e5),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e8),
    isDeleted: !1,
    updated: m,
    scale: [1, 1]
  }], I = {
    backgroundColor: "#ffffff"
  }, C = {
    [d]: {
      mimeType: l.type,
      id: d,
      dataURL: `data:${l.type};base64,${s}`,
      created: m
    }
  }, T = X(h, I), W = {
    ...JSON.parse(T),
    files: C
    // Include files separately
  };
  await navigator.clipboard.writeText(JSON.stringify(W)), alert("Copied image to clipboard as Excalidraw scene!");
}
function X(n, e) {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "myst",
    elements: n,
    appState: e
  });
}
function G() {
  if (!p) {
    p = document.createElement("div"), p.id = "image-picker-modal", p.style = `
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
    `, p.innerHTML = `
      <div id="image-picker-folder-list" style="width: 30%; overflow-y: auto; border-right: 1px solid #ccc; padding: 10px; box-sizing: border-box;"></div>
      <div id="image-picker-image-list" style="flex-grow: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px;"></div>
      <button id="image-picker-close" style="width: 28px; padding: 0; margin: 0; position: absolute; top: 8px; right: 12px; font-size: 20px; cursor: pointer; background: transparent; border: none;">✖</button>
    `, document.body.appendChild(p), w = document.getElementById("image-picker-folder-list"), b = document.getElementById("image-picker-image-list");
    const n = document.getElementById("image-picker-close");
    n.onclick = () => {
      p.style.display = "none";
    };
  }
  p.style.display = "flex", x = "", $("");
}
function K(n) {
  const e = n.startsWith("_static") ? `![image](/_static/${n.split("/").slice(1).join("/")})` : `![image](${n.split("/").pop()})`, t = f?.editorView;
  if (!t) {
    alert("Editor is not ready yet.");
    return;
  }
  t.v;
  const o = t.v.contentDOM.editContext.selectionStart, i = t.v.contentDOM.editContext.selectionEnd;
  t.v.dispatch({
    changes: {
      from: o,
      to: i,
      insert: e
    },
    selection: {
      anchor: o + e.length
    }
  }), t.v.focus();
}
function Q(n) {
  if (!(!w || !b) && (w.innerHTML = "", b.innerHTML = "", n.filter((e) => e.type === "folder").forEach((e) => {
    const t = document.createElement("div");
    t.textContent = "📁 " + e.name, t.style.cursor = "pointer", t.style.padding = "4px", t.style.userSelect = "none", t.onclick = () => {
      x = e.path, $(e.path);
    }, w.appendChild(t);
  }), n.filter((e) => e.type === "file").forEach((e) => {
    const t = document.createElement("img");
    t.src = `/source/${e.path}`, t.style.width = "100px", t.style.height = "fit-content", t.style.cursor = "pointer", t.title = e.name, t.alt = e.name, t.onclick = () => {
      K(e.path), p.style.display = "none";
    }, b.appendChild(t);
  }), x)) {
    const e = x.split("/").slice(0, -1).join("/"), t = document.createElement("div");
    t.textContent = "⬆️ .. (up one folder)", t.style.cursor = "pointer", t.style.padding = "4px", t.style.userSelect = "none", t.style.fontWeight = "bold", t.onclick = () => {
      x = e, $(e);
    }, w.prepend(t);
  }
}
async function $(n) {
  try {
    const e = await fetch(`/api/images_in_folder?folder=${encodeURIComponent(n)}`);
    if (!e.ok) {
      alert("Failed to load list of images/folders");
      return;
    }
    const t = await e.json();
    Q(t);
  } catch (e) {
    alert("Error: " + e.message);
  }
}
function Y(n) {
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
    o([{
      type: "folder",
      name: "root",
      path: "",
      children: i
    }], r);
  });
  function o(i, r) {
    const a = document.createElement("ul");
    for (const c of i) {
      if (c.type !== "folder") continue;
      const l = document.createElement("li"), s = document.createElement("div");
      s.textContent = "📁 " + c.name, s.style.cursor = "pointer", s.onclick = () => {
        t = c.path.replace(/\\/g, "/"), document.querySelectorAll("#move-tree div").forEach((d) => d.style.fontWeight = "normal"), s.style.fontWeight = "bold";
      }, l.appendChild(s), c.children && o(c.children, l), a.appendChild(l);
    }
    r.appendChild(a);
  }
  document.getElementById("move-ok").onclick = async () => {
    if (t === null) {
      alert("Select a file or folder to move.");
      return;
    }
    const i = n.replace(/\\/g, "/").split("/").pop(), r = t ? `${t}/${i}` : i;
    (await fetch("/api/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        oldPath: n,
        newPath: r
      })
    })).ok ? (u === n && (u = r, localStorage.setItem("currentPath", r)), y()) : alert("Error while moving."), e.remove();
  }, document.getElementById("move-cancel").onclick = () => {
    e.remove();
  };
}
document.getElementById("move").onclick = () => {
  const n = document.querySelector(".file.active, .folder.active");
  if (!n) {
    alert("Select a file or folder to move.");
    return;
  }
  const e = n.title, t = e.split("/").pop();
  if (M.includes(t)) {
    alert(`Cannot move protected folder: ${t}`);
    return;
  }
  Y(e);
};
document.getElementById("new-file").onclick = async () => {
  const n = prompt('Enter new file name (without ".md")');
  if (!n || n.trim() === "") return;
  const e = n.endsWith(".md") ? n : `${n}.md`, t = g ? `${g}/${e}` : e;
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
    y(), setTimeout(() => B(E(t)), 500);
  });
};
document.getElementById("new-folder").onclick = async () => {
  const n = prompt("Enter new folder name (e.g.: newfolder)");
  if (!n) return;
  const e = g ? `${g}/${n}` : n;
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
  const n = document.querySelector(".file.active, .folder.active");
  if (!n) {
    alert("Select a file or folder to delete.");
    return;
  }
  const e = n.title, t = e.split("/").pop();
  if (M.includes(t)) {
    alert(`Cannot delete protected folder: ${t}`);
    return;
  }
  const o = n.classList.contains("folder"), i = o ? `Are you sure you want to delete the folder "${e}" and all its contents?` : `Are you sure you want to delete the file "${e}"?`;
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
      O();
      let a = localStorage.getItem("currentPath");
      if (a) {
        if (o && a.startsWith(e + "/")) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), a = "";
          const c = document.getElementById("myst");
          c && (c.innerHTML = "");
        } else if (!o && a === e) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), a = "";
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
  const n = document.querySelector(".file.active, .folder.active");
  if (!n) {
    alert("Select a file or folder to rename.");
    return;
  }
  const e = n.title, t = e.split("/").pop();
  if (M.includes(t)) {
    alert(`Cannot rename protected folder: ${t}`);
    return;
  }
  const o = e.replace(/\\/g, "/"), i = o.split("/"), r = i.pop(), a = i.join("/"), c = r.endsWith(".md") ? r.replace(/\.md$/, "") : r, l = prompt("Enter new name:", c);
  if (!l || l.trim() === "" || l === c) return;
  const s = r.endsWith(".md") && !l.endsWith(".md") ? `${l}.md` : l, d = a ? `${a}/${s}` : s;
  if (!(await fetch("/api/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      oldPath: o,
      newPath: d
    })
  })).ok) {
    alert("Rename error.");
    return;
  }
  u === o && (u = d, localStorage.setItem("currentPath", d)), y();
};
y();
//# sourceMappingURL=MainOverride.js.map
