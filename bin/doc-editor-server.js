#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- 0. Initial config ---
const BACKEND_DIR = resolve(__dirname, "../server");
const VENV_DIR = resolve(BACKEND_DIR, ".venv");

// --- 1. Find latest python version ---
function findPython() {
  const candidates = ["python3", "python", "py"];

  for (const cmd of candidates) {
    const r = spawnSync(cmd, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return cmd;
  }

  console.error("Python not found");
  process.exit(1);
}

const PYTHON = findPython();

// --- 2. Create venv if doesn't exist ---
if (!existsSync(VENV_DIR)) {
  console.log("Creating venv...");
  console.log(VENV_DIR);
  spawnSync(PYTHON, ["-m", "venv", ".venv"], {
    cwd: BACKEND_DIR,
    stdio: "inherit",
  });
}

// --- 3. Define python from .venv ---
const VENV_PYTHON =
  process.platform === "win32"
    ? resolve(VENV_DIR, "Scripts", "python.exe")
    : resolve(VENV_DIR, "bin", "python");

// --- 4. Install pip dependencies ---
console.log("Installing python dependencies...");
spawnSync(
  VENV_PYTHON,
  ["-m", "pip", "install", "--upgrade", "pip"],
  { stdio: "inherit" }
);

if (!existsSync(resolve(VENV_DIR, ".deps_installed"))) { // Install only once if .deps_installed doesn't exists, i.e. only first time
  spawnSync(VENV_PYTHON, ["-m", "pip", "install", "-r", "requirements.txt"], {
    cwd: BACKEND_DIR,
    stdio: "inherit",
  });
  writeFileSync(resolve(VENV_DIR, ".deps_installed"), "");
}

// --- 5. Run backend ---
const result = spawnSync(
  VENV_PYTHON,
  [
    "-m",
    "uvicorn",
    "app:app",
    "--host",
    "0.0.0.0",
    "--port",
    "5000",
    "--reload"
  ],
  {
    cwd: BACKEND_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      RUN_FROM_NPM: "1",
      REPO_DIR: resolve(__dirname, "..")
    }
  }
);

process.exit(result.status ?? 0);