#!/usr/bin/env node
/**
 * verify-rows-94-124 — ACCT-F11065 (register rows 94 + 124 / ENG-44). Static guard on the four writers, fail-closed.
 *
 *   94 / 124(a) — every driver A/P bill carries a due date = its load's delivery date (driver_finance.load_driver_pay_due):
 *                 the settlement close (settlement-ap-chain.service.ts) passes dueDate; the delivery accrual passes dueDate;
 *                 the one bill INSERT (bills.service.ts validateCreateBillInput) refuses a driver bill without one.
 *   124(b)      — a PRACTICAL-miles driver bill never accrues to A/P (deliveryAccrualSkipReasonSql + the restate branch), and
 *                 the posted strays have a fail-closed void engine + route (void-stray-practical).
 *   124(d)      — Book Load stores live_load_number through liveLoadNumberForInsert (never the load's own number) and the
 *                 Settlement Creator never copies load_number into it.
 *
 * --selftest plants each defect in memory and proves the guard catches it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const FILES = {
  apChain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts",
  accrual: "apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.ts",
  bills: "apps/backend/src/accounting/bills.service.ts",
  due: "apps/backend/src/driver-finance/driver-bill-due-date.ts",
  stray: "apps/backend/src/driver-finance/void-stray-salaried-driver-bill.service.ts",
  routes: "apps/backend/src/driver-finance/driver-bills.routes.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
  live: "apps/backend/src/dispatch/live-load-number.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
};

/** The createBillInClientTx({...}) object literal that names `source: "<source>"`. */
function createBillBlock(src, source) {
  const i = src.indexOf(`source: "${source}"`);
  if (i < 0) return null;
  const start = src.lastIndexOf("createBillInClientTx(", i);
  const end = src.indexOf("} as never", i);
  return start < 0 || end < 0 ? null : src.slice(start, end);
}

export function check(s) {
  const f = [];
  const ap = createBillBlock(s.apChain, "settlement_driver_bill");
  if (!ap) f.push("94: settlement-ap-chain no longer creates the settlement_driver_bill — guard must be re-pointed");
  else if (!/dueDate:\s*due\.dueDate/.test(ap)) f.push("94: settlement close creates the driver bill WITHOUT dueDate (the P-0069 / 13530 defect)");
  if (!/resolveDriverBillDueDate\(/.test(s.apChain)) f.push("94: settlement close does not resolve the due date from the load");
  const acc = createBillBlock(s.accrual, "driver_pay_accrual");
  if (!acc || !/dueDate:\s*deliveryDate/.test(acc)) f.push("124(a): delivery accrual creates the driver bill WITHOUT dueDate");
  if (!/driver_bill_due_date_required/.test(s.bills) || !/"settlement_driver_bill"[^\n]*"driver_pay_accrual"[^\n]*dueDate/.test(s.bills)) {
    f.push("94: bills.service validateCreateBillInput no longer refuses a driver bill without a due date");
  }
  if (!/driver_finance\.load_driver_pay_due/.test(s.due)) f.push("94: driver-bill-due-date.ts no longer reads driver_finance.load_driver_pay_due (the one rule)");
  if (!/miles_basis_type = 'practical' THEN 'practical_miles_basis'/.test(s.accrual)) f.push("124(b): delivery accrual can post a PRACTICAL-miles bill to A/P");
  if ((s.accrual.match(/practical_miles_basis/g) ?? []).length < 2) f.push("124(b): the restate branch bypasses the practical-miles skip");
  if (!/export async function voidStrayPracticalBasisDriverBill/.test(s.stray) || !/releaseDriverPayAccrualInClientTx\(/.test(s.stray)) {
    f.push("124(b): the practical-basis stray void engine is missing or no longer reverses through releaseDriverPayAccrualInClientTx");
  }
  if (!/void-stray-practical/.test(s.routes)) f.push("124(b): the void-stray-practical route is not mounted");
  if (!/liveLoadNumberForInsert\(input\.live_load_number, loadNumber\)/.test(s.book)) f.push("124(d): Book Load writes live_load_number raw (self-reference possible)");
  if (!/toUpperCase\(\) === own\.toUpperCase\(\)\) return null/.test(s.live)) f.push("124(d): liveLoadNumberForInsert no longer drops the load's own number");
  if (/live_load_number:\s*load\.load_number/.test(s.creator)) f.push("124(d): Settlement Creator copies load_number into live_load_number");
  return f;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--selftest")) {
  const plants = [
    ["apChain", (x) => x.replace(/dueDate:\s*due\.dueDate,?/, "")],
    ["accrual", (x) => x.replace(/dueDate:\s*deliveryDate,?/, "")],
    ["bills", (x) => x.replace("driver_bill_due_date_required", "x")],
    ["accrual", (x) => x.replace(/WHEN \$\{db\}\.miles_basis_type = 'practical' THEN 'practical_miles_basis'/, "")],
    ["stray", (x) => x.replace("export async function voidStrayPracticalBasisDriverBill", "async function x")],
    ["book", (x) => x.replace("liveLoadNumberForInsert(input.live_load_number, loadNumber)", "input.live_load_number ?? null")],
    ["creator", (x) => x + "\n      live_load_number: load.load_number.trim(),\n"],
  ];
  if (check(sources).length) {
    console.error("verify-rows-94-124 selftest: the live tree is already red:", check(sources));
    process.exit(1);
  }
  for (const [key, mutate] of plants) {
    const planted = { ...sources, [key]: mutate(sources[key]) };
    if (planted[key] === sources[key] || check(planted).length === 0) {
      console.error(`verify-rows-94-124 selftest FAIL: planted defect in ${key} was not detected`);
      process.exit(1);
    }
  }
  console.log(`verify-rows-94-124 selftest: ${plants.length} planted defects detected; live tree green`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error("verify-rows-94-124 FAIL:");
  for (const x of failures) console.error(" -", x);
  process.exit(1);
}
console.log("verify-rows-94-124 PASS — driver bills carry a due date; practical strays never post; live_load_number never self-referential");
