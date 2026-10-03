#!/usr/bin/env node
/** LST-F117 — VendorBalances / VendorCredits / BillPaymentsList: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/accounting/VendorBalancesPage.tsx",
  "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
];
const LABEL = "verify-vendor-money-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.id\.slice\(0,\s*8\)/.test(src) || /bill_id\.slice\(0,\s*8\)/.test(src) || /vendorFilter\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: still contains UUID slice chrome`);
    }
    if (!/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
    // BANK-F91080 — ORDERS chrome: VendorBalancesPage uses text-xs, not text-[11px].
    if (file.endsWith("VendorBalancesPage.tsx") && src.includes("text-[11px]")) {
      problems.push(`${file}: must not use text-[11px] — use text-xs`);
    }
    if (file.endsWith("VendorBalancesPage.tsx") && (!src.includes("UnclearedDocumentsNote") || !src.includes("not cleared") || !src.includes("bg-slate-100"))) {
      problems.push(`${file}: 363-CUR-A must name uncleared payments not cleared on slate`);
    }
    // BANK-F91083 — ORDERS chrome: VendorCreditsPage uses text-xs, not text-[11px].
    if (file.endsWith("VendorCreditsPage.tsx") && src.includes("text-[11px]")) {
      problems.push(`${file}: must not use text-[11px] — use text-xs`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  const vb = FILES[0];
  planted[vb] = planted[vb].replace(/UnclearedDocumentsNote/g, "GoneNote");
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
