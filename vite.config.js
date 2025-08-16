import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";
import macrosPlugin from "vite-plugin-babel-macros";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  base: "",
  root: "src",
  plugins: [
    macrosPlugin(),
    preact(),
    nodePolyfills({
      include: ["path"],
    }),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: true, 
    lib: {
      entry: [
        resolve(__dirname, "src/MystEditor.jsx"),
        resolve(__dirname, "src/index.html"),
        resolve(__dirname, "src/pfx_override/js/MainOverride.js")
      ],
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        manualChunks: (module) => {
          if (module.includes("index.html")) {
            return "index";
          } else if (module.includes("MainOverride.js")) {
            return "MainOverride";
          } else if (module.includes("PFXStyleOverride.css")) {
            return "PFXStyleOverride";
          } else {
            return "MystEditor";
          }
        },
      },
    },
  },
  define: {
    "process.env": {},
  },
  resolve: {
    alias: [
      {
        find: "vscode-json-languageservice/lib/umd",
        replacement: "vscode-json-languageservice/lib/esm",
      },
    ],
  },
});
