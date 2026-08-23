#!/usr/bin/env node
/**
 * GUARD: safety HoursOfServicePage.tsx's violationsQuery must render a real error state on
 * failure, never let a failed fetch masquerade as "No open violations on file."
 *
 * ROOT CAUSE this freezes shut: violationsQuery never referenced .isError, while the SAME file's
 * fleetQuery correctly gates on isError with ListErrorState (a prior fix, CLS-LIST-ERROR-STATE-
 * UNGUARDED, already closed that gap for the fleet section but the violations panel — a bespoke
 * <ul>, not a ParityTable — was never touched). A failed violations fetch on this DOT-compliance
 * dashboard silently rendered a false all-clear.
 *
 * Static-only (text-pattern) check against the real component file: violationsQuery.isError must
 * gate a ListErrorState render, placed as the first branch ahead of the existing
 * violations.length === 0 / <ul> ternary chain.
 *
 * Run:  node scripts/verify-safety-hos-violations-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/safety/HoursOfServicePage.tsx");
const LABEL = "verify-safety-hos-violations-error-state";

export function checkViolationsErrorState(src) {
  const problems = [];
  if (!/violationsQuery\.isError/.test(src)) {
    problems.push("violationsQuery.isError is never referenced — a failed fetch cannot be distinguished from a real empty violations list");
  }
  // ListErrorState must be the first arm of a ternary chain gated on violationsQuery.isError, with
  // the existing violations.length === 0 check as the (or an) else-arm — proves it's one ternary
  // chain, not two independently-rendered elements. Window measured directly against the real
  // file (~180 chars for the ListErrorState block) with headroom, per the two prior near-misses
  // this session where an undersized window silently missed the real match.
  if (!/violationsQuery\.isError\s*\?\s*\([\s\S]{0,500}<ListErrorState[\s\S]{0,500}\)\s*:\s*violations\.length\s*===\s*0/.test(src)) {
    problems.push("violations.length === 0 is not the else-arm of the same violationsQuery.isError ternary as ListErrorState — it could still render a false-empty message alongside/instead of the error");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    <div className="max-h-80 overflow-y-auto p-2">
      {violations.length === 0 ? (
        <p className="text-xs text-slate-500">No open violations on file.</p>
      ) : (
        <ul className="space-y-2 text-xs">{violations.map((row) => <li key={row.id} />)}</ul>
      )}
    </div>
  `;
  const badProblems = checkViolationsErrorState(bad);
  if (badProblems.length !== 2) {
    failures.push(`the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`);
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkViolationsErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced (e.g. a stray comment) but no real ternary gate.
  const partial = `
    // violationsQuery.isError is handled upstream, trust me
    <div className="max-h-80 overflow-y-auto p-2">
      {violations.length === 0 ? (
        <p className="text-xs text-slate-500">No open violations on file.</p>
      ) : (
        <ul className="space-y-2 text-xs">{violations.map((row) => <li key={row.id} />)}</ul>
      )}
    </div>
  `;
  if (checkViolationsErrorState(partial).length !== 1) {
    failures.push("a partial regression (isError mentioned but no real ternary gate) was not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (2/2), the real fixed file clears, a ` +
      `partial "isError mentioned but not real gate" regression caught.`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkViolationsErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — HoursOfServicePage.tsx's violationsQuery renders a real error state on failure, matching its fleetQuery sibling.`);
