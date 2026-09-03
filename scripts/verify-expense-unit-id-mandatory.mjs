#!/usr/bin/env node
/**
 * verify-expense-unit-id-mandatory.mjs
 *
 * GO-19-1b (owner 2026-09-03, re-scoped FORWARD GUARANTEE -- no backfill, USMCA's GL is empty:
 * 0 expenses, 0 bills, 0 fuel transactions, confirmed live). "unit_id MANDATORY on every new
 * expense. An expense with no truck cannot be costed." Applied at write time, not retroactively.
 *
 * G1  no new expense may be written with unit_id NULL
 * G2  no expense may carry a load_id whose load has a different unit_id
 * G3  fixed-cost categories (insurance, plates, the truck note) may never carry a load_id
 *
 * PROVEN FAILING before the fix (git blob, not a re-typed copy): the pre-fix
 * expenses.routes.ts unconditionally pushed `body.unit_id ?? null` with no requirement check and
 * no load_id-mismatch check -- collectFailures() below rejects that exact shape.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROUTE_PATH = "apps/backend/src/accounting/expenses.routes.ts";

function loadSource() {
  return readFileSync(ROUTE_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  // G1 — unit_id must be a hard reject when neither the direct field nor a load_id-derived value
  // resolves one. The pre-fix shape just pushed `body.unit_id ?? null` unconditionally.
  if (!/if \(!resolvedUnitId\) \{\s*\n\s*return \{ unitIdRequired: true as const \};/.test(src)) {
    failures.push("G1: no hard reject when unit_id cannot be resolved from body.unit_id or load_id");
  }
  if (!/error: "unit_id_required"/.test(src)) {
    failures.push("G1: unit_id_required error response missing");
  }

  // G2 — an explicit unit_id that conflicts with the load's own assigned unit must be rejected,
  // not silently accepted (silently accepting an operator's wrong pick corrupts Rung 2 trace-to-
  // the-leg attribution with no way to detect it later).
  if (!/resolvedUnitId && loadAssignedUnitId && resolvedUnitId !== loadAssignedUnitId/.test(src)) {
    failures.push("G2: no mismatch check between an explicit unit_id and the load's assigned_unit_id");
  }
  if (!/error: "unit_load_mismatch"/.test(src)) {
    failures.push("G2: unit_load_mismatch error response missing");
  }

  // G3 — a fixed-cost category (Rung 3: PERIOD cost on the unit, never a trip cost) must never be
  // allowed to carry a load_id, or trip margin becomes meaningless.
  if (!/FIXED_COST_CATEGORY_CODES\.has\(code\)/.test(src)) {
    failures.push("G3: no fixed-cost-category + load_id rejection");
  }
  if (!/error: "fixed_cost_cannot_carry_load_id"/.test(src)) {
    failures.push("G3: fixed_cost_cannot_carry_load_id error response missing");
  }

  return failures;
}

function provenFailingOnPriorCommit(ref) {
  // Real historical proof, not a re-typed fixture: run the SAME collectFailures() against the
  // actual pre-fix git blob for this file at `ref` (default: origin/main, before this fix landed).
  try {
    return execFileSync("git", ["show", `${ref}:${ROUTE_PATH}`], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch {
    return null; // no git context (e.g. a shallow/fixture checkout) -- selftest below still covers it
  }
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-expense-unit-id-mandatory SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    [
      "G1 hard-reject",
      /if \(!resolvedUnitId\) \{\s*\n\s*return \{ unitIdRequired: true as const \};\s*\n\s*\}/,
      "// G1 removed",
    ],
    ["G1 error response", '"unit_id_required"', '"unit_id_required_DISABLED"'],
    [
      "G2 mismatch check",
      "resolvedUnitId && loadAssignedUnitId && resolvedUnitId !== loadAssignedUnitId",
      "false",
    ],
    ["G2 error response", '"unit_load_mismatch"', '"unit_load_mismatch_DISABLED"'],
    ["G3 fixed-cost check", "FIXED_COST_CATEGORY_CODES.has(code)", "false"],
    ["G3 error response", '"fixed_cost_cannot_carry_load_id"', '"fixed_cost_cannot_carry_load_id_DISABLED"'],
  ];
  const escaped = [];
  for (const [name, pattern, replacement] of mutations) {
    const planted = src.replace(pattern, replacement);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-expense-unit-id-mandatory SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-expense-unit-id-mandatory SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

if (process.argv.includes("--prove-failing-prior")) {
  const refArgIdx = process.argv.indexOf("--prove-failing-prior");
  const ref = process.argv[refArgIdx + 1] && !process.argv[refArgIdx + 1].startsWith("--") ? process.argv[refArgIdx + 1] : "origin/main";
  const priorBlob = provenFailingOnPriorCommit(ref);
  if (priorBlob == null) {
    console.log("verify-expense-unit-id-mandatory PROVE-FAILING — no git context available, skipped");
  } else {
    const priorFailures = collectFailures(priorBlob);
    if (priorFailures.length === 0) {
      console.error("verify-expense-unit-id-mandatory PROVE-FAILING FAIL — prior commit's blob already passes (nothing was actually added)");
      process.exit(1);
    }
    console.log(`verify-expense-unit-id-mandatory PROVE-FAILING PASS — prior commit correctly failed: ${priorFailures.join(" | ")}`);
  }
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-expense-unit-id-mandatory: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-expense-unit-id-mandatory: OK — G1 (unit_id required, direct or load-derived), G2 (unit_id/load mismatch rejected), G3 (fixed-cost categories never carry load_id) all wired"
);
