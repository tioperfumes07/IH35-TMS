#!/usr/bin/env node
/**
 * Guard 1428 — Rule 26: at most one non-draft open PR may edit scoreboard hotfiles.
 *
 * Draft PRs may wait in the serialize queue. Ready-for-review PRs must be sole.
 *
 * When GITHUB_TOKEN/GH_TOKEN is absent (local without gh auth), the guard SKIP-PASS
 * with an explicit notice — preflight still enforces locally when gh works.
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-parallel-scoreboard-prs";

export const HOTFILES = new Set([
  "docs/module-completion/accounting.json",
  "docs/module-completion/banking.json",
  "docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json",
  "scripts/verify-steps/CLAIMED-NUMBERS.json",
]);

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * Pure assertion — used by main + --selftest with planted fixtures.
 * @returns {string[]} error lines (empty = pass)
 */
export function assertSoleScoreboardPr({ list, branch, touches }) {
  const errs = [];
  if (!touches?.length) return errs;

  const offenders = (list || []).filter((p) => {
    if (p.isDraft) return false;
    if (p.headRefName === branch) return false;
    const paths = (p.files || []).map((f) => f.path);
    return paths.some((path) => HOTFILES.has(path));
  });

  if (offenders.length) {
    errs.push(`Rule 26 serialize scoreboard hotfiles`);
    errs.push(`this PR touches: ${touches.join(", ")}`);
    for (const o of offenders) {
      const hp = (o.files || []).map((f) => f.path).filter((p) => HOTFILES.has(p));
      errs.push(`open #${o.number} (${o.headRefName}) also touches: ${hp.join(", ")}`);
    }
    errs.push("Merge or close the other ready scoreboard PR first — do not stack hotfile PRs.");
  }
  return errs;
}

function selftest() {
  const plantedList = [
    {
      number: 9998,
      headRefName: "fix/other-scoreboard",
      isDraft: false,
      files: [{ path: "docs/module-completion/accounting.json" }],
    },
    {
      number: 9999,
      headRefName: "fix/waiting-draft",
      isDraft: true,
      files: [{ path: "docs/module-completion/banking.json" }],
    },
  ];
  const plantedTouches = ["scripts/verify-steps/CLAIMED-NUMBERS.json"];
  const errs = assertSoleScoreboardPr({
    list: plantedList,
    branch: "fix/serialize-scoreboard-hotfiles",
    touches: plantedTouches,
  });
  if (errs.length !== 4) {
    console.error(`${LABEL}: selftest FAIL — planted ready PR must be caught (got ${errs.length} lines)`);
    for (const e of errs) console.error(" ", e);
    process.exit(1);
  }
  if (!errs.some((e) => e.includes("#9998"))) {
    console.error(`${LABEL}: selftest FAIL — must name planted offender #9998`);
    process.exit(1);
  }
  if (errs.some((e) => e.includes("#9999"))) {
    console.error(`${LABEL}: selftest FAIL — draft PRs must be ignored`);
    process.exit(1);
  }
  const clean = assertSoleScoreboardPr({
    list: plantedList,
    branch: "fix/other-scoreboard",
    touches: plantedTouches,
  });
  if (clean.length) {
    console.error(`${LABEL}: selftest FAIL — current branch must be excluded`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS (planted ready offender → red; draft ignored)`);
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
      "gh pr list --base main --state open --limit 80 --json number,headRefName,isDraft,files",
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

  const errs = assertSoleScoreboardPr({ list, branch, touches });
  if (errs.length) {
    console.error(`${LABEL}: FAIL — ${errs[0]}`);
    for (const e of errs.slice(1)) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS — sole ready scoreboard-hotfile PR (touched ${touches.length} hotfile(s))`,
  );
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: FAIL`, err?.message ?? err);
  process.exit(1);
}
