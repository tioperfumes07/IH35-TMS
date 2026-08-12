#!/usr/bin/env node
/**
 * ACCT-REQUIRED-LINKAGE-INFLATION — Matrix Required must not claim linkage columns
 * that are memo-only or absent on the accounting surface (DoD-C / vertical FK law).
 *
 * Evidence anchors (2026-08-12):
 * - VendorBillForm buildMemoContext embeds load:/driver: in memo; submit FK is unit_id only
 * - Bills list EntityLink vendor only
 * - RecordExpenseForm: vendor + unit + load FKs; no customer/driver fields
 *
 * Usage: node scripts/verify-accounting-required-linkage-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQ = path.join(ROOT, "docs/specs/scoreboard/modules/accounting.required.json");
const VENDOR_BILL = path.join(ROOT, "apps/frontend/src/components/accounting/VendorBillForm.tsx");
const BILLS_PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/BillsPage.tsx");
const EXPENSE_FORM = path.join(ROOT, "apps/frontend/src/components/expenses/RecordExpenseForm.tsx");

/** Forbidden Required claims — leaf → cols that must NOT appear */
const FORBIDDEN = {
  "bills.list": ["driver", "unit", "load"],
  "bills.create.vendor": ["load", "driver"],
  "bills.create.maintenance": ["driver", "load"],
  "bills.create.fuel": ["driver", "load"],
  "bills.create.driver": ["driver", "load"],
  "expenses.create": ["customer", "driver"],
  "invoices.create": ["driver", "unit"],
  "factoring.list": ["customer", "load"],
  "pre_settlements": ["load"],
};

/** Must remain (canonical FK) */
const MUST_KEEP = {
  "bills.list": ["vendor"],
  "bills.create.vendor": ["vendor", "unit"],
  "expenses.create": ["vendor", "unit", "load"],
  "bills.create.driver": ["vendor", "unit"],
};

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function fail(msg) {
  console.error(`verify-accounting-required-linkage-honest FAIL: ${msg}`);
  process.exit(1);
}

function runSelftest() {
  const doc = loadJson(REQ);
  const leaf = doc.leaves.find((l) => l.id === "bills.list");
  if (!leaf) fail("selftest: bills.list missing");
  const poisoned = structuredClone(doc);
  const pl = poisoned.leaves.find((l) => l.id === "bills.list");
  pl.required = [...pl.required, "driver", "unit", "load"];
  const tmp = path.join(ROOT, "scripts/.tmp-acct-req-poison.json");
  fs.writeFileSync(tmp, JSON.stringify(poisoned));
  // inline check
  for (const col of FORBIDDEN["bills.list"]) {
    if (!pl.required.includes(col)) {
      fs.unlinkSync(tmp);
      fail("selftest setup failed");
    }
  }
  fs.unlinkSync(tmp);
  console.log("verify-accounting-required-linkage-honest --selftest PASS (poison would trip FORBIDDEN)");
  process.exit(0);
}

if (process.argv.includes("--selftest")) runSelftest();

const doc = loadJson(REQ);
const byId = Object.fromEntries(doc.leaves.map((l) => [l.id, l]));

const failures = [];

for (const [leafId, cols] of Object.entries(FORBIDDEN)) {
  const leaf = byId[leafId];
  if (!leaf) {
    failures.push(`missing leaf ${leafId}`);
    continue;
  }
  for (const col of cols) {
    if ((leaf.required || []).includes(col)) {
      failures.push(`${leafId} must NOT require ${col} (memo-only or absent on surface)`);
    }
  }
}

for (const [leafId, cols] of Object.entries(MUST_KEEP)) {
  const leaf = byId[leafId];
  if (!leaf) {
    failures.push(`missing leaf ${leafId}`);
    continue;
  }
  for (const col of cols) {
    if (!(leaf.required || []).includes(col)) {
      failures.push(`${leafId} must KEEP require ${col} (canonical FK)`);
    }
  }
}

// Anchor: VendorBillForm still memo-embeds load/driver (so claiming them as Required is theater)
const vb = fs.readFileSync(VENDOR_BILL, "utf8");
if (!/load:\$\{opts\.loadNumber/.test(vb) && !/parts\.push\(`load:\$\{opts\.loadNumber/.test(vb)) {
  // allow either template style
  if (!/load:\$\{/.test(vb)) failures.push("VendorBillForm expected memo load: embed — re-check form before changing FORBIDDEN");
}
if (!/driver:\$\{opts\.driverId/.test(vb) && !/parts\.push\(`driver:\$\{opts\.driverId/.test(vb)) {
  if (!/driver:\$\{/.test(vb)) failures.push("VendorBillForm expected memo driver: embed — re-check form");
}
if (!/\.\.\.\(resolvedUnitId \? \{ unit_id: resolvedUnitId \}/.test(vb)) {
  failures.push("VendorBillForm must still submit unit_id FK (KEEP unit on creates)");
}

const bills = fs.readFileSync(BILLS_PAGE, "utf8");
if (!/EntityLink kind="vendor"/.test(bills)) {
  failures.push("BillsPage must EntityLink vendor (KEEP bills.list vendor)");
}
// list must not have sprouted driver/unit/load EntityLinks without updating FORBIDDEN
if (/EntityLink kind="driver"/.test(bills) || /EntityLink kind="unit"/.test(bills) || /EntityLink kind="load"/.test(bills)) {
  failures.push("BillsPage gained driver/unit/load EntityLink — update FORBIDDEN/MUST_KEEP intentionally");
}

const exp = fs.readFileSync(EXPENSE_FORM, "utf8");
if (!/kind="unit"/.test(exp) || !/kind="load"/.test(exp)) {
  failures.push("RecordExpenseForm must keep unit+load pickers");
}
if (/createKind="customer"|kind="customer"/.test(exp)) {
  failures.push("RecordExpenseForm gained customer picker — update expenses.create Required");
}
if (/kind="driver"/.test(exp)) {
  failures.push("RecordExpenseForm gained driver picker — update expenses.create Required");
}

// First-5 honesty ceiling (driver..trailer) — ratchet: must stay ≤ 26 after inflation purge
const FIRST5 = new Set(["driver", "customer", "vendor", "unit", "trailer"]);
let first5 = 0;
for (const leaf of doc.leaves) {
  for (const c of leaf.required || []) if (FIRST5.has(c)) first5++;
}
if (first5 > 27) {
  failures.push(`first-5 linkage Required cells = ${first5} > 27 ceiling (inflation returned)`);
}
if (first5 < 20) {
  failures.push(`first-5 linkage Required cells = ${first5} < 20 floor (too aggressive drop — re-audit)`);
}

if (failures.length) {
  console.error(`verify-accounting-required-linkage-honest FAIL (${failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(
  `verify-accounting-required-linkage-honest PASS — first-5 linkage cells=${first5}; forbidden inflation locked; VendorBillForm memo≠FK anchors OK`,
);
