#!/usr/bin/env node
/**
 * GUARD: reports/cash-flow-overview.routes.ts's hist7/hist30 inflow+outflow SUM queries must use
 * ABS(t.amount_cents), never sum the raw signed value — never let a Plaid-signed credit row
 * silently produce a NEGATIVE "inflow" average.
 *
 * ROOT CAUSE this freezes shut: banking.bank_transactions.amount_cents is not a normalized
 * magnitude across every ingestion path — live-verified on USMCA, Plaid-sourced credit
 * (is_credit=true, money IN) rows store amount_cents NEGATIVE (Plaid's own raw sign convention),
 * while debit rows store it positive. Summing t.amount_cents directly for is_credit=true rows
 * therefore summed negative numbers, producing a negative "inflow" — live-observed as
 * "Avg daily inflow: -$3,947.79" on /reports/cash-flow-overview, a genuinely nonsensical figure
 * on a real money surface. Direction must come ONLY from is_credit
 * (bank-feed-gl-posting.service.ts states this as a repo-wide law); ABS() restores the magnitude
 * regardless of which ingestion path signed it which way.
 *
 * Static-only (text-pattern) check against the real route file: both the hist7 and hist30 query
 * blocks (bounded by their own `const histN =` declarations, since each block is ~800-1500 chars
 * — too wide for one safe fixed regex window per the near-misses hit earlier this session) must
 * each contain exactly the ABS(t.amount_cents) pattern twice (once for the inflow CASE, once for
 * the outflow CASE).
 *
 * Run:  node scripts/verify-cash-flow-overview-avg-flow-sign.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/backend/src/reports/cash-flow-overview.routes.ts");
const LABEL = "verify-cash-flow-overview-avg-flow-sign";

function countAbs(block) {
  return (block.match(/ABS\(t\.amount_cents\)/g) || []).length;
}

export function checkCashFlowOverviewAvgFlowSign(src) {
  const problems = [];

  const hist7Idx = src.indexOf("const hist7 =");
  const hist30Idx = src.indexOf("const hist30 =");

  if (hist7Idx === -1 || hist30Idx === -1 || hist30Idx <= hist7Idx) {
    problems.push("hist7/hist30 query declarations not found in expected order — file structure changed unexpectedly");
    return problems;
  }

  const hist7Block = src.slice(hist7Idx, hist30Idx);
  if (countAbs(hist7Block) < 2) {
    problems.push(
      "hist7 (last-7-day) inflow/outflow SUM does not wrap t.amount_cents in ABS() for both CASE arms — a Plaid-signed credit row can still produce a negative inflow"
    );
  }

  const hist30Block = src.slice(hist30Idx, hist30Idx + 1500);
  if (countAbs(hist30Block) < 2) {
    problems.push(
      "hist30 (30-day average) inflow/outflow SUM does not wrap t.amount_cents in ABS() for both CASE arms — a Plaid-signed credit row can still produce a negative avg daily inflow"
    );
  }

  if (/\.catch\(\(\) => \(\{ rows: \[\{ payroll_cents: "0"/.test(src)) {
    problems.push(
      "bank totals must not catch-fail as $0 — a query error must fail the overview, not paint fake zeros"
    );
  }
  if (/\.catch\(\(\) => \(\{ rows: \[\] as Record<string, unknown>\[\] \}\)\)/.test(src)) {
    problems.push(
      "factoring_summary must not catch-fail as empty — a query error must fail the overview, not hide reserves/advances/chargebacks"
    );
  }
  if (/\.catch\(\(\) => \(\{ rows: \[\{ c: "0" \}\] \}\)\)/.test(src)) {
    problems.push("uncategorized count must not catch-fail as 0");
  }
  if ((src.match(/\.catch\(\(\) => \(\{ rows: \[\{ amt: "0" \}\] \}\)\)/g) || []).length > 0) {
    problems.push("AR/AP/settlement totals must not catch-fail as $0");
  }
  if (/\.catch\(\(\) => \(\{ rows: \[\{ inflow: "0", outflow: "0" \}\] \}\)\)/.test(src)) {
    problems.push("history inflow/outflow must not catch-fail as $0");
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    const hist7 = await client.query(\`
      SELECT
        COALESCE(SUM(CASE WHEN t.is_credit THEN t.amount_cents ELSE 0 END), 0)::text AS inflow,
        COALESCE(SUM(CASE WHEN NOT t.is_credit THEN t.amount_cents ELSE 0 END), 0)::text AS outflow
      FROM banking.bank_transactions t
    \`);

    const hist30 = await client.query(\`
      SELECT
        COALESCE(SUM(CASE WHEN t.is_credit THEN t.amount_cents ELSE 0 END), 0)::text AS inflow,
        COALESCE(SUM(CASE WHEN NOT t.is_credit THEN t.amount_cents ELSE 0 END), 0)::text AS outflow
      FROM banking.bank_transactions t
    \`);
  `;
  const badProblems = checkCashFlowOverviewAvgFlowSign(bad);
  if (badProblems.length !== 2) {
    failures.push(
      `the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkCashFlowOverviewAvgFlowSign(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  const fakeZero = good.replace(
    "const hideOn = await isBankAccountHideEnabled(client, companyId).catch(() => false);",
    `const hideOn = await isBankAccountHideEnabled(client, companyId).catch(() => false);
      const planted = Promise.resolve().catch(() => ({ rows: [{ payroll_cents: "0", dip_cents: "0", total_cents: "0" }] }));`,
  );
  if (fakeZero === good) {
    failures.push("selftest could not plant bank-totals fake-$0 catch");
  } else {
    const plantedProblems = checkCashFlowOverviewAvgFlowSign(fakeZero);
    if (!plantedProblems.some((p) => /bank totals must not catch-fail/.test(p))) {
      failures.push(`planted fake-$0 catch not detected: ${plantedProblems.join("; ")}`);
    }
  }

  // Partial fix: only hist7 fixed, hist30 still raw — proves the two blocks are checked
  // independently.
  const partial = bad.replace(
    "const hist7 = await client.query(`\n      SELECT\n        COALESCE(SUM(CASE WHEN t.is_credit THEN t.amount_cents ELSE 0 END), 0)::text AS inflow,\n        COALESCE(SUM(CASE WHEN NOT t.is_credit THEN t.amount_cents ELSE 0 END), 0)::text AS outflow",
    "const hist7 = await client.query(`\n      SELECT\n        COALESCE(SUM(CASE WHEN t.is_credit THEN ABS(t.amount_cents) ELSE 0 END), 0)::text AS inflow,\n        COALESCE(SUM(CASE WHEN NOT t.is_credit THEN ABS(t.amount_cents) ELSE 0 END), 0)::text AS outflow"
  );
  const partialProblems = checkCashFlowOverviewAvgFlowSign(partial);
  if (partialProblems.length !== 1) {
    failures.push(
      `a partial fix (hist7 fixed, hist30 still not) expected 1 problem, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (2/2), the real fixed file clears, a ` +
      `partial fix (hist7 only) caught (1/1).`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkCashFlowOverviewAvgFlowSign(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — cash-flow-overview.routes.ts's hist7/hist30 inflow+outflow sums use ABS(t.amount_cents), immune to which ingestion path signed the row which way.`
);
