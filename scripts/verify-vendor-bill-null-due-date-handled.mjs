#!/usr/bin/env node
// ACCT-F443265E4 — guard that the cash-flow rolling-ledger bills query handles NULL due_date
// via COALESCE fallback instead of filtering them out with AND due_date IS NOT NULL.
// Root: prod had 3 open vendor bills with NULL due_date — the IS NOT NULL filter silently dropped
// them, causing vendor bills to show as blank. Fix: COALESCE(b.due_date, b.bill_date, today).
// Run: node scripts/verify-vendor-bill-null-due-date-handled.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-bill-null-due-date-handled";
const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";

export function analyze(src) {
  const failures = [];

  // The billsPromise query must NOT filter out NULL due_dates
  if (/AND b\.due_date IS NOT NULL/.test(src)) {
    failures.push(
      `${FILE}: billsPromise still has 'AND b.due_date IS NOT NULL' — open bills with ` +
      `NULL due_date are silently dropped, making vendor bills appear blank. ` +
      `Use COALESCE(b.due_date, b.bill_date, $N::date) instead.`
    );
  }

  // The billsPromise SELECT must use COALESCE for the due_date column
  if (!/COALESCE\(b\.due_date,\s*b\.bill_date/.test(src)) {
    failures.push(
      `${FILE}: billsPromise SELECT does not COALESCE(b.due_date, b.bill_date, ...) — ` +
      `NULL due_dates will be returned as NULL and dropped by the bucket engine.`
    );
  }

  return failures;
}

function selftest() {
  const real = readFileSync(path.join(ROOT, FILE), "utf8");
  const good = analyze(real);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — real file should pass:\n` + good.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }

  // Mutation: reintroduce the bad filter
  const withBadFilter = real.replace(
    /AND b\.bill_category = 'vendor'/,
    "AND b.due_date IS NOT NULL\n      AND b.bill_category = 'vendor'"
  );
  if (withBadFilter === real) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: bill_category anchor not found`);
    process.exit(1);
  }
  const f1 = analyze(withBadFilter);
  if (!f1.some((f) => f.includes("IS NOT NULL"))) {
    console.error(`${LABEL} SELFTEST FAILED: adding IS NOT NULL filter was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS (1/1 planted regression caught, real file clean)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const failures = analyze(src);
  if (failures.length) {
    console.error(`${LABEL} FAILED:\n` + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} OK — billsPromise uses COALESCE(due_date, bill_date) so NULL due_date bills are included in the rolling ledger.`);
}
