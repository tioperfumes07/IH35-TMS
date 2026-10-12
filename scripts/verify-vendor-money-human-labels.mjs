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
    // LEAD 443.99 class B (2026-10-12).
    //   old rule: the file contains UnclearedDocumentsNote, "not cleared" and the token bg-slate-100 anywhere.
    //   new rule: the <p> notice that names "not cleared" itself sits on the neutral surface (house bg-[#F7F8FA]
    //             or legacy bg-slate-100) and carries no amber/yellow warning tint.
    //   why: BANK-F91079 (#26013, 72eaebf5b6) moved this page's slate chrome to the house tokens; the notice is
    //        unchanged. Pinning the tint to the notice itself is tighter than "bg-slate-100 somewhere in the file".
    const notice = /<p className="([^"]*)">[^<]*\{money\(totalCleared\)\}[^<]*not cleared/.exec(src);
    const neutral = notice && /(?:^|\s)bg-(?:\[#F7F8FA\]|slate-100)(?=\s|$)/i.test(notice[1]) && !/amber|yellow/.test(notice[1]);
    if (file.endsWith("VendorBalancesPage.tsx") && (!src.includes("UnclearedDocumentsNote") || !neutral)) {
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
  const amber = { ...srcs, [vb]: srcs[vb].replace("bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]", "bg-amber-50 px-3 py-2 text-xs text-amber-800") };
  const noNotice = { ...srcs, [vb]: srcs[vb].replace("named not cleared", "named pending") };
  if (amber[vb] === srcs[vb] || !assertAll(amber).length || !assertAll(noNotice).length) {
    console.error(`${LABEL} SELFTEST FAILED: amber notice or missing "not cleared" not caught`);
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
