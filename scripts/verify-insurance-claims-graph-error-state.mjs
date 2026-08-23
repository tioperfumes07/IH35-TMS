#!/usr/bin/env node
/**
 * GUARD: insurance ClaimsTab.tsx's graphQuery (the claim's forward/reverse linkage graph — lawsuits,
 * legal matters, accidents, incidents, bills, expenses, work orders, and the "Money FK gaps"
 * settlement-deduction summary) must render a real error state on failure, never let a failed
 * fetch masquerade as "no linked records".
 *
 * ROOT CAUSE this freezes shut: graphQuery.isError was never referenced anywhere in this file,
 * while the SAME file's main claims-list `query` correctly shows a "Failed to load claims" banner
 * on isError. If the graph fetch fails (network error, 5xx, RLS/company-scope mismatch), `graph`
 * stays undefined and the entire panel — including the Money FK gaps reconciliation summary used
 * to spot missing financial linkages — simply vanishes, indistinguishable from a claim that
 * genuinely has zero linked records. On an insurance/litigation review surface, that silently
 * masks real connections instead of surfacing the outage.
 *
 * Static-only (text-pattern) check against the real component file: graphQuery.isError must gate
 * a real inline error banner (mirroring the sibling `query.isError` banner already in this file),
 * and the existing `graph ? (...)` render must be guarded so it doesn't render alongside/instead
 * of the error banner when isError is true (window sizes measured directly against the real file:
 * 72/135/213 actual chars, all with headroom).
 *
 * Run:  node scripts/verify-insurance-claims-graph-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/insurance/ClaimsTab.tsx");
const LABEL = "verify-insurance-claims-graph-error-state";

const GATE_RE =
  /graphQuery\.isLoading[\s\S]{0,100}graphQuery\.isError[\s\S]{0,200}Failed to load claim graph[\s\S]{0,300}!graphQuery\.isError && graph \?/;

export function checkClaimsGraphErrorState(src) {
  const problems = [];

  if (!/graphQuery\.isError/.test(src)) {
    problems.push(
      "graphQuery.isError is never referenced — a failed claim-graph fetch cannot be distinguished from a claim with genuinely zero linked records"
    );
  } else if (!GATE_RE.test(src)) {
    problems.push(
      "graphQuery.isError does not gate a real error banner ahead of, and mutually exclusive with, the existing graph render — a failed fetch could still render alongside/instead of an error"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    {graphQuery.isLoading ? <p>Loading reverse links…</p> : null}
    {graph ? (
      <div className="grid gap-1 md:grid-cols-2">
        <strong>Forward:</strong>
      </div>
    ) : null}
  `;
  const badProblems = checkClaimsGraphErrorState(bad);
  if (badProblems.length !== 1) {
    failures.push(
      `the real pre-fix defect verbatim expected 1 problem, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkClaimsGraphErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced (e.g. a stray comment) but no real gate.
  const partial = `
    // graphQuery.isError is handled upstream, trust me
    {graphQuery.isLoading ? <p>Loading reverse links…</p> : null}
    {graph ? (
      <div className="grid gap-1 md:grid-cols-2">
        <strong>Forward:</strong>
      </div>
    ) : null}
  `;
  const partialProblems = checkClaimsGraphErrorState(partial);
  if (partialProblems.length !== 1) {
    failures.push(
      `a partial regression (isError mentioned but no real gate) expected 1 problem, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (1/1), the real fixed file clears, a ` +
      `partial "isError mentioned but not real gate" regression caught.`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkClaimsGraphErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — ClaimsTab.tsx's graphQuery renders a real error state on failure, matching the file's own sibling query.isError pattern.`
);
