#!/usr/bin/env node
// verify-baseline-never-grows — independent, second-layer enforcement that
// scripts/verify-alwaystrack-parity.baseline.json can only SHRINK between commits.
//
// verify-alwaystrack-parity.mjs's own UPDATE_ALWAYSTRACK_PARITY_BASELINE=1 regenerate mode already
// refuses to grow the file at write-time (in-process). This guard is deliberately independent of
// that logic — it compares the file AS COMMITTED on this branch against the file AS COMMITTED on
// origin/main, via git, so it still catches a baseline grown by any OTHER path (a hand-edit, a
// different script, a bad merge) that the regenerate-mode's own refuse-check never sees. Adding a
// document (or raising the structural_d_ceiling) requires a written Lead ruling named in the PR body
// — this guard is what makes that requirement real rather than aspirational.
//
// Checks BOTH shrink-only dimensions the baseline carries: `documents` (one entry per mismatched
// AlwaysTrack settlement document) and `structural_d_ceiling` (expense_count/fuel_count unlinked-row
// ceilings) — a baseline that shrinks its document count while quietly raising a ceiling is still a
// regression, not a fix.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "scripts/verify-alwaystrack-parity.baseline.json";
const P = path.join(ROOT, REL);
const LABEL = "verify-baseline-never-grows";
const SELFTEST = process.argv.includes("--selftest");

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function shape(text) {
  const j = parse(text);
  if (!j) return null;
  return {
    docCount: Object.keys(j.documents ?? {}).length,
    expenseCeiling: Number(j.structural_d_ceiling?.expense_count ?? 0),
    fuelCeiling: Number(j.structural_d_ceiling?.fuel_count ?? 0),
  };
}

export function analyse(nowText, beforeText) {
  const now = shape(nowText);
  if (!now) return { ok: false, message: `${LABEL}: FAIL — current baseline file is unreadable/invalid JSON` };
  if (beforeText == null) {
    return { ok: true, message: `${LABEL}: PASS — baseline is new on this branch, ${now.docCount} document(s)` };
  }
  const before = shape(beforeText);
  if (!before) {
    return { ok: true, message: `${LABEL}: PASS — origin/main's baseline was unreadable; treating as new (${now.docCount} document(s))` };
  }
  const problems = [];
  if (now.docCount > before.docCount) {
    problems.push(`document count GREW ${before.docCount} -> ${now.docCount}`);
  }
  if (now.expenseCeiling > before.expenseCeiling) {
    problems.push(`structural_d_ceiling.expense_count GREW ${before.expenseCeiling} -> ${now.expenseCeiling}`);
  }
  if (now.fuelCeiling > before.fuelCeiling) {
    problems.push(`structural_d_ceiling.fuel_count GREW ${before.fuelCeiling} -> ${now.fuelCeiling}`);
  }
  if (problems.length) {
    return {
      ok: false,
      message:
        `${LABEL}: FAIL — ${problems.join("; ")}.\n` +
        `${LABEL}: a baseline entry is technical debt. Adding one requires a written Lead ruling named in the PR body, not a regenerate.`,
    };
  }
  const shrunk = now.docCount < before.docCount || now.expenseCeiling < before.expenseCeiling || now.fuelCeiling < before.fuelCeiling;
  return {
    ok: true,
    message: `${LABEL}: PASS — documents ${before.docCount} -> ${now.docCount}, expense ceiling ${before.expenseCeiling} -> ${now.expenseCeiling}, fuel ceiling ${before.fuelCeiling} -> ${now.fuelCeiling}${shrunk ? " (ratcheted down)" : " (unchanged)"}`,
  };
}

function main() {
  if (!fs.existsSync(P)) {
    console.log(`${LABEL}: SKIP — no baseline file yet`);
    process.exit(0);
  }
  const nowText = fs.readFileSync(P, "utf8");
  let beforeText = null;
  try {
    beforeText = execSync(`git show origin/main:${REL}`, { cwd: ROOT, encoding: "utf8" });
  } catch {
    beforeText = null; // file doesn't exist on origin/main yet — this branch is introducing it
  }
  const result = analyse(nowText, beforeText);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (SELFTEST) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const before = JSON.stringify({ documents: { a: {}, b: {} }, structural_d_ceiling: { expense_count: 10, fuel_count: 5 } });
  const same = JSON.stringify({ documents: { a: {}, b: {} }, structural_d_ceiling: { expense_count: 10, fuel_count: 5 } });
  const shrunkDocs = JSON.stringify({ documents: { a: {} }, structural_d_ceiling: { expense_count: 10, fuel_count: 5 } });
  const grownDocs = JSON.stringify({ documents: { a: {}, b: {}, c: {} }, structural_d_ceiling: { expense_count: 10, fuel_count: 5 } });
  const grownCeiling = JSON.stringify({ documents: { a: {}, b: {} }, structural_d_ceiling: { expense_count: 11, fuel_count: 5 } });

  assert.equal(analyse(same, before).ok, true, "unchanged must PASS");
  assert.equal(analyse(shrunkDocs, before).ok, true, "shrunk document count must PASS");
  assert.equal(analyse(grownDocs, before).ok, false, "grown document count must FAIL — MUTATION escaped detection");
  assert.equal(analyse(grownCeiling, before).ok, false, "grown structural_d_ceiling must FAIL — MUTATION escaped detection");
  assert.equal(analyse(before, null).ok, true, "no origin/main baseline (new file on this branch) must PASS");

  console.log(`${LABEL} --selftest PASS (unchanged/shrink pass, doc-growth + ceiling-growth caught, new-file arm OK)`);
  process.exit(0);
}

main();
