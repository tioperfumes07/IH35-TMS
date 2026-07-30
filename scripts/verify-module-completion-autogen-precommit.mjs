#!/usr/bin/env node
/**
 * TOOL — MODULE_COMPLETION_AUTOGEN must stay in .husky/pre-commit.
 *
 * Root cause of Cursor build-typecheck thrash: agents edit docs/module-completion/*.json
 * (evidence lines) without regenerating apps/frontend/src/generated/module-completion.ts.
 * CI then fails verify-module-completion-ui-in-sync on every PR. Claude PRs usually avoid
 * that edit path; Cursor does not.
 *
 * The permanent control is husky pre-commit MODULE_COMPLETION_AUTOGEN — regenerate + stage
 * the TS whenever a manifest is staged. This guard fails closed if that block is removed.
 *
 * Usage:
 *   node scripts/verify-module-completion-autogen-precommit.mjs
 *   node scripts/verify-module-completion-autogen-precommit.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-module-completion-autogen-precommit";
const HOOK = "MODULE_COMPLETION_AUTOGEN";
const PRECOMMIT = path.join(ROOT, ".husky", "pre-commit");

/** @param {string} src */
export function check(src) {
  const f = [];
  if (!src.includes(HOOK)) {
    f.push(`.husky/pre-commit missing ${HOOK} marker — Cursor manifest edits will stale-fail CI again`);
  }
  if (!/generate-module-completion-data\.mjs/.test(src)) {
    f.push(".husky/pre-commit must invoke scripts/generate-module-completion-data.mjs");
  }
  if (!/docs\/module-completion\/.*\.json/.test(src) && !/module-completion\/\[\^\/\]\+\\.json/.test(src)) {
    // tolerate the escaped grep pattern used in the hook
    if (!/module-completion/.test(src)) {
      f.push(".husky/pre-commit must trigger on docs/module-completion/*.json staged changes");
    }
  }
  if (!/git add apps\/frontend\/src\/generated\/module-completion\.ts/.test(src)) {
    f.push(".husky/pre-commit must git add the regenerated module-completion.ts");
  }
  return f;
}

export function run(root = ROOT) {
  let src = "";
  try {
    src = fs.readFileSync(path.join(root, ".husky", "pre-commit"), "utf8");
  } catch {
    return [".husky/pre-commit missing"];
  }
  return check(src);
}

if (process.argv.includes("--selftest")) {
  const good = `
# ${HOOK}
if echo "$CHANGED_FILES" | grep -qE '^docs/module-completion/[^/]+\\.json$'; then
  node scripts/generate-module-completion-data.mjs || exit 1
  git add apps/frontend/src/generated/module-completion.ts
fi
`;
  if (check(good).length) throw new Error(`${LABEL} PASS path failed: ${check(good).join("; ")}`);
  if (!check("# no autogen\n").length) throw new Error(`${LABEL} FAIL path did not catch missing hook`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK (${HOOK} present in .husky/pre-commit)`);
}
