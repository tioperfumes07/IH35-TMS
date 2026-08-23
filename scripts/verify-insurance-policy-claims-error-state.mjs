#!/usr/bin/env node
/**
 * GUARD: insurance PolicyDetail.tsx's claimsQuery must render a real error state on failure, never
 * let a failed fetch masquerade as "no claims attached to this policy."
 *
 * ROOT CAUSE this freezes shut: apps/frontend/src/pages/insurance/PolicyDetail.tsx's claimsQuery
 * was the one query in the file with no `.isError` reference, sitting directly between the
 * correctly-guarded COI History and Lawsuits sections (both use the exact same
 * `XQuery.isError ? <ListErrorState .../> : <ParityTable .../>` shape) — a copy/paste omission, not
 * a design choice. A failed claims fetch rendered the honest-looking "No claims attached to this
 * policy." (a false-empty state) instead of an error.
 *
 * Static-only (text-pattern) check against the real component file: claimsQuery.isError must gate
 * a ListErrorState render, placed before the ParityTable it replaces on error.
 *
 * Run:  node scripts/verify-insurance-policy-claims-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/insurance/PolicyDetail.tsx");
const LABEL = "verify-insurance-policy-claims-error-state";

export function checkClaimsErrorState(src) {
  const problems = [];
  if (!/claimsQuery\.isError/.test(src)) {
    problems.push("claimsQuery.isError is never referenced — a failed fetch cannot be distinguished from a real empty claims list");
  }
  // ListErrorState must be the TRUE-arm of a ternary gated on claimsQuery.isError, with
  // <ParityTable as the else-arm — proves it's one ternary (both cannot render at once), not two
  // independently-rendered elements. Window widened to 500 (not the initially-tried 300): the real
  // ListErrorState block (title/status/message/onRetry props) runs ~310 chars end-to-end, which a
  // narrower window silently missed — measured directly against the real file, not guessed.
  if (!/claimsQuery\.isError\s*\?\s*\([\s\S]{0,500}<ListErrorState[\s\S]{0,500}\)\s*:\s*\([\s\S]{0,500}<ParityTable/.test(src)) {
    problems.push("ParityTable is not the else-arm of the same claimsQuery.isError ternary as ListErrorState — it could still render a false-empty list alongside/instead of the error");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    <div className="mt-2">
      <ParityTable
        rows={claims}
        columns={claimColumns}
        rowKey={(claim) => claim.id}
        loading={claimsQuery.isPending}
        storageKey="insurance-policy-claims"
        emptyText="No claims attached to this policy."
      />
    </div>
  `;
  const badProblems = checkClaimsErrorState(bad);
  if (badProblems.length !== 2) {
    failures.push(`the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`);
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkClaimsErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced (e.g. in a comment) but no real ternary gate.
  const partial = `
    // claimsQuery.isError is handled upstream, trust me
    <div className="mt-2">
      <ParityTable rows={claims} columns={claimColumns} rowKey={(claim) => claim.id} loading={claimsQuery.isPending} storageKey="insurance-policy-claims" emptyText="No claims attached to this policy." />
    </div>
  `;
  if (checkClaimsErrorState(partial).length !== 1) {
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
const problems = checkClaimsErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — insurance PolicyDetail.tsx's claimsQuery renders a real error state on failure, matching its coiQuery/lawsuitsQuery siblings.`);
