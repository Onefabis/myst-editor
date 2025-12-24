#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKEND_DIR = resolve(__dirname, "../server");

// ─────────────────────────────────────────────
// backend (uvicorn)
// ─────────────────────────────────────────────

const backendArgs = [
  "-m",
  "uvicorn",
  "app:app",
  "--host", "0.0.0.0",
  "--port", "5000",
  "--reload",
  "--"
];

const workDirArgIndex = process.argv.indexOf("--work_dir");
const workDir = workDirArgIndex !== -1 ? normalize(process.argv[workDirArgIndex + 1]) : null;

const backendEnv = {
  ...process.env,
  RUN_FROM_NPM: "1",
  PYTHONUNBUFFERED: "1",
  ...(workDir ? { WORK_DIR: workDir } : {}),
};

const pythonPath = resolve(BACKEND_DIR, ".venv", "Scripts", "python.exe");

const backend = spawn(
  `"${pythonPath}"`,
  backendArgs,
  {
    cwd: BACKEND_DIR,
    stdio: "inherit",
    env: backendEnv,
    shell: true, // важно для Windows
  }
);

// ─────────────────────────────────────────────
// frontend (vite)
// ─────────────────────────────────────────────

const vite = spawn(
  process.platform === "win32"
    ? "npm run dev"
    : "npm",
  process.platform === "win32"
    ? []
    : ["run", "dev"],
  {
    cwd: resolve(__dirname, ".."),
    stdio: "inherit",
    shell: process.platform === "win32",
  }
);

// ─────────────────────────────────────────────
// shutdown
// ─────────────────────────────────────────────

const shutdown = () => {
  backend.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
