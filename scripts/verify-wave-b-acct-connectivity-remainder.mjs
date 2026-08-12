#!/usr/bin/env node
/**
 * WAVE-B accounting connectivity remainder — EntityLink drill-through on AP surfaces
 * that were still Required×connectivity-open after prior waves.
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(bill_payments\\.|ap\\.aging$|collections$|escrow$|pre_settlements$|factoring\\.list$|payments\\.receive$|transactions$|je\\.list$)","task":"WAVE-B-acct-connectivity-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-acct-connectivity-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-acct-connectivity-remainder";

const CHECKS = [
  {
    name: "AP aging vendor EntityLink (by-vendor grid)",
    file: "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
    pattern: /<EntityLink kind="vendor" id=\{v\.vendor_id\} label=\{entityLabel\(v\.vendor_name, v\.vendor_id, "Vendor"\)\}/,
  },
  {
    name: "AP aging vendor EntityLink (by-type expand)",
    file: "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
    pattern: /<EntityLink kind="vendor" id=\{v\.vendor_id\} label=\{entityLabel\(v\.vendor_name, v\.vendor_id, "Vendor"\)\} className="text-slate-700"/,
  },
  {
    name: "Pay bill modal vendor EntityLink via billVendorDrillId",
    file: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
    pattern: /<EntityLink[\s\n]+kind="vendor"[\s\n]+id=\{billVendorDrillId\(bill\)\}/,
  },
  {
    name: "Pay bill modal bill EntityLink",
    file: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
    pattern: /<EntityLink kind="bill" id=\{bill\.id\} label=\{entityLabel\(bill\.bill_number, bill\.id, "Bill"\)\}/,
  },
  {
    name: "Bill payments list vendor EntityLink",
    file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    pattern: /<EntityLink[\s\S]*kind="vendor"[\s\S]*id=\{row\.mdata_vendor_id\}/,
  },
  {
    name: "Bill payments list bill EntityLink",
    file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    pattern: /<EntityLink kind="bill" id=\{row\.bill_id\}/,
  },
  {
    name: "Collections customer EntityLink",
    file: "apps/frontend/src/pages/accounting/CollectionsPage.tsx",
    pattern: /<EntityLink[\s\S]*kind="customer"/,
  },
  {
    name: "Escrow source EntityLink",
    file: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    pattern: /<EntityLink kind=\{kind\} id=\{row\.source_id\}/,
  },
  {
    name: "Pre-settlements driver+settlement EntityLink",
    file: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
    pattern: /<EntityLink[\s\S]*kind="driver"[\s\S]*id=\{settlement\.driver_id\}[\s\S]*<EntityLink[\s\S]*kind="settlement"/,
  },
  {
    name: "Factoring list EntityLink",
    file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    pattern: /<EntityLink/,
  },
  {
    name: "Receipts / payments.receive EntityLink",
    file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx",
    pattern: /<EntityLink/,
  },
  {
    name: "Integration transactions EntityLink",
    file: "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx",
    pattern: /<EntityLink/,
  },
  {
    name: "JE list EntityLink",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    pattern: /kind="journal_entry"/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: ${c.file} shape missing`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON_NO_MATCH");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL — poison should trip`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length} checks)`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — accounting bill_payments/ap.aging/collections/escrow/pre_settlements/factoring/receipts/transactions/je.list connectivity EntityLinks ratcheted`,
);
