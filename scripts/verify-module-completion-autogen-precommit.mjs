#!/usr/bin/env node
/**
 * TOOL — permanent Cursor thrash / conflict kill (claim 1806).
 *
 * Defect classes this locks:
 * 1. Manifest edit without regenerating module-completion.ts → typecheck red (autogen pre-commit)
 * 2. Committing derived module-completion.ts → every parallel PR conflicts (must stay gitignored)
 * 3. merge=json-union missing for docs/module-completion/*.json → every rebase conflicts
 * 4. Merge drivers only registered via npm prepare → Cursor shallow clones conflict; Claude doesn't
 *
 * Usage:
 *   node scripts/verify-module-completion-autogen-precommit.mjs
 *   node scripts/verify-module-completion-autogen-precommit.mjs --selftest
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-module-completion-autogen-precommit";
const HOOK = "MODULE_COMPLETION_AUTOGEN";
const DRIVERS = "MERGE_DRIVERS_ALWAYS_ON";

/** @param {string} src */
export function checkPreCommit(src) {
  const f = [];
  if (!src.includes(HOOK)) {
    f.push(`.husky/pre-commit missing ${HOOK} marker — Cursor manifest edits will stale-fail CI again`);
  }
  if (!src.includes(DRIVERS) && !/setup-git-merge-drivers\.mjs/.test(src)) {
    f.push(".husky/pre-commit must call scripts/setup-git-merge-drivers.mjs (MERGE_DRIVERS_ALWAYS_ON)");
  }
  if (!/generate-module-completion-data\.mjs/.test(src)) {
    f.push(".husky/pre-commit must invoke scripts/generate-module-completion-data.mjs");
  }
  if (!/module-completion/.test(src)) {
    f.push(".husky/pre-commit must trigger on docs/module-completion/*.json staged changes");
  }
  if (!src.includes("TYPECHECK_SKIP_DOCS_ONLY")) {
    f.push(".husky/pre-commit must skip npm typecheck on docs-only commits (TYPECHECK_SKIP_DOCS_ONLY) so worktrees without tsc can ship bus packets");
  }
  if (!/STAGED_CODE/.test(src) || !/apps\/\|db\/migrations\//.test(src)) {
    f.push(".husky/pre-commit must still typecheck when apps/ or db/migrations/ is staged");
  }
  if (/git add -f\s+apps\/frontend\/src\/generated\/module-completion\.ts/.test(src)) {
    f.push("pre-commit must not git add -f module-completion.ts — keep it gitignored");
  }
  return f;
}

/** @param {string} attrs */
export function checkGitattributes(attrs) {
  const f = [];
  if (!/docs\/module-completion\/\*\.json\s+merge=json-union/.test(attrs)) {
    f.push(".gitattributes must map docs/module-completion/*.json to merge=json-union");
  }
  if (!/CLAIMED-NUMBERS\.json\s+merge=json-union/.test(attrs)) {
    f.push(".gitattributes must keep CLAIMED-NUMBERS.json merge=json-union");
  }
  return f;
}

/** @param {string} gi */
export function checkGitignore(gi) {
  const f = [];
  if (!/apps\/frontend\/src\/generated\/module-completion\.ts/.test(gi)) {
    f.push(".gitignore must ignore apps/frontend/src/generated/module-completion.ts (stop commit conflicts)");
  }
  return f;
}

/** @param {string} driverSrc */
export function checkMergeDriver(driverSrc) {
  const f = [];
  if (!/isModuleCompletionManifest|unionModuleManifest|unionKeyedArray/.test(driverSrc)) {
    f.push("scripts/git-merge-driver.mjs must keyed-union module-completion manifests by item id");
  }
  return f;
}

/** @param {string} fePkg */
export function checkFrontendPkg(fePkg) {
  const f = [];
  if (!/generate-module-completion-data\.mjs/.test(fePkg)) {
    f.push("apps/frontend/package.json typecheck/build/dev must generate module-completion.ts before tsc/vite");
  }
  return f;
}

