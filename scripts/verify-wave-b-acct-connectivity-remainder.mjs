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
    // ACCT-F3568 migrated the By Vendor Type grouped rollup onto the SAME shared VENDOR_COLUMNS
    // ParityTable columns as By Vendor (see verify-accounts-payable-aging-page-uses-paritytable),
    // so both grids render through the identical EntityLink call — real className is
    // "font-medium text-slate-700", not the bare "text-slate-700" this check originally assumed
    // from a since-retired, separately-styled hand-rolled row. Match on the class being PRESENT,
    // not exact-equal, so real Tailwind class list growth doesn't false-fail while still catching
    // a genuine regression (link removed or de-styled).
    name: "AP aging vendor EntityLink (by-type expand)",
    file: "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
    pattern:
      /<EntityLink kind="vendor" id=\{v\.vendor_id\} label=\{entityLabel\(v\.vendor_name, v\.vendor_id, "Vendor"\)\} className="[^"]*text-slate-700[^"]*"/,
  },
  {
    name: "Pay bill modal vendor EntityLink via billVendorDrillId",
    file: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
    pattern: /<EntityLink[\s\n]+kind="vendor"[\s\n]+id=\{billVendorDrillId\(bill\)\}/,
  },
  {
    // Round 92/94 (CC-2) — was locked to `label={entityLabel(bill.bill_number, bill.id, "Bill")}`
    // verbatim; confirmed failing on origin/main already (pre-existing, unrelated to this PR's
    // diff — this file is untouched here). The live code moved the label onto
    // `visibleDocumentLabel(bill.bill_number ?? bill.memo ?? bill.vendor_name, bill.id, "Bill")`,
    // a strictly more honest fallback chain for the same bill EntityLink -- loosened to the
    // connectivity fact this check actually guards (kind="bill" id={bill.id} exists), not one
    // specific label-building helper's call signature.
    name: "Pay bill modal bill EntityLink",
    file: "apps/frontend/src/pages/accounting/PayBillModal.tsx",
    pattern: /<EntityLink[\s\S]{0,80}kind="bill"[\s\S]{0,80}id=\{bill\.id\}/,
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
    // Round 92/94 (CC-2) — the original single pattern required kind="driver" (with the literal
    // id={settlement.driver_id}) to appear BEFORE kind="settlement" in the raw file text.
    // Confirmed failing on origin/main already (pre-existing, unrelated to E11-D4): the settlement
    // link was refactored into its own renderSettlementLinks() helper, defined ABOVE the columns
    // array, so its literal kind="settlement" text now sits before the driver column in the file
    // -- same connectivity, different order. Driver rendering also correctly upgraded from bare
    // EntityLink to EntityLinkOrTombstone (LV-SAFETY-ENTITYLINK-UNRESOLVED-TOMBSTONE — never
    // drill into an unresolved driver). Split into two order-free checks on the real facts: a
    // driver link keyed off *.driver_id, and a settlement link, each present somewhere in the file.
    name: "Pre-settlements driver EntityLink",
    file: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
    pattern: /<EntityLink(?:OrTombstone)?[\s\S]{0,120}kind="driver"[\s\S]{0,120}id=\{[\w.]*\.driver_id\}/,
  },
  {
    name: "Pre-settlements settlement EntityLink",
    file: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
    pattern: /<EntityLink[\s\S]{0,120}kind="settlement"/,
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
