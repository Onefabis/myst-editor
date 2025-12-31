#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────
// paths
// ─────────────────────────────────────────────

const BACKEND_DIR = resolve(__dirname, "../server");
const VENV_DIR = resolve(BACKEND_DIR, ".venv");
const DEPS_FLAG = resolve(VENV_DIR, ".deps_installed");

// ─────────────────────────────────────────────
// cli args (flags OR positional)
// ─────────────────────────────────────────────

const argv = process.argv.slice(2);

// 1) --work_dir <path>
const workDirFlagIndex = argv.indexOf("--work_dir");
const workDirFromFlag =
  workDirFlagIndex !== -1 ? argv[workDirFlagIndex + 1] : null;

// 2) positional path (npm-style)
const workDirFromPositional =
  !workDirFromFlag && argv.length === 1 ? argv[0] : null;

const WORK_DIR = workDirFromFlag || workDirFromPositional || null;


// ─────────────────────────────────────────────
// shared env
// ─────────────────────────────────────────────

const BASE_ENV = {
  ...process.env,
  RUN_FROM_NPM: "1",
  PYTHONUNBUFFERED: "1",
  ...(WORK_DIR ? { WORK_DIR } : {}),
};

// ─────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// ─────────────────────────────────────────────
// 1. find python
// ─────────────────────────────────────────────

function findPython() {
  for (const cmd of ["python3", "python", "py"]) {
    const r = spawnSync(cmd, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return cmd;
  }
  console.error("Python not found");
  process.exit(1);
}

const SYSTEM_PYTHON = findPython();

// ─────────────────────────────────────────────
// 2. create venv if needed
// ─────────────────────────────────────────────

if (!existsSync(VENV_DIR)) {
  console.log("Creating virtual environment...");
  run(SYSTEM_PYTHON, ["-m", "venv", ".venv"], { cwd: BACKEND_DIR });
}

// ─────────────────────────────────────────────
// 3. resolve venv python
// ─────────────────────────────────────────────

const VENV_PYTHON =
  process.platform === "win32"
    ? resolve(VENV_DIR, "Scripts", "python.exe")
    : resolve(VENV_DIR, "bin", "python");

// ─────────────────────────────────────────────
// 4. install dependencies (once)
// ─────────────────────────────────────────────

console.log("Ensuring pip is up to date...");
run(VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "pip"]);

if (!existsSync(DEPS_FLAG)) {
  console.log("Installing backend dependencies...");
  run(VENV_PYTHON, ["-m", "pip", "install", "-r", "requirements.txt"], {
    cwd: BACKEND_DIR,
  });
  writeFileSync(DEPS_FLAG, "");
}

// ─────────────────────────────────────────────
// 5. run backend
// ─────────────────────────────────────────────

run(
  VENV_PYTHON,
  [
    "-m",
    "uvicorn",
    "app:app",
    "--host", "0.0.0.0",
    "--port", "5000",
    "--reload",
  ],
  {
    cwd: BACKEND_DIR,
    env: BASE_ENV,
  }
);
