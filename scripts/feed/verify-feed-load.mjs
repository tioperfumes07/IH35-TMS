#!/usr/bin/env node
/**
 * GUARD — verify-feed-load
 *
 * WHAT THIS PROTECTS
 * verify-feed-day ties the REVENUE side to Faro. This ties the COST side to the settlements.
 * A load can tie to Faro on line haul and still be wrong: no driver bill, fuel short by two
 * purchases, escrow never held, a cash advance booked as a deduction instead of a bill payment.
 * That is the population we are deleting. It must not come back.
 *
 * CONTROL: settlement_control.json, built by build_settlement_control.py from the 117
 * AlwaysTrack documents via parse_settlements.py. Its own build asserts 7 controls.
 *
 * ELEVEN COLUMNS PER LOAD, and three of them are NOT expenses:
 *   cash_advance -> a BILL PAYMENT against the driver bill   (owner law)
 *   escrow       -> the driver's own escrow liability         (money held in trust)
 *   admin_fee    -> company INCOME                            (not a negative expense)
 * A feeder that books any of those three as an expense FAILS here even if the dollars match.
 *
 * USAGE
 *   node verify-feed-load.mjs --load 13572 --measured '<json>'
 *   node verify-feed-load.mjs --doc 5798 --measured '<json>'
 *   node verify-feed-load.mjs --selftest
 * FAIL-CLOSED: no --measured and no DATABASE_URL = exit 1. It never skips.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-feed-load";
const CONTROL = new URL("./settlement_control.json", import.meta.url);
const TOL = 0.005;

const MONEY = ["line_haul", "driver_pay", "fuel", "company_expenses",
               "escrow", "cash_advance", "tarp_pay", "admin_fee",
               "reimbursement", "extra_stop_pay", "other"];
const COUNTS = ["fuel_rows", "company_expense_rows", "stops"];
/** These three are NOT expenses. The feeder must declare where it posted them. */
const NOT_AN_EXPENSE = {
  cash_advance: "bill_payment",
  escrow: "driver_escrow_liability",
  admin_fee: "income",
};

function load(kind, id) {
  const c = JSON.parse(readFileSync(CONTROL, "utf8"));
  const bucket = kind === "load" ? c.loads : c.documents;
  const row = bucket[String(id)];
  if (!row) throw new Error(`${kind} ${id} is not in the settlement control (${Object.keys(bucket).length} known)`);
  return row;
}

export function compareLoad(control, measured) {
  const errors = [];
  for (const col of MONEY) {
    const want = Number(control[col] ?? 0), got = Number(measured[col] ?? 0);
    if (Math.abs(want - got) >= TOL)
      errors.push(`${col}: settlement says ${want.toFixed(2)}, we fed ${got.toFixed(2)} (delta ${(got - want).toFixed(2)})`);
  }
  for (const col of COUNTS) {
    if (control[col] === undefined) continue;
    const want = Number(control[col] ?? 0), got = Number(measured[col] ?? 0);
    if (want !== got) errors.push(`${col}: settlement says ${want}, we fed ${got}`);
  }
  // Stops must carry the consignee and the leg mileage the driver document gives.
  for (const col of ["stops_with_facility", "stops_with_leg_miles"]) {
    if (control[col] === undefined) continue;
    const want = Number(control[col] ?? 0), got = Number(measured[col] ?? 0);
    if (got < want) errors.push(`${col}: settlement gives ${want}, we fed only ${got} — the consignee/leg mileage was dropped`);
  }
  // The three that are not expenses must be declared, and declared correctly.
  for (const [col, required] of Object.entries(NOT_AN_EXPENSE)) {
    if (Math.abs(Number(control[col] ?? 0)) < TOL) continue;   // nothing of this kind on this load
    const posted = measured[`${col}_posted_as`];
    if (!posted) errors.push(`${col}: $${Number(control[col]).toFixed(2)} on this load and the feeder did not declare where it posted it — must be "${required}"`);
    else if (posted !== required) errors.push(`${col}: posted as "${posted}" — it MUST be "${required}". This is owner law, not a preference.`);
  }
  return errors;
}

