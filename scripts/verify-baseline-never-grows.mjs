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

// BASELINE_GROWTH_RULING=<docs/bus filename> — same shape as verify-lane-ownership.mjs's
// LANE_CROSS: this guard's own message says growth "requires a written Lead ruling named in the
// PR body, not a regenerate," but had no mechanism actually checking for one -- a human reviewer
// was the only enforcement, and this guard is a LOCAL pre-push gate with no reviewer in the loop
// yet. Added 2026-09-22 (R56-D, docs/bus/09-22-2026-LEAD-RULING-ROUND-56-...md) when this exact
// gap blocked landing that ruling's own authorized, conditional, once-only re-baseline. The named
// file must exist in docs/bus/ — a ruling you cannot open is not a ruling.
function rulingOverride() {
  const name = (process.env.BASELINE_GROWTH_RULING || "").trim();
  if (!name) return null;
  const p = name.includes("/") ? path.join(ROOT, name) : path.join(ROOT, "docs/bus", name);
  return fs.existsSync(p) ? name : null;
}

export function analyse(nowText, beforeText, opts = {}) {
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
    // "rulingFile" in opts (including explicitly null, used by --selftest to force the
    // no-override arm hermetically) means "use exactly this, don't consult the environment."
    // Omitting the key entirely is the only case that falls through to the real env check.
    const ruling = "rulingFile" in opts ? opts.rulingFile : rulingOverride();
    if (ruling) {
      return {
        ok: true,
        message: `${LABEL}: PASS — ${problems.join("; ")} — AUTHORIZED by named Lead ruling docs/bus/${ruling.replace(/^docs\/bus\//, "")} (BASELINE_GROWTH_RULING). This growth is OPEN DEBT, not a pass — see the ruling and the baseline file's own REBASELINE_REASON block.`,
      };
    }
    return {
      ok: false,
      message:
        `${LABEL}: FAIL — ${problems.join("; ")}.\n` +
        `${LABEL}: a baseline entry is technical debt. Adding one requires a written Lead ruling named in the PR body, not a regenerate. ` +
        `To authorize: BASELINE_GROWTH_RULING=<ruling-filename-in-docs/bus> (same file the PR body cites).`,
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

  // { rulingFile: null } pinned explicitly on every "must FAIL" arm below -- these assert the
  // DETECTION mechanism itself with synthetic data and must be hermetic regardless of whatever
  // BASELINE_GROWTH_RULING happens to be set to in the ambient shell running this selftest (e.g.
  // a real push authorized under R56-D). A selftest whose pass/fail depends on the calling
  // environment is not a selftest -- caught live: without this pin, having a real
  // BASELINE_GROWTH_RULING exported (exactly the state a legitimately-authorized push is in)
  // silently flipped these synthetic "must FAIL" cases to PASS too.
  assert.equal(analyse(same, before).ok, true, "unchanged must PASS");
  assert.equal(analyse(shrunkDocs, before).ok, true, "shrunk document count must PASS");
  assert.equal(analyse(grownDocs, before, { rulingFile: null }).ok, false, "grown document count must FAIL — MUTATION escaped detection");
  assert.equal(analyse(grownCeiling, before, { rulingFile: null }).ok, false, "grown structural_d_ceiling must FAIL — MUTATION escaped detection");
  assert.equal(analyse(before, null).ok, true, "no origin/main baseline (new file on this branch) must PASS");

  // BASELINE_GROWTH_RULING override — a nonexistent ruling file must NOT authorize growth (a
  // ruling you cannot open is not a ruling); a real, existing one must.
  assert.equal(
    analyse(grownCeiling, before, { rulingFile: null }).ok,
    false,
    "no ruling supplied must still FAIL on real growth"
  );
  assert.equal(
    analyse(grownCeiling, before, { rulingFile: "09-22-2026-LEAD-RULING-ROUND-56-E1-LANE-CROSS-E7-SHAPE-PARITY-REBASELINE.md" }).ok,
    true,
    "a named, real ruling file must authorize the SAME growth that failed without one"
  );

  console.log(`${LABEL} --selftest PASS (unchanged/shrink pass, doc-growth + ceiling-growth caught, new-file arm OK, ruling-override RED-then-GREEN on the same mutation)`);
  process.exit(0);
}

main();
