// Shared --selftest plumbing for top-level verify-*.mjs guards (Devin build order 2026-10-05).
// Guards that scan relative paths can be exercised against a THROWAWAY tree: planted files under
// a temp cwd, never tracked source (the #25436 defect class — a selftest mutating real files).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Forces a live-DB guard's credential resolution onto a dead socket. Guards resolve creds from
 * process.env then the owner master-keys file — both cwd-independent — so a fixture cwd can never
 * produce the fails-closed case for them. A dead URL exercises exactly the path that must exit
 * non-zero: a live guard that cannot look must never report green (ROUND 29.9-B).
 */
export const DEAD_DB_ENV = {
  DATABASE_URL_READONLY: "postgresql://127.0.0.1:1/guard-selftest-dead",
  DATABASE_URL: "",
  DATABASE_DIRECT_URL: "",
};

export function statusOf(r) {
  return r.error ? 1 : (r.status ?? 1);
}

export function outputOf(r) {
  return `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
}

/** Spawn a guard file as a child. cwd defaults to the repo root (the real tree). */
export function runGuard(scriptAbsPath, opts = {}) {
  return spawnSync(process.execPath, [scriptAbsPath], {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf8",
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
}

/**
 * Create a temp fixture dir containing the given files/dirs, call fn(tmpDir), and clean up.
 * files: { "relative/path.tsx": "content" }; dirs: extra empty dirs to mkdir.
 * Use this when a guard resolves paths against its OWN root rather than cwd — pass the tmp
 * dir back to the guard via its VERIFY_ROOT env override.
 */
export function withTmpFixture(files = {}, dirs = [], fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-selftest-"));
  try {
    for (const d of dirs) fs.mkdirSync(path.join(tmp, d), { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Build a temp dir containing ONLY the given fixture files/dirs, run the guard inside it,
 * and clean up.
 */
export function runGuardInFixture(scriptAbsPath, files = {}, dirs = [], env = {}) {
  return withTmpFixture(files, dirs, (tmp) => spawnSync(process.execPath, [scriptAbsPath], {
    cwd: tmp,
    encoding: "utf8",
    env: { ...fixtureEnv(process.env), ...env },
  }));
}

/**
 * 443.264 (CC-2): a fixture must NOT inherit the caller's git context. Inside a git hook run from a linked worktree, git
 * exports GIT_DIR (and GIT_WORK_TREE / GIT_INDEX_FILE …) to the hook — a guard spawned in a bare temp dir then still
 * resolves the REAL repository (e.g. `git grep` reads the real tree and reports green), so every "bare fixture fails
 * closed" case failed in pre-push while passing at rest. Strip every repository-locating GIT_* variable.
 */
export function fixtureEnv(base) {
  const out = { ...base };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_PREFIX", "GIT_CEILING_DIRECTORIES"]) delete out[k];
  return out;
}

/** Print per-case lines + "<label> --selftest N/N" and exit non-zero unless every case passed. */
export function reportSelftest(label, cases) {
  let pass = 0;
  for (const c of cases) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (c.pass) pass += 1;
  }
  console.log(`${label} --selftest ${pass}/${cases.length}`);
  process.exit(pass === cases.length ? 0 : 1);
}