function selftest() {
  const c = load("load", "13572");
  const perfect = { ...c };
  for (const [col, req] of Object.entries(NOT_AN_EXPENSE)) perfect[`${col}_posted_as`] = req;
  const base = compareLoad(c, perfect);
  if (base.length) {
    console.error(`${LABEL} --selftest FAIL — a perfect load did not tie:`);
    for (const e of base) console.error(`  - ${e}`);
    process.exit(1);
  }
  const withEscrow = Object.entries(JSON.parse(readFileSync(CONTROL, "utf8")).loads)
    .find(([, v]) => Math.abs(v.escrow) > 0.005 && Math.abs(v.cash_advance) > 0.005);
  const mut = [
    ["one cent short on line haul", (m) => ({ ...m, line_haul: m.line_haul - 0.01 })],
    ["driver pay missing entirely", (m) => ({ ...m, driver_pay: 0 })],
    ["one fuel purchase dropped", (m) => ({ ...m, fuel_rows: m.fuel_rows - 1 })],
    ["consignee names dropped from the stops", (m) => ({ ...m, stops_with_facility: 0 })],
    ["leg mileage dropped from the stops", (m) => ({ ...m, stops_with_leg_miles: 0 })],
    ["a stop lost", (m) => ({ ...m, stops: m.stops - 1 })],
    ["company expenses short", (m) => ({ ...m, company_expenses: m.company_expenses - 0.01 })],
  ];
  for (const [name, f] of mut) {
    const broken = f({ ...perfect });
    if (JSON.stringify(broken) === JSON.stringify(perfect)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`); process.exit(1);
    }
    if (compareLoad(c, broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`); process.exit(1);
    }
  }
  let extra = 0;
  if (withEscrow) {
    const [lid, ctl] = withEscrow;
    const good = { ...ctl }; for (const [col, req] of Object.entries(NOT_AN_EXPENSE)) good[`${col}_posted_as`] = req;
    if (compareLoad(ctl, good).length) { console.error(`${LABEL} --selftest FAIL — load ${lid} perfect case did not tie.`); process.exit(1); }
    const cases = [
      ["cash advance booked as an expense", { ...good, cash_advance_posted_as: "expense" }],
      ["cash advance booked as a deduction", { ...good, cash_advance_posted_as: "deduction" }],
      ["escrow booked as an expense", { ...good, escrow_posted_as: "expense" }],
      ["admin fee booked as a negative expense", { ...good, admin_fee_posted_as: "expense" }],
      ["feeder declared nothing", { ...ctl }],
    ];
    for (const [name, broken] of cases) {
      if (compareLoad(ctl, broken).length === 0) {
        console.error(`${LABEL} --selftest FAIL — "${name}" on load ${lid} was NOT detected.`); process.exit(1);
      }
      extra++;
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mut.length} money/count mutations and ${extra} posting-destination violations all trip the gate.`);
  process.exit(0);
}

const a = process.argv.slice(2);
if (a.includes("--selftest")) selftest();
const kind = a.includes("--load") ? "load" : a.includes("--doc") ? "doc" : null;
if (!kind) { console.error(`${LABEL} FAIL — --load <n> or --doc <n> is required.`); process.exit(1); }
const id = a[a.indexOf(kind === "load" ? "--load" : "--doc") + 1];
let control;
try { control = load(kind, id); }
catch (e) { console.error(`${LABEL} FAIL — ${e.message}`); process.exit(1); }
if (!a.includes("--measured")) {
  console.error(`${LABEL} FAIL — no --measured and live DB mode is not wired. This guard never skips.`);
  process.exit(1);
}
const errors = compareLoad(control, JSON.parse(a[a.indexOf("--measured") + 1]));
console.log(`${LABEL} ${kind} ${id} — settlement says line haul $${Number(control.line_haul).toFixed(2)}, driver pay $${Number(control.driver_pay).toFixed(2)}, fuel $${Number(control.fuel).toFixed(2)}`);
if (errors.length) {
  console.error(`${LABEL} FAIL — ${kind} ${id} does NOT tie to its settlement. THE FEED STOPS HERE.`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${kind} ${id} ties on every money column, every count, and every posting destination.`);
