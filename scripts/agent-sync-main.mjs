#!/usr/bin/env node
/**
 * agent-sync-main.mjs — permanent Cursor rebase helper (conflict class 2026-07-29).
 *
 * WHY: Cursor PRs conflict on every rebase; Claude's usually don't. Root causes:
 *   1. Merge drivers never registered (shallow clone / worktree without `npm install` → prepare skipped)
 *   2. Hotfiles (CLAIMED-NUMBERS, module-completion JSON) need merge=json-union
 *
 * Agents MUST rebase with this instead of bare `git rebase origin/main`:
 *   node scripts/agent-sync-main.mjs
 *   node scripts/agent-sync-main.mjs --merge   # merge instead of rebase
 *
 * Registers drivers → fetch origin → rebase|merge origin/main → regenerate gitignored module-completion.ts
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MERGE = process.argv.includes("--merge");

function run(cmd, opts = {}) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

process.chdir(ROOT);

if (!existsSync(join(ROOT, "scripts/setup-git-merge-drivers.mjs"))) {
  console.error("agent-sync-main: scripts/setup-git-merge-drivers.mjs missing — wrong cwd?");
  process.exit(1);
}

console.log("agent-sync-main: registering merge.json-union …");
run([process.execPath, "scripts/setup-git-merge-drivers.mjs"]);

// Prove driver is live (fail closed if git config blocked)
try {
  const driver = execSync("git config --get merge.json-union.driver", { cwd: ROOT, encoding: "utf8" }).trim();
  if (!driver.includes("git-merge-driver.mjs")) {
    console.error(`agent-sync-main: merge.json-union.driver not set correctly: ${driver}`);
    process.exit(1);
  }
} catch {
  console.error("agent-sync-main: FAIL — merge.json-union.driver not registered. Fix git config and retry.");
  process.exit(1);
}

console.log("agent-sync-main: git fetch origin …");
run(["git", "fetch", "origin", "main"]);

if (MERGE) {
  console.log("agent-sync-main: git merge origin/main …");
  run(["git", "merge", "origin/main"]);
} else {
  console.log("agent-sync-main: git rebase origin/main …");
  run(["git", "rebase", "origin/main"]);
}

if (existsSync(join(ROOT, "scripts/generate-module-completion-data.mjs"))) {
  console.log("agent-sync-main: regenerating gitignored module-completion.ts …");
  spawnSync(process.execPath, ["scripts/generate-module-completion-data.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

console.log("agent-sync-main: OK — drivers on, branch synced to origin/main.");
