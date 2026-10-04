#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-wiring-law-guard-registry-batch";
// ROUND 389 (Lead, 2026-10-03) — ratcheted 93 -> 3. 155 guards existed in scripts/ that no workflow
// and no verify-step ever executed; measured against production, 155 of 158 PASSED. They were not
// filler — they cover the natural-sign rendering, the bills sub-tab types, multi-select columns, the
// whole Reclassify screen, duplicate refusal, and the undo / void / reversal / cancellation set that
// gates the purge. verify-guards-do-not-run-as-ih35_app, the check on the checkers, was itself one of
// them. All 155 are now wired as verify-steps. The 3 that remain are the 3 that FAIL, named in
// docs/bus/10-03-2026-LEAD-RULING-WIRE-THE-ORPHAN-GUARDS.md; the ceiling is set to exactly that count
// so the debt cannot quietly regrow and so reaching 0 means those three are fixed, not hidden.
const MAX_REMAINING = 3;
const REQUIRED = [
  "verify-fully-wired-complete-bar-present.mjs",
  "verify-honest-built-launch-law-present.mjs",
  "verify-matrix-built-leaf-specific.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  if (classification.unaccounted.length > MAX_REMAINING) out.push(`unaccounted guard census ${classification.unaccounted.length} exceeds ${MAX_REMAINING}`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: Array.from({ length: MAX_REMAINING }, (_, i) => `other-${i}.mjs`) };
  for (const value of [{ ...baseline, fullyWired: REQUIRED.slice(1) }, { ...baseline, unaccounted: [...baseline.unaccounted, "regression.mjs"] }]) {
    if (!failures(value).length) throw new Error("planted defect escaped");
  }
  console.log(`${LABEL} SELFTEST PASS — 2/2 planted defects rejected`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — three all-module wiring-law guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
