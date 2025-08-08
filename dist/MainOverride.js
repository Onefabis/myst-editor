/* empty css                           */
/* empty css                           */
import { M as Z, d as ee, s as z, a as te, b as ne, c as J } from "./MystEditor-6TrRYQ_f.js";
const S = new Set(JSON.parse(localStorage.getItem("openFolders") || "[]")), N = ["_static", "_templates"];
let x = "", v = "", d = null;
const $ = document.getElementById("sidebar"), oe = document.getElementById("resizer");
document.getElementById("editor-panel");
const V = localStorage.getItem("sidebarWidth");
V && ($.style.width = V + "px");
oe.onmousedown = function(e) {
  e.preventDefault();
  const t = e.clientX, n = $.offsetWidth;
  document.onmousemove = function(a) {
    const l = n + (a.clientX - t);
    l >= 250 && l <= 600 && ($.style.width = l + "px", localStorage.setItem("sidebarWidth", l));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function C(e) {
  return e.replace(/\\/g, "/");
}
function w() {
  fetch("/api/tree").then((e) => e.json()).then((e) => {
    M(e, document.getElementById("tree"));
    let t = localStorage.getItem("currentPath");
    t && (U(t, e) ? fetch(`/api/file?path=${encodeURIComponent(t)}`).then((n) => {
      if (!n.ok) throw new Error("File missing");
      return n.json();
    }).then(() => W(C(t))).catch(() => {
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
function _() {
  document.querySelectorAll(".file, .folder").forEach((e) => {
    e.classList.remove("active");
  });
}
function M(e, t) {
  t.innerHTML = "";
  const n = document.createElement("ul");
  for (const a of e) {
    const l = document.createElement("li"), s = document.createElement("span");
    if (s.textContent = a.name.endsWith(".md") ? a.name.replace(/\.md$/, "") : a.name, s.title = a.path, s.className = a.type, a.type === "folder") {
      if (a.name.startsWith(".") || a.name.startsWith("_"))
        continue;
      const o = document.createElement("span");
      o.textContent = "📁", o.style.marginRight = "6px", s.prepend(o);
    } else if (a.type === "file") {
      const o = document.createElement("span");
      o.textContent = "📄", o.style.marginRight = "6px", s.prepend(o);
    }
    s.onclick = (o) => {
      o.stopPropagation(), _(), s.classList.add("active");
      const r = s.querySelector("span");
      if (a.type === "file")
        se(C(a.path)), ie(), W(C(a.path));
      else {
        v = a.path;
        const c = l.querySelector(".subtree");
        c.hasChildNodes() ? (c.innerHTML = "", r && (r.textContent = "📁"), S.delete(a.path), localStorage.setItem("openFolders", JSON.stringify([...S]))) : a.children && (M(a.children, c), r && (r.textContent = "📂"), S.add(a.path), localStorage.setItem("openFolders", JSON.stringify([...S])));
      }
    };
    const i = document.createElement("div");
    if (i.className = "subtree", l.appendChild(s), l.appendChild(i), n.appendChild(l), a.type === "folder" && S.has(a.path)) {
      M(a.children || [], i);
      const o = s.querySelector("span");
      o && (o.textContent = "📂");
    }
  }
  t.appendChild(n), t.addEventListener("click", (a) => {
    !a.target.closest("span.file") && !a.target.closest("span.folder") && (_(), v = "");
  });
}
function ie() {
  const e = document.getElementById("branchDropdown"), t = document.getElementById("commitDropdown");
  e && e.addEventListener("change", () => {
    window.reloadGitDiff && window.reloadGitDiff();
  }), t && t.addEventListener("change", () => {
    window.reloadGitDiff && window.reloadGitDiff();
  });
}
const D = document.getElementById("tree-panel"), le = document.querySelector(".resizer-vertical");
document.getElementById("gitPanel");
le.onmousedown = function(e) {
  e.preventDefault();
  const t = e.clientY, n = D.offsetHeight;
  document.onmousemove = function(a) {
    const l = n + (a.clientY - t);
    l >= 100 && (D.style.height = l + "px", localStorage.setItem("fileTreeHeight", l));
  }, document.onmouseup = function() {
    document.onmousemove = null, document.onmouseup = null;
  };
};
function ae(e) {
  const t = document.getElementById("hidden-filename");
  t && (t.value = e);
}
const q = localStorage.getItem("fileTreeHeight");
q && (D.style.height = q + "px");
document.getElementById("branch-select");
document.getElementById("commit-select");
document.getElementById("commit-details");
async function se(e) {
  const t = document.getElementById("branchDropdown"), n = document.getElementById("commitDropdown"), a = document.getElementById("commitDetails");
  t.innerHTML = "", n.innerHTML = "", a.innerText = "";
  const s = await (await fetch("/search-file", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: e
    })
  })).json();
  ae(e), s.branches.forEach((i) => {
    const o = document.createElement("option");
    o.value = i, o.innerText = i, t.appendChild(o);
  }), s.commits.forEach((i) => {
    const o = document.createElement("option");
    o.value = i.hash, o.innerText = i.summary || i.hash, o.dataset.message = i.message, n.appendChild(o);
  }), n.onchange = function() {
    const i = n.options[n.selectedIndex];
    a.innerText = i.dataset.message || "";
  }, n.options.length && (n.selectedIndex = 0, n.onchange());
}
async function W(e) {
  var p;
  d && d.editorView.v.contentDOM.editContext.text !== H && await L();
  const t = await fetch(`/api/file?path=${encodeURIComponent(C(e))}`);
  if (t.status === 404) {
    console.warn("Last opened file not found."), localStorage.removeItem("lastOpened");
    return;
  }
  if (!t.ok) {
    alert(`File loading error: ${t.statusText}`);
    return;
  }
  const n = await t.json(), a = document.getElementById("myst"), l = document.createElement("div");
  l.id = "myst", l.style.flexGrow = "1", l.style.border = "1px solid #ccc", l.style.marginBottom = "0.5rem", l.style.height = "80vh", a.replaceWith(l), x = e, localStorage.setItem("currentPath", x);
  const s = new CSSStyleSheet(), i = await (await fetch("../FuroStyleOverride.css")).text();
  await s.replace(i), document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
  const o = e.split("\\").pop().split("/").pop(), r = new URLSearchParams(window.location.search), c = ((p = import.meta) == null ? void 0 : p.env) ?? {};
  c.VITE_COLLAB !== "OFF" && r.get("collab"), c.VITE_WS_URL ?? r.get("collab_server"), r.get("room"), r.get("username") || Math.floor(Math.random() * 1e3).toString(), requestAnimationFrame(() => {
    d = Z({
      templatelist: "linkedtemplatelist.json",
      initialText: n.content,
      title: o,
      additionalStyles: s,
      includeButtons: ee.concat([{
        text: "💾 Save",
        action: () => {
          L(!0);
        }
      }, {
        text: "🗃️ Image",
        action: () => {
          ue();
        }
      }, {
        text: "Clear",
        action: () => {
          R();
        }
      }, {
        text: "H1",
        action: () => {
          de();
        }
      }, {
        text: "H2",
        action: () => {
          pe();
        }
      }, {
        text: "B",
        action: () => {
          me();
        }
      }]),
      // spellcheckOpts: { dict: "en_US", dictionaryPath: `${window.location.pathname}dictionaries` },
      spellcheckOpts: !1,
      syncScroll: !0
    }, l), window._mystEditor = d, H = n.content, O && clearInterval(O), O = setInterval(() => {
      L();
    }, 60 * 1e3);
  }), localStorage.setItem("lastOpened", e);
}
let H = "", O = null;
async function L(e = !1) {
  const t = d == null ? void 0 : d.editorView;
  if (!t) {
    e && alert("Editor is not ready.");
    return;
  }
  const n = t.v.contentDOM.editContext.text;
  try {
    await fetch(`/api/file?path=${encodeURIComponent(x)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: n
      })
    }), H = n, e && alert("Saved");
  } catch (a) {
    e && alert("Save failed: " + a.message);
  }
}
function re() {
  const e = document.createElement("div");
  e.id = "upload-image-modal", e.style.position = "fixed", e.style.inset = "0", e.style.background = "rgba(0,0,0,0.4)", e.style.display = "flex", e.style.alignItems = "center", e.style.justifyContent = "center", e.style.zIndex = "2000", e.style.display = "none";
  const t = document.createElement("div");
  t.style.position = "relative", t.style.background = "white", t.style.padding = "14px", t.style.borderRadius = "7px", t.style.minWidth = "320px", t.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  const n = document.createElement("div");
  n.innerHTML = "&times;", n.style.position = "absolute", n.style.top = "-11px", n.style.right = "-11px", n.style.width = "25px", n.style.height = "25px", n.style.background = "rgb(209 29 24)", n.style.color = "white", n.style.borderRadius = "50%", n.style.display = "flex", n.style.alignItems = "center", n.style.justifyContent = "center", n.style.cursor = "pointer", n.style.fontWeight = "bold", n.style.fontSize = "18px";
  const a = document.createElement("h3");
  a.textContent = "Name Image", a.style.margin = "0 0 10px 0";
  const l = document.createElement("input");
  l.type = "text", l.style.width = "98%", l.style.lineHeight = "22px", l.style.margin = "0 0 12px", l.style.border = "1px solid rgb(219 209 209)", l.style.borderRadius = "3px", l.style.outline = "none";
  const s = document.createElement("div");
  s.style.display = "grid", s.style.gridTemplateColumns = "1fr 1fr", s.style.gap = "8px";
  const i = document.createElement("button");
  i.textContent = "Name", i.style.padding = "6px 8px", i.style.border = "1px dashed rgb(92, 184, 92)", i.style.borderLeft = "3px solid rgb(92, 184, 92)", i.style.borderRadius = "6px", i.style.cursor = "pointer";
  const o = document.createElement("button");
  o.textContent = "Increment", o.style.padding = "6px 8px", o.style.border = "1px dashed rgb(2, 117, 216)", o.style.borderLeft = "3px solid rgb(2, 117, 216)", o.style.borderRadius = "6px", o.style.cursor = "pointer", o.style.display = "none";
  const r = document.createElement("button");
  return r.textContent = "Overwrite", r.style.padding = "6px 8px", r.style.border = "1px dashed rgb(240, 173, 78)", r.style.borderLeft = "3px solid rgb(240, 173, 78)", r.style.borderRadius = "6px", r.style.cursor = "pointer", r.style.display = "none", s.appendChild(i), s.appendChild(r), s.appendChild(o), t.appendChild(n), t.appendChild(a), t.appendChild(l), t.appendChild(s), e.appendChild(t), document.body.appendChild(e), {
    modal: e,
    input: l,
    nameBtn: i,
    incrementBtn: o,
    overwriteBtn: r,
    closeBtn: n,
    title: a
  };
}
const m = re();
function ce(e, t) {
  return new Promise((n) => {
    const a = e.name.lastIndexOf("."), l = a > -1 ? e.name.substring(0, a) : e.name, s = a > -1 ? e.name.substring(a) : "";
    m.input.value = l, m.title.textContent = "Name Image", m.nameBtn.style.display = "inline-block", m.overwriteBtn.style.display = "none", m.incrementBtn.style.display = "none", m.modal.style.display = "flex", m.input.focus();
    async function i(o) {
      m.input.value.trim() + s;
      const r = new FormData();
      r.append("file", e), r.append("path", t), r.append("action", o);
      const c = await fetch("/api/upload_image", {
        method: "POST",
        body: r
      }), p = await c.json();
      c.status === 409 && p.collision ? (m.title.textContent = `Image "${m.input.value.trim()}" already exists`, m.nameBtn.style.display = "none", m.overwriteBtn.style.display = "inline-block", m.incrementBtn.style.display = "inline-block") : c.ok ? (m.modal.style.display = "none", n({
        action: o,
        savedPath: p.newPath
      })) : alert(p.error || "Upload failed");
    }
    m.nameBtn.onclick = () => i("check"), m.incrementBtn.onclick = () => i("increment"), m.overwriteBtn.onclick = () => i("overwrite"), m.closeBtn.onclick = () => {
      m.modal.style.display = "none", n(null);
    }, document.onkeydown = (o) => {
      o.key === "Enter" ? m.nameBtn.click() : o.key === "Escape" && m.closeBtn.click();
    };
  });
}
document.getElementById("upload-image").onclick = () => {
  const e = document.createElement("input");
  e.type = "file", e.accept = "image/*", e.onchange = async () => {
    const t = e.files[0];
    if (!t) return;
    const a = (localStorage.getItem("currentPath") || "").split("/");
    a.pop();
    let l = a.join("/");
    l.startsWith("/") && (l = l.slice(1));
    const i = await ce(t, l);
    i && i.savedPath && F(i.savedPath);
  }, e.click();
};
function R() {
  const e = d == null ? void 0 : d.editorView;
  if (!e) {
    alert("Editor is not ready yet.");
    return;
  }
  const t = e.v.state, {
    from: n,
    to: a
  } = t.selection.main, l = t.doc.toString(), s = l.lastIndexOf(`
`, n - 1) + 1, i = l.indexOf(`
`, a), o = i === -1 ? l.length : i, r = l.slice(s, o), c = "[#*_\\s]*", p = new RegExp(`^${c}(.*?)${c}$`), f = r.match(p), g = f ? f[1] : r;
  e.v.dispatch({
    changes: {
      from: s,
      to: o,
      insert: g
    },
    selection: {
      anchor: s + g.length
    }
  }), e.v.focus();
}
function G(e) {
  const t = d == null ? void 0 : d.editorView;
  if (!t) {
    alert("Editor is not ready yet.");
    return;
  }
  const n = t.v.state, {
    from: a,
    to: l
  } = n.selection.main, s = n.doc.toString(), i = s.lastIndexOf(`
`, a - 1) + 1, o = s.indexOf(`
`, l), r = o === -1 ? s.length : o, p = s.slice(i, r).replace(/^[#*_ \t]+|[#*_ \t]+$/g, ""), f = e + p;
  t.v.dispatch({
    changes: {
      from: i,
      to: r,
      insert: f
    },
    selection: {
      anchor: i + f.length
    }
  }), t.v.focus();
}
function de() {
  R(), G("# ");
}
function pe() {
  R(), G("## ");
}
function me() {
  const e = d == null ? void 0 : d.editorView;
  if (!e) {
    alert("Editor is not ready yet.");
    return;
  }
  const t = e.v.state, {
    from: n,
    to: a
  } = t.selection.main;
  if (n === a) {
    alert("Please select text to bold.");
    return;
  }
  const i = `**${t.doc.toString().slice(n, a)}**`;
  e.v.dispatch({
    changes: {
      from: n,
      to: a,
      insert: i
    },
    selection: {
      anchor: n + i.length
    }
  }), e.v.focus();
}
const u = document.createElement("div");
u.id = "custom-menu";
u.style.position = "fixed";
u.style.display = "none";
u.innerHTML = `
  <div class="item" id="rename_image">✍️ Rename Image</div>
  <div class="item" id="excalidraw_image">🖼️ Excalidraw Image</div>
  <div class="item" style="display: flex; align-items: center; gap: 4px;">
    <button id="ai_rephrase_btn" style="flex: 9; height: 100%;border: 0px;border-right: 1px solid gray; border-radius: 0px; background: none; padding: 0px; text-align: left; font-size: 16px;">🪄 AI Rephrase</button>
    <button id="ai_rephrase_settings" title="Settings" style="flex: 1;background: none;border: none;">⚙️</button>
  </div>
  <div class="item" id="ask_ollama">🤖 Ask Ollama</div>
`;
document.body.appendChild(u);
document.addEventListener("contextmenu", (e) => {
  const t = e.composedPath(), n = t.some((i) => {
    var o;
    return (o = i.classList) == null ? void 0 : o.contains("cm-content");
  }), a = t.some((i) => typeof i.id == "string" && i.id.startsWith("excalidraw")), l = t.some((i) => {
    var o;
    return ((o = i.classList) == null ? void 0 : o.contains("ollama-ai")) || typeof i.id == "string" && i.id === "ollama-ai";
  }), s = t.some((i) => {
    var o;
    return ((o = i.classList) == null ? void 0 : o.contains("ollama-ai-rephrase-settings")) || typeof i.id == "string" && i.id === "ollama-ai-reprhase-settings";
  });
  if (n && !a && !l && !s) {
    e.preventDefault(), u.style.display = "block", u.style.visibility = "hidden", u.style.top = "0px", u.style.left = "0px";
    const i = u.getBoundingClientRect();
    let o = e.clientX, r = e.clientY;
    o + i.width > window.innerWidth && (o = window.innerWidth - i.width), r + i.height > window.innerHeight && (r = window.innerHeight - i.height), u.style.top = `${r}px`, u.style.left = `${o}px`, u.style.visibility = "visible";
  } else
    u.style.display = "none";
});
document.addEventListener("click", () => {
  u.style.display = "none";
});
document.getElementById("excalidraw_image").addEventListener("click", async () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  const t = e.v.state, n = t.selection.main.head, a = t.doc.toString(), l = a.lastIndexOf(`
`, n - 1) + 1, s = a.indexOf(`
`, n), i = s === -1 ? a.length : s, r = a.slice(l, i).match(/!\[.*?\]\((.*?)\)/);
  if (r) {
    z(r[1], e);
    return;
  }
  const c = prompt(`No image found.
Enter name for new Excalidraw image (without extension):`);
  if (!c) return;
  const p = c.trim().replace(/\s+/g, "_");
  if (!p) return;
  const f = (localStorage.getItem("currentPath") || "").toString();
  `${f.replace(/\\/g, "/").split("/").slice(0, -1).join("/")}`;
  const Y = `${p}.png`, T = new FormData(), K = new Blob([], {
    type: "image/png"
  });
  T.append("file", K, Y), T.append("path", f);
  try {
    const b = await fetch("/api/upload_image", {
      method: "POST",
      body: T
    });
    if (!b.ok) {
      const E = await b.text();
      alert("Failed to create image: " + E);
      return;
    }
    const P = await b.json();
    console.log("📦 Backend response:", P);
    let y = P.savedPath || P.newPath;
    if (y) {
      const E = y.split("/"), A = E.findIndex((Q) => Q.endsWith(".md"));
      A !== -1 && (E.splice(A, 1), y = E.join("/"), console.log("🧼 Cleaned path:", y));
    }
    if (!y || typeof y != "string") {
      alert("Image creation failed: Invalid path returned by server.");
      return;
    }
    F(y), z(y, e);
  } catch (b) {
    alert("Image creation failed: " + b.message);
  }
});
document.getElementById("ask_ollama").addEventListener("click", () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  te(e);
});
document.getElementById("rename_image").addEventListener("click", () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  ne(e);
});
document.getElementById("ai_rephrase_btn").addEventListener("click", () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  const t = e.v.state.selection.main;
  if (t.empty) {
    alert("Please select some text first.");
    return;
  }
  J(e, {
    type: "rephrase",
    from: t.from,
    to: t.to
  });
});
document.getElementById("ai_rephrase_settings").addEventListener("click", () => {
  const e = d == null ? void 0 : d.editorView;
  if (!e) return alert("Editor not ready");
  J(e, {
    type: "settings"
  });
});
let h = null, I = null, k = null, B = "";
function ue(e = "") {
  if (!h) {
    h = document.createElement("div"), h.id = "image-picker-modal", h.style = `
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
    `, h.innerHTML = `
      <div id="image-picker-folder-list" style="width: 30%; overflow-y: auto; border-right: 1px solid #ccc; padding: 10px; box-sizing: border-box;"></div>
      <div id="image-picker-image-list" style="flex-grow: 1; overflow-y: auto; padding: 10px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px;"></div>
      <button id="image-picker-close" style="width: 28px; padding: 0; margin: 0; position: absolute; top: 8px; right: 12px; font-size: 20px; cursor: pointer; background: transparent; border: none;">✖</button>
    `, document.body.appendChild(h), I = document.getElementById("image-picker-folder-list"), k = document.getElementById("image-picker-image-list");
    const n = document.getElementById("image-picker-close");
    n.onclick = () => {
      h.style.display = "none";
    };
  }
  h.style.display = "flex", B = e, X(B);
  const t = e ? e.split("/") : [];
  fetch("/api/image_tree").then((n) => n.json()).then((n) => {
    I.innerHTML = "", j(n, I, t);
  });
}
function F(e) {
  const t = e.split("/").pop() || "", n = t.lastIndexOf("."), l = `![${n > -1 ? t.substring(0, n) : t}](/${e})`, s = d == null ? void 0 : d.editorView;
  if (!s) {
    alert("Editor is not ready yet.");
    return;
  }
  s.v;
  const i = s.v.contentDOM.editContext.selectionStart, o = s.v.contentDOM.editContext.selectionEnd;
  s.v.dispatch({
    changes: {
      from: i,
      to: o,
      insert: l
    },
    selection: {
      anchor: i + l.length
    }
  }), s.v.focus();
}
function j(e, t, n = []) {
  const a = document.createElement("ul");
  for (const l of e) {
    if (l.type !== "folder") continue;
    const s = document.createElement("li"), i = document.createElement("div");
    i.style.display = "flex", i.style.alignItems = "center";
    const o = document.createElement("span");
    o.textContent = "➕", o.style.cursor = "pointer", o.style.width = "20px";
    const r = document.createElement("span");
    r.textContent = l.name, r.style.cursor = "pointer", r.style.userSelect = "none", r.style.padding = "2px 4px", l.path === n.join("/") && (r.style.fontWeight = "bold");
    const c = document.createElement("div");
    c.style.marginLeft = "16px", c.style.display = "none";
    const p = l.path.split("/");
    n.length >= p.length && n.slice(0, p.length).join("/") === l.path && (c.style.display = "block", o.textContent = "➖"), o.onclick = () => {
      c.style.display === "none" ? (c.style.display = "block", o.textContent = "➖") : (c.style.display = "none", o.textContent = "➕");
    }, r.onclick = () => {
      B = l.path, X(B), fetch("/api/image_tree").then((g) => g.json()).then((g) => {
        I.innerHTML = "", j(g, I, l.path.split("/"));
      });
    }, i.appendChild(o), i.appendChild(r), s.appendChild(i), l.children && l.children.length > 0 && j(l.children, c, n), s.appendChild(c), a.appendChild(s);
  }
  t.appendChild(a);
}
function fe(e) {
  k && (k.innerHTML = "", e.filter((t) => t.type === "file").forEach((t) => {
    const n = document.createElement("img");
    n.src = `/_static/${t.path}`, n.style.width = "100px", n.style.height = "fit-content", n.style.cursor = "pointer", n.title = t.name, n.alt = t.name, n.onclick = () => {
      F(`_static/${t.path}`), h.style.display = "none";
    }, k.appendChild(n);
  }));
}
async function X(e) {
  try {
    const t = await fetch(`/api/images_in_folder?folder=${encodeURIComponent(e)}`);
    if (!t.ok) {
      alert("Failed to load list of images/folders");
      return;
    }
    const n = await t.json();
    fe(n);
  } catch (t) {
    alert("Error: " + t.message);
  }
}
function he(e) {
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
  fetch("/api/tree").then((l) => l.json()).then((l) => {
    const s = document.getElementById("move-tree");
    a([{
      type: "folder",
      name: "root",
      path: "",
      children: l
    }], s);
  });
  function a(l, s) {
    const i = document.createElement("ul");
    for (const o of l) {
      if (o.type !== "folder") continue;
      const r = document.createElement("li"), c = document.createElement("div");
      c.textContent = "📁 " + o.name, c.style.cursor = "pointer", c.onclick = () => {
        n = o.path.replace(/\\/g, "/"), document.querySelectorAll("#move-tree div").forEach((p) => p.style.fontWeight = "normal"), c.style.fontWeight = "bold";
      }, r.appendChild(c), o.children && a(o.children, r), i.appendChild(r);
    }
    s.appendChild(i);
  }
  document.getElementById("move-ok").onclick = async () => {
    if (n === null) {
      alert("Select a file or folder to move.");
      return;
    }
    const l = e.replace(/\\/g, "/").split("/").pop(), s = n ? `${n}/${l}` : l;
    (await fetch("/api/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        oldPath: e,
        newPath: s
      })
    })).ok ? (x === e && (x = s, localStorage.setItem("currentPath", s)), w()) : alert("Error while moving."), t.remove();
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
  if (N.includes(n)) {
    alert(`Cannot move protected folder: ${n}`);
    return;
  }
  he(t);
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
    w(), setTimeout(() => W(C(n)), 500);
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
  }).then(() => w());
};
document.getElementById("delete").onclick = async () => {
  const e = document.querySelector(".file.active, .folder.active");
  if (!e) {
    alert("Select a file or folder to delete.");
    return;
  }
  const t = e.title, n = t.split("/").pop();
  if (N.includes(n)) {
    alert(`Cannot delete protected folder: ${n}`);
    return;
  }
  const a = e.classList.contains("folder"), l = a ? `Are you sure you want to delete the folder "${t}" and all its contents?` : `Are you sure you want to delete the file "${t}"?`;
  if (confirm(l))
    try {
      const s = await fetch("/api/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: t
        })
      });
      if (!s.ok) {
        const o = await s.text();
        alert(`Error while deleting: ${o}`);
        return;
      }
      _();
      let i = localStorage.getItem("currentPath");
      if (i) {
        if (a && i.startsWith(t + "/")) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), i = "";
          const o = document.getElementById("myst");
          o && (o.innerHTML = "");
        } else if (!a && i === t) {
          localStorage.removeItem("currentPath"), localStorage.removeItem("lastOpened"), i = "";
          const o = document.getElementById("myst");
          o && (o.innerHTML = "");
        }
      }
      w();
    } catch (s) {
      alert(`Error while deleting: ${s.message}`);
    }
};
document.getElementById("rename").onclick = async () => {
  const e = document.querySelector(".file.active, .folder.active");
  if (!e) {
    alert("Select a file or folder to rename.");
    return;
  }
  const t = e.title, n = t.split("/").pop();
  if (N.includes(n)) {
    alert(`Cannot rename protected folder: ${n}`);
    return;
  }
  const a = t.replace(/\\/g, "/"), l = a.split("/"), s = l.pop(), i = l.join("/"), o = s.endsWith(".md") ? s.replace(/\.md$/, "") : s, r = prompt("Enter new name:", o);
  if (!r || r.trim() === "" || r === o) return;
  const c = s.endsWith(".md") && !r.endsWith(".md") ? `${r}.md` : r, p = i ? `${i}/${c}` : c;
  if (console.log(a), console.log(p), !(await fetch("/api/rename", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      oldPath: a,
      newPath: p
    })
  })).ok) {
    alert("Rename error.");
    return;
  }
  x === a && (x = p, localStorage.setItem("currentPath", p)), w();
};
w();
//# sourceMappingURL=MainOverride.js.map
