import { MystEditorGit as m } from "./MystEditor.js";
const c = ["#30bced", "#60c771", "#e6aa3a", "#cbb63e", "#ee6352", "#9ac2c9", "#8acb88", "#14b2c4"], o = new URLSearchParams(window.location.search), l = o.get("username") || Math.floor(Math.random() * 1e3).toString(), d = c[Math.floor(Math.random() * c.length)];
let g = [{
  target: "say",
  transform: async (e) => l + " says: '" + e + "'"
}], u = [{
  target: "bold",
  transform: (e, t) => `<b style="white-space: pre-wrap;">${t.body}</b>`
}], h = [{
  // Other repo issue links
  target: /[0-9a-z\-]+\/[0-9a-z\-]+#\d{1,10}/g,
  transform: (e) => {
    const [t, s] = e.split("#");
    return `<a href="https://github.com/${t}/issues/${s}">${e}</a>`;
  }
}, {
  // Other repo PR links
  target: /[0-9a-z\-]+\/[0-9a-z\-]+\!\d+/g,
  transform: (e) => {
    const [t, s] = e.split("!");
    return `<a href="https://github.com/${t}/pull/${s}">${e}</a>`;
  }
}, {
  // Same repo issue links
  target: new RegExp("(^|(?<=\\s))#\\d+", "g"),
  transform: (e) => `<a href="https://github.com/antmicro/myst-editor/issues/${e.slice(1)}">${e}</a>`
}, {
  // Same repo PR links
  target: new RegExp("(^|(?<=\\s))!\\d+", "g"),
  transform: (e) => `<a href="https://github.com/antmicro/myst-editor/pull/${e.slice(1)}">${e}</a>`
}, {
  // User links
  target: /@[0-9a-z\-]+/g,
  transform: (e) => {
    const t = e.slice(1);
    return `
                <a href='https://github.com/${t}'>
                  ${t}
                </a>`;
  }
}, {
  target: /\|date\|/g,
  transform: (e) => new Promise((t) => t((/* @__PURE__ */ new Date()).toLocaleString("en-GB", {
    timeZone: "UTC"
  })))
}];
const r = o.get("collab") != "false", n = o.get("collab_server"), a = ["main", "dev"], i = [{
  message: "commit 2",
  hash: "aaa"
}, {
  message: "commit 1",
  hash: "bbb"
}], b = ["docs/source/file1.md", "docs/source/file2.md", "docs/source/index.md"], f = {
  "docs/source/index.md": "# {{project}}\n\n```{toctree}\nfile2\nfile1\n```\n",
  "docs/source/file1.md": `# Document 1
line1
line2
## Heading2_1
line3
## Heading2_2
line4`,
  "docs/source/file2.md": `# Document 2
line1
line2
## Heading2_1
line3
## Heading2_2
line4`
};
m({
  repo: o.get("repo") ?? "repos/myst",
  initialBranches: a,
  getBranches: (e) => e == 1 ? a : [],
  searchBranches: (e) => a.filter((t) => t.includes(e)),
  getCommits: (e, t) => t == 1 ? i : [],
  searchCommits: (e) => i.filter((t) => t.message.includes(e)),
  getFiles: () => b,
  getText: async (e, t, s) => f[s] ?? "",
  storeHistory: () => {
  },
  commitChanges: (e) => ({
    hash: "ccc",
    webUrl: "#"
  }),
  id: "demo",
  title: "[MyST Editor](https://github.com/antmicro/myst-editor/) demo",
  transforms: h,
  collaboration: {
    enabled: r,
    commentsEnabled: r,
    resolvingCommentsEnabled: r,
    wsUrl: n ?? "#",
    username: l,
    color: d,
    mode: n ? "websocket" : "local"
  },
  customRoles: g,
  customDirectives: u,
  syncScroll: !0,
  index: "docs/source/index.md",
  docsRoot: "docs/source"
}, document.getElementById("myst"));
//# sourceMappingURL=git.js.map
