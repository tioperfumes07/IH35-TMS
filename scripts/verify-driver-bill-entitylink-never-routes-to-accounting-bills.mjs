#!/usr/bin/env node
/**
 * verify-driver-bill-entitylink-never-routes-to-accounting-bills — ACCT-F5870.
 *
 * [[driver-finance-driver-bills-not-accounting-bills]]: driver_finance.driver_bills (the table
 * settlement_lines.source_driver_bill_id / EntityLink kind="driver_bill" points at) is a DIFFERENT
 * table from accounting.bills, with a disjoint id space — routing a driver_bill id to
 * /accounting/bills/:id 404s (or worse, could coincidentally resolve to an unrelated bill).
 *
 * This has now happened TWICE independently in the same session: once resolved correctly (fall
 * through to `default: return null`, matching EntityLink's own "never fabricate a route" law), then
 * a same-day 4th-emergency compile-error fix re-added `case "bill": case "driver_bill":` sharing the
 * accounting.bills route — the exact landmine, reintroduced by a different fix for the same
 * underlying TS error. This guard makes that regression impossible to reintroduce silently.
 *
 * Static-only (text-pattern) check against the real component file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/frontend/src/components/shared/EntityLink.tsx");
const LABEL = "verify-driver-bill-entitylink-never-routes-to-accounting-bills";

export function checkDriverBillNeverSharesAccountingBillsRoute(src) {
  const problems = [];
  // Any switch case that lists "driver_bill" together with (or falling into) "bill"'s
  // /accounting/bills/ route is the exact regression class.
  const sharedCaseRe = /case\s+"bill":\s*\n\s*case\s+"driver_bill":/;
  if (sharedCaseRe.test(src)) {
    problems.push('EntityKind "driver_bill" falls through the same switch case as "bill" (shares /accounting/bills/:id) — driver_finance.driver_bills is a different table with a disjoint id space, this 404s (or worse) on a real id');
  }
  // Any direct case for driver_bill returning the accounting/bills path at all (even standalone).
  const directRouteRe = /case\s+"driver_bill":\s*\n\s*return\s+`\/accounting\/bills\//;
  if (directRouteRe.test(src)) {
    problems.push('EntityKind "driver_bill" has its own case resolving to /accounting/bills/:id — same wrong-table defect, just not sharing the case label with "bill"');
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const badShared = `
    switch (kind) {
      case "bill":
      case "driver_bill":
        return \`/accounting/bills/\${id}\`;
    }
  `;
  if (checkDriverBillNeverSharesAccountingBillsRoute(badShared).length === 0) {
    failures.push("case1 FAIL — shared case-fallthrough regression must be caught");
  }

  const badDirect = `
    switch (kind) {
      case "driver_bill":
        return \`/accounting/bills/\${id}\`;
    }
  `;
  if (checkDriverBillNeverSharesAccountingBillsRoute(badDirect).length === 0) {
    failures.push("case2 FAIL — standalone driver_bill->accounting/bills route must be caught");
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkDriverBillNeverSharesAccountingBillsRoute(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — both regression shapes caught (2/2), the real fixed file clears.`);
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkDriverBillNeverSharesAccountingBillsRoute(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — EntityKind "driver_bill" never resolves to accounting.bills's route.`);
