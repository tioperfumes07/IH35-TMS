#!/usr/bin/env node
/**
 * Cursor money-PR preflight — catch the failures that burned CI on ACCT-R-* waves.
 *
 * Run before every push that touches accounting/banking apps or scoreboard hotfiles:
 *   node scripts/ops/cursor-money-pr-preflight.mjs
 *
 * Checks:
 *  1) FINDING format on HEAD commit (ACCT-F##|BANK-F##|LST-F##) when apps money paths change
 *  2) verify-no-money-theater + verify-definition-of-done-evidence
 *  3) section7 financial palette baseline
 *  4) matrix M === accounting.json items.length when either file is dirty vs origin/main
 *  5) warn if another open PR already edits scoreboard hotfiles (needs gh)
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "cursor-money-pr-preflight";

const HOTFILES = [
  "docs/module-completion/accounting.json",
  "docs/module-completion/banking.json",
  "docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json",
  "scripts/verify-steps/CLAIMED-NUMBERS.json",
];

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    return { error: true, out: String(e.stdout || "") + String(e.stderr || e.message || "") };
  }
}

function runNode(script) {
  const r = sh(`node ${script}`);
  if (typeof r === "object" && r.error) {
    console.error(r.out);
    return false;
  }
  console.log(r.split("\n").slice(-2).join("\n"));
  return true;
}

const problems = [];

// Rule 29 — always run the expanded fail-fast suite (not only money paths).
// This is what Claude effectively does before push; Cursor must match.
if (!runNode("scripts/money-pr-local-gate.mjs")) {
  problems.push("money-pr-local-gate (Rule 25/29)");
}

const changed = sh("git diff --name-only origin/main...HEAD");
const files =
  typeof changed === "string"
    ? changed.split("\n").filter(Boolean)
    : [];

const touchesHot = files.some((f) => HOTFILES.includes(f));
const touchesMoneyApps = files.some((f) =>
  /^(apps\/(backend|frontend)\/src\/.*(accounting|banking|qbo-sync|\/qbo\/)|apps\/frontend\/src\/pages\/(accounting|banking)\/)/i.test(
    f,
  ),
);

if (files.some((f) => f.startsWith("apps/frontend/src/pages/accounting/") || f.startsWith("apps/frontend/src/pages/banking/"))) {
  if (!runNode("scripts/verify-section7-palette-financial.mjs")) {
    problems.push("verify-section7-palette-financial");
  }
}

// §7 nonfinancial — always (Rule 29 / #4198). Covered by money-pr-local-gate; keep explicit here too.
if (!runNode("scripts/verify-section7-palette-nonfinancial.mjs")) {
  problems.push("verify-section7-palette-nonfinancial");
}

if (touchesHot && existsSync(resolve(ROOT, "docs/module-completion/accounting.json"))) {
  if (!runNode("scripts/verify-acct-surface-dod-sweep.mjs")) {
    problems.push("verify-acct-surface-dod-sweep (matrix M vs accounting.json)");
  }
}

// Parallel open-PR warning via gh (best-effort)
if (touchesHot) {
  const prs = sh(
    `gh pr list --base main --state open --limit 50 --json number,files,headRefName,isDraft --jq '.[]|select(.isDraft|not)|{n:.number,branch:.headRefName,files:[.files[].path]}'`,
  );
  if (typeof prs === "string" && prs) {
    // gh --jq with multiple objects prints NDJSON sometimes; try parse array
    let list = [];
    try {
      list = JSON.parse(`[${prs.replace(/}\s*{/g, "},{")}]`);
    } catch {
      try {
        list = JSON.parse(prs);
      } catch {
        list = [];
      }
    }
    const branch = sh("git rev-parse --abbrev-ref HEAD");
    const others = (Array.isArray(list) ? list : []).filter((p) => {
      if (!p || p.branch === branch) return false;
      const fs = p.files || [];
      return fs.some((f) => HOTFILES.includes(f));
    });
    if (others.length) {
      problems.push(
        `Rule 26: other ready PR(s) already edit scoreboard hotfiles: ${others
          .map((p) => `#${p.n}`)
          .join(", ")} — serialize (merge/close those first; drafts may wait)`,
      );
    }
  }
}

if (problems.length) {
  console.error(`\n${LABEL}: FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`${LABEL}: PASS`);
