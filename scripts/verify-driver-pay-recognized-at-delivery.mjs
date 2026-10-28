#!/usr/bin/env node
/**
 * LEAD 443.116 #2 + (c), CORRECTION 16:50 UTC — the LOCKED design (claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md §3,
 * "Three dates, three columns": due_date drives cash flow / A/P aging; "A cost is recognized exactly once, on the day incurred").
 * Driver pay is incurred at delivery and was recognized only at settlement close; the booked driver bill had no due date.
 *
 * The rule, on the sources (no database):
 *   1. migration 202615830700 defines the one due-date rule (driver_finance.load_driver_pay_due, the final delivery stop), the
 *      stop trigger that moves it (trg_load_stops_driver_bill_due), the read-time roll-forward
 *      (driver_bill_effective_due_date) and driver_bills.accrued_bill_id;
 *   2. the delivery-evidence latch posts the pay accrual on EVERY delivery path — queued after commit AND on the inline path;
 *   3. the accrual posts Dr driver pay / Cr A/P dated the delivery, with driver + load + unit on the bill, and stamps
 *      accrued_bill_id only while the bill is unaccrued and unsettled (never twice);
 *   4. settlement close REUSES an accrued load's bill (never a second pay bill): splitLoadLinesAgainstDeliveryAccrual, the
 *      refusal PAY_BELOW_DELIVERY_ACCRUAL, and the spine row flagged bill_posted_at_delivery;
 *   5. a settlement void never voids a delivery-accrued bill nor reverses its pay posting;
 *   6. cash flow reads the driver bill's effective due date and never lists an accrued bill twice.
 *   7. (LEAD 443.128 C) a TEAM driver bill accrues too: one A/P bill per driver for its share of the load's team split
 *      (resolveTeamSplitForLoad), stamped accrued_team_bill_id for the co-driver; each driver's settlement applies to its own
 *      (the co-driver reads accrued_team_bill_id); the spine is unique per (driver bill, A/P bill).
 * --selftest plants each violation into a copy of the real sources and must see it refused.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-pay-recognized-at-delivery";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  migration: "db/migrations/202615830700_driver_bill_due_date_and_delivery_accrual.sql",
  teamMigration: "db/migrations/202615890700_team_driver_bill_accrued_at_delivery.sql",
  latch: "apps/backend/src/dispatch/delivery-evidence-latch.ts",
  accrual: "apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.ts",
  chain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts",
  reversal: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  cashFlow: "apps/backend/src/cash-flow/cash-flow.service.ts",
};

function between(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) return null;
  const b = src.indexOf(endMarker, a + startMarker.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

/** The rule, pure: the errors for one set of source texts keyed like F. */
export function deliveryPayErrors(src) {
  const errors = [];
  const need = (file, text, why) => {
    if (!src[file].includes(text)) errors.push(`${F[file]}: ${why} (missing: ${text})`);
  };

  // 1. migration
  need("migration", "CREATE OR REPLACE FUNCTION driver_finance.load_driver_pay_due(", "the one due-date rule");
  need("migration", "ORDER BY s.sequence_number DESC", "due date read from the FINAL delivery stop");
  need("migration", "CREATE TRIGGER trg_load_stops_driver_bill_due", "the due date moves when a stop is re-planned");
  need("migration", "CREATE OR REPLACE FUNCTION driver_finance.driver_bill_effective_due_date(", "a past undelivered due date reads as today");
  need("migration", "ADD COLUMN IF NOT EXISTS accrued_bill_id", "the driver bill names its delivery-posted A/P bill");
  need("migration", "ADD COLUMN IF NOT EXISTS bill_posted_at_delivery", "the spine marks the delivery-posted bill");

  // 2. latch: both the after-commit and the inline path
  const latch = src.latch;
  if (!latch.includes("run: () => fireDriverPayAccrual(input)")) errors.push(`${F.latch}: the pay accrual is not queued on the delivery event`);
  if (!latch.includes("if (!payAccrualQueued) await fireDriverPayAccrual(input);")) errors.push(`${F.latch}: the pay accrual is dropped when the queue refuses it`);
  const inline = between(latch, "await firePostLoadRevenueLatch(input);\n  await fireFactoringAutoSubmit(input);", 'return "fired";');
  if (!inline || !inline.includes("await fireDriverPayAccrual(input);")) errors.push(`${F.latch}: the inline delivery path does not accrue driver pay`);

  // 3. accrual
  need("accrual", "basis !== \"delivered\"", "pay accrues only on delivery evidence");
  // ENG-44: stamp due_date to delivery for ALL open bills on the load (incl. open pre-settlement)
  // before the accrual select — otherwise projected due_dates stay stale (13690/13698).
  need("accrual", "due_date_basis = 'delivered'", "due_date flips to delivered for every open bill on the load");
  need("accrual", "due_date IS DISTINCT FROM $3::date OR due_date_basis IS DISTINCT FROM 'delivered'", "stale projected due_dates are rewritten at delivery");
  need("accrual", "\"driver_pay_expense\"", "Dr the driver pay account");
  need("accrual", "billDate: deliveryDate,", "bill dated the delivery");
  need("accrual", "dueDate: deliveryDate,", "due on the delivery");
  need("accrual", "loadId: input.loadId,", "the load rides the bill header");
  // 443.128 C: the once-only stamp also requires no co-driver bill yet (old anchor lacked accrued_team_bill_id).
  need("accrual", "AND accrued_bill_id IS NULL AND accrued_team_bill_id IS NULL AND settled_in_settlement_id IS NULL", "accrued once, never on a settled bill");
  need("accrual", "db.settled_in_settlement_id IS NULL AND db.accrued_bill_id IS NULL", "only unaccrued, unsettled bills are read");
  // LEAD 443.269-B: the ONE exception — the restate engine re-accrues a single named bill only while its pre-settlement is
  // open, never closed, posted or voided. Any wider exception (any settled bill, any id) is a red.
  need("accrual", "db.id = $3::uuid AND db.accrued_bill_id IS NULL AND db.accrued_team_bill_id IS NULL AND EXISTS (", "the restate exception names one bill and stays unaccrued");
  need("accrual", "AND s.status = 'open' AND s.trip_closed_at IS NULL AND s.posted_at IS NULL AND ${liveSettlement(\"s\")})", "the restate exception requires an open, unposted, unvoided pre-settlement");
  if (/settled_in_settlement_id IS NULL OR /.test(src.accrual)) errors.push(`${F.accrual}: a settled bill is admitted outside the named restate exception`);

  // 4. close reuses the accrued bill
  const chain = src.chain;
  const accruedBranch = between(chain, "if (b.accruedBillId) {", "continue;");
  if (!accruedBranch) errors.push(`${F.chain}: settlement close has no branch for a delivery-accrued load`);
  else {
    if (!accruedBranch.includes("splitLoadLinesAgainstDeliveryAccrual(")) errors.push(`${F.chain}: close does not split pay against the delivery accrual`);
    if (!accruedBranch.includes("billId: b.accruedBillId")) errors.push(`${F.chain}: close does not apply to the delivery-accrued bill`);
    if (accruedBranch.includes("postLoadBill(b, ls,")) errors.push(`${F.chain}: close posts the whole pay again on a delivery-accrued load`);
  }
  need("chain", "\"PAY_BELOW_DELIVERY_ACCRUAL\"", "pay below the accrual is refused by name");
  need("chain", "x.role === \"delivery_accrued\"", "the spine row is flagged bill_posted_at_delivery");

  // 5. void keeps the delivery bill
  const rev = src.reversal;
  if (!rev.includes("if (!gb.bill_posted_at_delivery) originalJeIds.push(gb.bill_journal_entry_id);")) errors.push(`${F.reversal}: a settlement void reverses the delivery pay posting`);
  const beforeVoid = between(rev, "if (gb.bill_posted_at_delivery) continue;", "voidBillInClientTx(");
  if (!beforeVoid) errors.push(`${F.reversal}: a settlement void voids the delivery-accrued bill`);

  // 7. team bills (443.128 C)
  need("accrual", "resolveTeamSplitForLoad(", "a team bill is split by the load's team split");
  need("accrual", 'column: "accrued_team_bill_id"', "the co-driver's share is its own A/P bill");
  if (src.accrual.includes("team_bill_accrues_at_close")) errors.push(`${F.accrual}: a team bill is skipped at delivery (it must accrue its shares)`);
  need("chain", "THEN db.accrued_team_bill_id ELSE db.accrued_bill_id END", "the co-driver's settlement applies to its own delivery bill");
  need("teamMigration", "ADD COLUMN IF NOT EXISTS accrued_team_bill_id", "the driver bill names the co-driver's delivery bill");
  need("teamMigration", "ON driver_finance.driver_settlement_gl_bills (operating_company_id, driver_bill_id, accounting_bill_id)", "the spine is unique per driver bill AND A/P bill");

  // 6. cash flow
  need("cashFlow", "driver_finance.driver_bill_effective_due_date(db.due_date, db.due_date_basis", "cash flow reads the driver bill's due date");
  need("cashFlow", "AND db.accrued_bill_id IS NULL", "an accrued driver bill is not counted twice");
  need("cashFlow", "const daysOverdue = daysBetween(today, db_.due_date);", "days overdue from the due date, not the creation date");
  return errors;
}

