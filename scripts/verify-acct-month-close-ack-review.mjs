#!/usr/bin/env node
/**
 * verify-acct-month-close-ack-review.mjs — Accounting Full Audit 20/22
 *
 * Month-close A/R + A/P aging gates must allow accountant review acknowledgment
 * (not require zero overdue rows — G11-10 unsatisfiable for factoring carriers).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-month-close-ack-review";

const PATHS = {
  service: "apps/backend/src/accounting/month-close.service.ts",
  routes: "apps/backend/src/accounting/month-close.routes.ts",
  api: "apps/frontend/src/api/accounting.ts",
  page: "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check() {
  const failures = [];
  const service = read(PATHS.service);
  const routes = read(PATHS.routes);
  const api = read(PATHS.api);
  const page = read(PATHS.page);

  if (!/acknowledgeMonthCloseChecklist/.test(service)) {
    failures.push(`${PATHS.service}: acknowledgeMonthCloseChecklist export missing`);
  }
  if (!/accounting\.month_close_checklist_ack/.test(service)) {
    failures.push(`${PATHS.service}: must append audit event accounting.month_close_checklist_ack`);
  }
  if (!/arOverdueCount === 0 \|\| acknowledgments\.ar_aging_review/.test(service)) {
    failures.push(`${PATHS.service}: A/R complete must be zero overdue OR acknowledged review`);
  }
  if (!/apOverdueCount === 0 \|\| acknowledgments\.ap_aging_review/.test(service)) {
    failures.push(`${PATHS.service}: A/P complete must be zero overdue OR acknowledged review`);
  }
  if (!/reviewed:/.test(service)) {
    failures.push(`${PATHS.service}: status payload must expose reviewed flags`);
  }
  if (!/month-close-acknowledge/.test(routes)) {
    failures.push(`${PATHS.routes}: POST /api/v1/accounting/month-close-acknowledge missing`);
  }
  if (!/acknowledgeMonthCloseChecklist/.test(api)) {
    failures.push(`${PATHS.api}: FE client for acknowledge missing`);
  }
  if (!/Mark reviewed/.test(page)) {
    failures.push(`${PATHS.page}: Mark reviewed affordance missing`);
  }
  if (!/period-close-history/.test(page)) {
    failures.push(`${PATHS.page}: period close history link missing`);
  }
  if (!/reports\/ar-aging/.test(page) || !/reports\/ap-aging/.test(page)) {
    failures.push(`${PATHS.page}: aging checklist must link to reports ar/ap aging`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (check().length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
