#!/usr/bin/env node
/** LST-F133 — Dispute/DailyRecon/Payments/JE-detail/Recurring/AuditReport human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx",
  "apps/frontend/src/pages/accounting/DailyReconPage.tsx",
  "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
  "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
  "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx",
  "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx",
];
const LABEL = "verify-dispute-recon-payments-je-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[3]] = planted[FILES[3]].replace(
    /entityLabel\(row\.customer_name,\s*row\.customer_id,\s*"Customer"\)/,
    "row.customer_id?.slice(0, 8)",
  );
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