/** A missing source reads as empty, so every rule on it fails by name (fail closed, never a crash). */
function loadReal() {
  const out = {};
  for (const [k, rel] of Object.entries(F)) out[k] = existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "";
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = loadReal();
  const base = deliveryPayErrors(real);
  if (base.length) {
    console.error(`${LABEL} SELFTEST FAIL: the real sources do not pass:\n  - ${base.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["migration", "CREATE TRIGGER trg_load_stops_driver_bill_due", "-- trigger removed", "stop re-plan no longer moves the due date"],
    ["migration", "ORDER BY s.sequence_number DESC", "ORDER BY s.sequence_number ASC", "due date from the FIRST stop"],
    ["latch", "    if (!payAccrualQueued) await fireDriverPayAccrual(input);\n", "", "accrual dropped when the queue refuses"],
    ["latch", "  await fireLoadBillingSync(input);\n  await fireDriverPayAccrual(input);\n", "  await fireLoadBillingSync(input);\n", "inline delivery path without accrual"],
    ["accrual", "billDate: deliveryDate,", "billDate: new Date().toISOString().slice(0, 10),", "accrual dated today, not the delivery"],
    ["accrual", "AND accrued_bill_id IS NULL AND accrued_team_bill_id IS NULL AND settled_in_settlement_id IS NULL", "", "accrual stamp not once-only"],
    ["chain", "billId: b.accruedBillId", "billId: (await postLoadBill(b, ls, b.loadNumber, \"x\")).billId", "close re-posts the whole pay"],
    ["chain", "\"PAY_BELOW_DELIVERY_ACCRUAL\"", "\"PAY_DIFFERS\"", "pay-below refusal renamed away"],
    ["reversal", "if (!gb.bill_posted_at_delivery) originalJeIds.push(gb.bill_journal_entry_id);", "originalJeIds.push(gb.bill_journal_entry_id);", "void reverses the delivery pay"],
    ["reversal", "      if (gb.bill_posted_at_delivery) continue;\n", "", "void voids the delivery bill"],
    ["cashFlow", "AND db.accrued_bill_id IS NULL", "", "accrued bill counted twice in cash flow"],
    ["accrual", "resolveTeamSplitForLoad(", "skipTeam(", "team bill no longer split at delivery"],
    ["chain", "THEN db.accrued_team_bill_id ELSE db.accrued_bill_id END", "THEN db.accrued_bill_id ELSE db.accrued_bill_id END", "co-driver settles driver One's bill"],
    ["teamMigration", "ON driver_finance.driver_settlement_gl_bills (operating_company_id, driver_bill_id, accounting_bill_id)", "ON driver_finance.driver_settlement_gl_bills (operating_company_id, driver_bill_id)", "spine still one row per driver bill"],
    ["cashFlow", "const daysOverdue = daysBetween(today, db_.due_date);", "const daysOverdue = daysBetween(today, db_.created_at);", "cash flow ages from creation"],
    ["accrual", "AND s.status = 'open' AND s.trip_closed_at IS NULL AND s.posted_at IS NULL AND ${liveSettlement(\"s\")})", "AND s.voided_at IS NULL)", "restate re-accrues a bill on a POSTED settlement"],
    ["accrual", "db.id = $3::uuid AND db.accrued_bill_id IS NULL AND db.accrued_team_bill_id IS NULL AND EXISTS (", "db.accrued_bill_id IS NULL AND db.accrued_team_bill_id IS NULL AND EXISTS (", "restate exception admits every bill, not the named one"],
    ["accrual", "AND (${restate ? `(${UNACCRUED_UNSETTLED_SQL}) OR", "AND (db.settled_in_settlement_id IS NULL OR ${restate ? `(${UNACCRUED_UNSETTLED_SQL}) OR", "a settled bill admitted on the default path"],
  ];
  let failed = 0;
  for (const [file, from, to, label] of plants) {
    if (!real[file].includes(from)) {
      console.error(`${LABEL} SELFTEST FAIL: plant "${label}" is inert — anchor not in ${F[file]}`);
      failed += 1;
      continue;
    }
    // replaceAll: cash-flow has the accrued_bill_id filter in both daily + rolling reads;
    // a one-shot .replace leaves the twin and the plant looks inert.
    const mutated = { ...real, [file]: real[file].split(from).join(to) };
    if (deliveryPayErrors(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL: planted "${label}" was not refused`);
      failed += 1;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${plants.length}/${plants.length} planted violations refused`);
} else {
  const errors = deliveryPayErrors(loadReal());
  if (errors.length) {
    console.error(`${LABEL} FAIL:\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — driver pay is due on the projected delivery, recognized once at delivery, applied (never re-posted) at close`);
}
