#!/usr/bin/env node
/**
 * GUARD: driver-finance SettlementDetailPage.tsx's detailQuery must render a real error state on
 * failure, never let a failed fetch masquerade as a genuine $0.00 settlement with no lines.
 *
 * ROOT CAUSE this freezes shut: detailQuery.isError was never referenced anywhere in this file —
 * `const settlement = (detailQuery.data ?? {}) as Record<string, unknown>` silently fell back to
 * an empty object on failure, and every downstream figure (lines, earnings, extra,
 * reimbursements, deductions, totals, dispute-button visibility) derives from that object. A
 * failed fetch rendered indistinguishably from a real empty settlement — exactly the "silent
 * false negative" already fixed for the smaller sibling paymentEventsQuery in this same file
 * under LV-SETTLEMENT-DETAIL-CALLS-REFUSED-ROUTE (PR #4956), just never applied to the query that
 * drives every dollar figure on the page.
 *
 * Static-only (text-pattern) check against the real component file: an early-return guard
 * (`if (detailQuery.isError)`) must gate a ListErrorState render with a real onRetry, mirroring
 * the file's own `if (!settlementId)` early-return precedent — window sizes measured directly
 * against the real file (222 / 131 actual chars) with headroom.
 *
 * Run:  node scripts/verify-settlement-detail-page-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");
const LABEL = "verify-settlement-detail-page-error-state";

const GATE_RE =
  /if \(detailQuery\.isError\) \{[\s\S]{0,300}<ListErrorState[\s\S]{0,300}onRetry=\{\(\) => void detailQuery\.refetch\(\)\}/;

export function checkSettlementDetailErrorState(src) {
  const problems = [];

  if (!/detailQuery\.isError/.test(src)) {
    problems.push(
      "detailQuery.isError is never referenced — a failed settlement fetch cannot be distinguished from a real $0.00 settlement with no lines"
    );
  } else if (!GATE_RE.test(src)) {
    problems.push(
      "detailQuery.isError does not gate an early-return ListErrorState with a real onRetry — a failed fetch could still fall through to `settlement = detailQuery.data ?? {}` and render as if genuinely empty"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    if (!settlementId) {
      return (
        <div className="space-y-3">
          <div>No settlement selected.</div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <PageHeader title="Settlement Detail" />
      </div>
    );
  `;
  const badProblems = checkSettlementDetailErrorState(bad);
  if (badProblems.length !== 1) {
    failures.push(
      `the real pre-fix defect verbatim expected 1 problem, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkSettlementDetailErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced (e.g. a stray comment) but no real early-return gate.
  const partial = `
    // detailQuery.isError is handled upstream, trust me
    if (!settlementId) {
      return (
        <div className="space-y-3">
          <div>No settlement selected.</div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <PageHeader title="Settlement Detail" />
      </div>
    );
  `;
  const partialProblems = checkSettlementDetailErrorState(partial);
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
const problems = checkSettlementDetailErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — SettlementDetailPage.tsx's detailQuery renders a real error state on failure, matching this file's own sibling paymentEventsQuery fix (LV-SETTLEMENT-DETAIL-CALLS-REFUSED-ROUTE).`
);
