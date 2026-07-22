#!/usr/bin/env node
/**
 * verify-push-gate-conflict-markers — the pre-push conflict guard must detect a REAL interrupted
 * operation, and must NOT fire on git's post-rebase leftovers.
 *
 * WHY THIS EXISTS (regression lock, 2026-07-22):
 * `branch-precheck-push.mjs` listed `REBASE_HEAD` among its "operation in progress" markers. git
 * writes REBASE_HEAD during a rebase and LEAVES IT BEHIND after the rebase completes successfully —
 * it is a convenience ref to the commit being replayed, not an in-progress marker. The result was
 * that EVERY push following ANY rebase failed with
 *   `branch:precheck-push FAIL category=conflict: merge/rebase/cherry-pick operation is still in progress`
 * on a completely clean tree. Observed live: rebase printed "Successfully rebased",
 * `git status --porcelain` empty, `git diff --diff-filter=U` empty, no rebase-merge/rebase-apply
 * directory — and the push was still refused until `.git/REBASE_HEAD` was deleted by hand.
 *
 * A gate that cries wolf is worse than no gate: it trains authors to reach for `--no-verify`, and
 * then the real conflicts get pushed too. So this guard locks BOTH directions:
 *   1. REBASE_HEAD must NOT be treated as an in-progress marker (no false positives), and
 *   2. the authoritative markers MUST still be checked (no weakening) — MERGE_HEAD and
 *      CHERRY_PICK_HEAD (git removes both on completion/abort) plus the rebase-merge /
 *      rebase-apply directories git uses for an interrupted rebase.
 *
 * Run: node scripts/verify-push-gate-conflict-markers.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = "scripts/branch-precheck-push.mjs";
const LABEL = "verify-push-gate-conflict-markers";

/** Markers git clears on completion/abort — real evidence of an interrupted operation. */
const REQUIRED_MARKERS = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"];
/** Left behind by git AFTER a successful rebase — never an in-progress signal. */
const FORBIDDEN_MARKERS = ["REBASE_HEAD"];

/** Extract the marker array literal the gate actually tests with fs.existsSync. */
export function extractMarkerList(src) {
  const m = src.match(/const hasOperationState\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/"([A-Za-z_-]+)"/g)].map((x) => x[1]);
}

export function checkMarkers(markers) {
  const errors = [];
  if (markers === null) {
    errors.push(`${GATE}: could not find the hasOperationState marker list — the conflict guard may have been removed or renamed`);
    return errors;
  }
  for (const forbidden of FORBIDDEN_MARKERS) {
    if (markers.includes(forbidden)) {
      errors.push(
        `${GATE}: "${forbidden}" must NOT be an in-progress marker — git leaves it behind after a ` +
          `SUCCESSFUL rebase, so every post-rebase push would falsely fail as "operation still in progress"`,
      );
    }
  }
  for (const required of REQUIRED_MARKERS) {
    if (!markers.includes(required)) {
      errors.push(
        `${GATE}: "${required}" must stay in the in-progress marker list — dropping it would let a ` +
          `genuinely interrupted merge/rebase/cherry-pick be pushed`,
      );
    }
  }
  return errors;
}

/** The unmerged-paths check must remain — it is the other half of the conflict guard. */
export function checksUnmergedPaths(src) {
  return /--diff-filter=U/.test(src) && /unmerged\s*\|\|\s*hasOperationState/.test(src);
}

function selftest() {
  const failures = [];

  const good = `const hasOperationState = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]
    .some((marker) => fs.existsSync(path.join(stateDir, marker)));
    if (unmerged || hasOperationState) { }
    runGitOrThrow(["diff", "--name-only", "--diff-filter=U"]);`;
  if (checkMarkers(extractMarkerList(good)).length) failures.push("good fixture rejected");
  if (!checksUnmergedPaths(good)) failures.push("good fixture: unmerged-path check not detected");

  const regressed = `const hasOperationState = ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]`;
  const regErrors = checkMarkers(extractMarkerList(regressed));
  if (!regErrors.some((e) => e.includes("REBASE_HEAD"))) {
    failures.push("REGRESSION LOCK BROKEN: re-adding REBASE_HEAD was not flagged");
  }

  const weakened = `const hasOperationState = ["MERGE_HEAD"]`;
  const weakErrors = checkMarkers(extractMarkerList(weakened));
  if (weakErrors.length < 3) failures.push("WEAKENING NOT CAUGHT: dropping real markers was not flagged");

  if (extractMarkerList("no marker list here at all") !== null) failures.push("missing list not reported as null");
  if (checkMarkers(null).length === 0) failures.push("a removed conflict guard was not flagged");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
}

function main() {
  const src = readFileSync(join(ROOT, GATE), "utf8");
  const errors = checkMarkers(extractMarkerList(src));
  if (!checksUnmergedPaths(src)) {
    errors.push(`${GATE}: the unmerged-paths check (--diff-filter=U, gating with hasOperationState) must remain`);
  }
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — push gate detects real interrupted operations (${REQUIRED_MARKERS.join(", ")}) ` +
      `and no longer false-fires on git's post-rebase REBASE_HEAD leftover.`,
  );
}

if (process.argv.includes("--selftest")) selftest();
else main();
