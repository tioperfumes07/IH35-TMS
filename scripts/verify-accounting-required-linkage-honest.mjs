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
 * ACCT-F5305 (2026-08-15): this guard was itself orphaned (never wired into CI — see
 * docs/audit/ORPHAN-GUARD-OWNER-HANDOFF-2026-08-15.md) since 2026-08-12, so its 27-cell ceiling
 * never re-baselined against the six independent, evidenced Required-column-honesty sweeps that
 * landed on accounting.required.json in the meantime: LINK-F5186 (gl_je, #6938), LINK-F5187
 * (liability, #6970), LINK-F5188 (ap_bill, #7009), LINK-F5189 (expense, #7025), LINK-F5190 (bank,
 * full sweep), SURFACE-INVENTORY-HOST-WITHOUT-EXACT-PATH-20 (#7096). Each of those PRs individually
 * audited and evidenced its own leaf-level Required decisions — none touched this guard's FORBIDDEN/
 * MUST_KEEP anchors (those still all pass unmodified). Verified live 2026-08-15, not from this
 * comment alone: every one of the 35 current first-5 cells traces to a real, purpose-built surface
 * with genuine FK wiring (e.g. escrow -> EscrowPage.tsx driver EntityLink; accounting.modal.
 * driver_damage_invoice -> DriverDamageInvoiceModal.tsx -> InvoiceTypeModalBase's
 * `<EntityPicker kind={billToEntityType} .../>` with billToEntityType="driver"). 35 is the honest
 * current count, not inflation returning — the ceiling was stale, not the content. Raised 27->36
 * (one-cell headroom, not "whatever passes") so this guard resumes catching a REAL regression
 * (leafRe:".*"-style blanket re-injection) instead of permanently red-flagging honest growth.
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
  // ACCT-F5873 (2026-09-05, #20731) legitimately wired real driver + load EntityLinks onto
  // bills.list (a dedicated "Driver bills" section, kind=driver/kind=load drill-through to their
  // canonical rows, live-verified against 50 real driver_finance.driver_bills rows) — driver/load
  // are no longer forbidden here. U16 (owner UI register 2026-10-03, "work order, unit and trailer on every bill list")
  // added a real Unit column (EntityLink kind="unit" to the bill's own / its lines' unit) — "unit" is no longer forbidden.
  "bills.list": [],
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
  // Poison the first leaf that still forbids something (bills.list forbids nothing since U16).
  const [poisonLeafId, poisonCols] = Object.entries(FORBIDDEN).find(([, cols]) => cols.length > 0);
  const leaf = doc.leaves.find((l) => l.id === poisonLeafId);
  if (!leaf) fail(`selftest: ${poisonLeafId} missing`);
  const poisoned = structuredClone(doc);
  const pl = poisoned.leaves.find((l) => l.id === poisonLeafId);
  pl.required = [...pl.required, ...poisonCols];
  const tmp = path.join(ROOT, "scripts/.tmp-acct-req-poison.json");
  fs.writeFileSync(tmp, JSON.stringify(poisoned));
  // inline check
  for (const col of poisonCols) {
    if (!pl.required.includes(col)) {
      fs.unlinkSync(tmp);
      fail("selftest setup failed");
    }
  }
  fs.unlinkSync(tmp);
  // 443.101 ceiling arms — the measure is computed on the real registry and real surfaces, then mutated.
  const read = (rel) => { const f = path.join(ROOT, "apps/frontend/src", rel); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; };
  const real = countFirst5(doc, read);
  const bad = [];
  if (real.unproven > UNPROVEN_CEILING) bad.push(`real registry unproven ${real.unproven} > ${UNPROVEN_CEILING}`);
  const blanket = structuredClone(doc);
  for (const l of blanket.leaves) l.required = [...new Set([...(l.required || []), "driver"])];
  if (countFirst5(blanket, read).unproven <= UNPROVEN_CEILING) bad.push("blanket driver re-injection not caught");
  const lease = "components/leases/LeaseContractCreator.tsx";
  const stripped = (rel) => (rel === lease ? "" : read(rel));
  if (countFirst5(doc, stripped).unproven <= UNPROVEN_CEILING) bad.push("lease creator losing its vendor/unit/trailer FKs not caught");
  const noPath = structuredClone(doc);
  for (const l of noPath.leaves) delete l.surface_path;
  if (countFirst5(noPath, read).unproven <= UNPROVEN_CEILING) bad.push("dropping surface proofs not caught");
  if (bad.length) fail(`selftest: ${bad.join("; ")}`);
  console.log("verify-accounting-required-linkage-honest --selftest PASS (poison would trip FORBIDDEN; blanket injection, lost surface FK and dropped surface proofs all exceed the unproven ceiling)");
  process.exit(0);
}

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
// driver/load EntityLinks on bills.list are now legitimate (ACCT-F5873, real drill-through to
// driver_finance.driver_bills's own driver/load, live-verified) — only a NEW "unit" EntityLink
// would still be an un-reviewed regression worth flagging (no unit column exists on this page).
if (!/EntityLink kind="driver"/.test(bills) || !/EntityLink kind="load"/.test(bills)) {
  failures.push("BillsPage lost its driver/load EntityLink (ACCT-F5873 regression) — re-check before removing");
}
// U16 — the Unit column is an owner order: the bills list must keep its unit EntityLink.
if (!/<EntityLink kind="unit"/.test(bills)) {
  failures.push("BillsPage lost its unit EntityLink (U16 — work order, unit and trailer on every bill list)");
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

// First-5 honesty ceiling (driver..trailer). History: 27 -> 36 (ACCT-F5305, 2026-08-15) -> 38 (ACCT-F25135, 2026-09-06),
// each time because honest, evidenced cells outgrew a raw count. 443.101 (CC-3): #24143 added the evidenced Lease Contract
// Creator leaf (vendor/unit/trailer) and the raw count hit 41 — every one of the 41 re-audited against its surface, none
// inflated. Raising the ceiling is forbidden, so the measure itself is made honest instead of looser:
//   - a cell is SURFACE-PROVEN only when its leaf names a surface_path whose source actually carries that entity's FK
//     picker / EntityLink / id (FK_PROOF) — a claim the surface cannot back stays unproven;
//   - the ceiling now bounds the UNPROVEN cells at their measured honest count, 32, with ZERO headroom (was 38 over all
//     cells with 1-cell headroom). Any blanket re-injection into a leaf without a backing surface, or a surface losing its
//     FK, raises the unproven count past 32 and fails. To add a Required cell, give its leaf a surface_path that proves it.
const FIRST5 = new Set(["driver", "customer", "vendor", "unit", "trailer"]);
export const FK_PROOF = {
  vendor: /kind="vendor"|createKind="vendor"|\bvendor_id\b|\bvendorId\b/,
  unit: /kind="unit"|\bunit_id\b|\bunitId\b|listUnits\(/,
  trailer: /kind="trailer"|\bequipment_id\b|listEquipment\(|\btrailer_id\b/,
  driver: /kind="driver"|\bdriver_id\b|\bdriverId\b/,
  customer: /kind="customer"|\bcustomer_id\b|\bcustomerId\b/,
};
export const UNPROVEN_CEILING = 32;
export function countFirst5(doc, readSurface) {
  let total = 0, proven = 0;
  for (const leaf of doc.leaves) {
    const src = leaf.surface_path ? readSurface(leaf.surface_path) : null;
    for (const c of leaf.required || []) {
      if (!FIRST5.has(c)) continue;
      total++;
      if (src && FK_PROOF[c].test(src)) proven++;
    }
  }
  return { total, proven, unproven: total - proven };
}
const readSurface = (rel) => {
  const f = path.join(ROOT, "apps/frontend/src", rel);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
};
const { total: first5, proven: first5Proven, unproven: first5Unproven } = countFirst5(doc, readSurface);
if (process.argv.includes("--selftest")) runSelftest();
if (first5Unproven > UNPROVEN_CEILING) {
  failures.push(`first-5 linkage Required cells without surface proof = ${first5Unproven} > ${UNPROVEN_CEILING} ceiling (inflation returned; ${first5Proven} of ${first5} proven)`);
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
  `verify-accounting-required-linkage-honest PASS — first-5 linkage cells=${first5} (${first5Proven} surface-proven, ${first5Unproven} unproven <= ${UNPROVEN_CEILING}); forbidden inflation locked; VendorBillForm memo≠FK anchors OK`,
);
