#!/usr/bin/env node
/**
 * Guard 1428 — Rule 26: at most one open PR may edit scoreboard hotfiles.
 *
 * When GITHUB_TOKEN/GH_TOKEN is absent (local without gh auth), the guard SKIP-PASS
 * with an explicit notice — preflight still enforces locally when gh works.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-parallel-scoreboard-prs";

const HOTFILES = new Set([
  "docs/module-completion/accounting.json",
  "docs/module-completion/banking.json",
  "docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json",
  "scripts/verify-steps/CLAIMED-NUMBERS.json",
]);

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function selftest() {
  if (!HOTFILES.has("docs/module-completion/accounting.json")) throw new Error("hotfile set broken");
  console.log(`${LABEL}: selftest PASS`);
}

function changedVsMain() {
  try {
    return sh("git diff --name-only origin/main...HEAD").split("\n").filter(Boolean);
  } catch {
    return sh("git diff --name-only main...HEAD").split("\n").filter(Boolean);
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const files = changedVsMain();
  const touches = files.filter((f) => HOTFILES.has(f));
  if (!touches.length) {
    console.log(`${LABEL}: PASS — PR does not edit scoreboard hotfiles`);
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!token && !process.env.CI) {
    console.log(
      `${LABEL}: SKIP-PASS (no GITHUB_TOKEN) — hotfiles touched: ${touches.join(", ")}. ` +
        `Run scripts/ops/cursor-money-pr-preflight.mjs before push.`,
    );
    return;
  }

  let raw;
  try {
    raw = sh(
      "gh pr list --base main --state open --limit 80 --json number,headRefName,files",
    );
  } catch (e) {
    if (!process.env.CI) {
      console.log(`${LABEL}: SKIP-PASS (gh pr list failed locally)`);
      return;
    }
    throw e;
  }

  const list = JSON.parse(raw || "[]");
  let branch = "";
  try {
    branch = sh("git rev-parse --abbrev-ref HEAD");
  } catch {
    branch = process.env.GITHUB_HEAD_REF || "";
  }

  const offenders = list.filter((p) => {
    if (p.headRefName === branch) return false;
    const paths = (p.files || []).map((f) => f.path);
    return paths.some((p) => HOTFILES.has(p));
  });

  if (offenders.length) {
    console.error(`${LABEL}: FAIL — Rule 26 serialize scoreboard hotfiles`);
    console.error(`  this PR touches: ${touches.join(", ")}`);
    for (const o of offenders) {
      const hp = (o.files || []).map((f) => f.path).filter((p) => HOTFILES.has(p));
      console.error(`  open #${o.number} (${o.headRefName}) also touches: ${hp.join(", ")}`);
    }
    console.error("  Merge or close the other scoreboard PR first — do not stack hotfile PRs.");
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS — sole open scoreboard-hotfile PR (touched ${touches.length} hotfile(s))`,
  );
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: FAIL`, err?.message ?? err);
  process.exit(1);
}