function assertTrackedGone(root) {
  try {
    const out = execSync("git ls-files -- apps/frontend/src/generated/module-completion.ts", {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (out) {
      return [
        "apps/frontend/src/generated/module-completion.ts is still tracked — run: git rm --cached apps/frontend/src/generated/module-completion.ts",
      ];
    }
  } catch {
    /* not a git worktree */
  }
  return [];
}

export function run(root = ROOT) {
  const f = [];
  try {
    f.push(...checkPreCommit(fs.readFileSync(path.join(root, ".husky", "pre-commit"), "utf8")));
  } catch {
    f.push(".husky/pre-commit missing");
  }
  try {
    f.push(...checkGitattributes(fs.readFileSync(path.join(root, ".gitattributes"), "utf8")));
  } catch {
    f.push(".gitattributes missing");
  }
  try {
    f.push(...checkGitignore(fs.readFileSync(path.join(root, ".gitignore"), "utf8")));
  } catch {
    f.push(".gitignore missing");
  }
  try {
    f.push(...checkMergeDriver(fs.readFileSync(path.join(root, "scripts", "git-merge-driver.mjs"), "utf8")));
  } catch {
    f.push("scripts/git-merge-driver.mjs missing");
  }
  try {
    f.push(...checkFrontendPkg(fs.readFileSync(path.join(root, "apps", "frontend", "package.json"), "utf8")));
  } catch {
    f.push("apps/frontend/package.json missing");
  }
  if (!fs.existsSync(path.join(root, "scripts", "agent-sync-main.mjs"))) {
    f.push("scripts/agent-sync-main.mjs missing — Cursor rebases need the driver-aware sync helper");
  }
  try {
    const tscStep = fs.readFileSync(path.join(root, "scripts", "verify-steps", "04-frontend-tsc.mjs"), "utf8");
    if (!/generate-module-completion-data\.mjs/.test(tscStep)) {
      f.push("scripts/verify-steps/04-frontend-tsc.mjs must regenerate module-completion.ts before tsc");
    }
  } catch {
    f.push("scripts/verify-steps/04-frontend-tsc.mjs missing");
  }
  try {
    const gen = fs.readFileSync(path.join(root, "scripts", "generate-module-completion-data.mjs"), "utf8");
    if (!/fileURLToPath/.test(gen) || !/dirname\(fileURLToPath/.test(gen)) {
      f.push("generate-module-completion-data.mjs must resolve ROOT from import.meta.url (not process.cwd)");
    }
  } catch {
    f.push("scripts/generate-module-completion-data.mjs missing");
  }
  f.push(...assertTrackedGone(root));
  return f;
}

if (process.argv.includes("--selftest")) {
  const goodHook = `
# ${DRIVERS}
node scripts/setup-git-merge-drivers.mjs
# ${HOOK}
if echo "$CHANGED_FILES" | grep -qE '^docs/module-completion/[^/]+\\.json$'; then
  node scripts/generate-module-completion-data.mjs || exit 1
fi
# TYPECHECK_SKIP_DOCS_ONLY
STAGED_CODE=$(echo "$CHANGED_FILES" | grep -E '^(apps/|db/migrations/)' || true)
`;
  if (checkPreCommit(goodHook).length) {
    throw new Error(`${LABEL} PASS path failed: ${checkPreCommit(goodHook).join("; ")}`);
  }
  if (!checkPreCommit("# no autogen\n").length) {
    throw new Error(`${LABEL} FAIL path did not catch missing hook`);
  }
  const attrs =
    "docs/module-completion/*.json           merge=json-union\nscripts/verify-steps/CLAIMED-NUMBERS.json      merge=json-union\n";
  if (checkGitattributes(attrs).length) throw new Error("gitattributes PASS failed");
  if (!checkGitattributes("").length) throw new Error("gitattributes FAIL failed");
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK (${HOOK} + merge drivers + gitignored generated TS + agent-sync-main)`);
}
