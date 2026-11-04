#!/usr/bin/env node
// ACCT-F11102 — OWNER, load 13693: "the data you got from the settlement directly is the correct data."
// Measured on prod 11-04 before the fix: driver bill 13693 (75a12be7) $979.45 = 1,958.9 mi × 50¢; its settlement P-0115 line
// (541df926, source_driver_bill_id = the bill) $940.27 = 1,958.9 × 48¢. The delivery-accrual sweep skipped it by name
// (settlement_pays_less_than_bill), so its pay sat off A/P, and no engine could re-price a bill TO its settlement line:
// Edit Load re-prices from the driver's ACTIVE rate (50¢ → $979.45 again), the Creator restate refuses a bill on a live
// settlement and voids the settlement's (correct) lines.
//
// Checks (static, each planted in --selftest):
//   1. THE engine (driver-bill-reprice-to-settlement.service.ts) re-prices only the driver bill: miles × rate must reproduce
//      the settlement line before any write (never back-solved), and it never writes settlement_lines, mdata.drivers or a
//      pay-rate table.
//   2. Accrued pay follows through THE restate engine (releaseDriverPayAccrualInClientTx → reaccrueDriverPayInClientTx); no
//      GL / A/P bill write of its own.
//   3. Refuses a posted settlement and a line that is not the bill's own live earnings line; audits the change.
//   4. A callable route passes THE delivery accrual.
//   5. The delivery accrual still refuses to accrue a bill whose settlement pays less (settlement_pays_less_than_bill), so a
//      mismatched bill is fixed by THIS engine, never accrued at the stale amount.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-bill-reprices-to-settlement-line";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  engine: "apps/backend/src/driver-finance/driver-bill-reprice-to-settlement.service.ts",
  routes: "apps/backend/src/driver-finance/driver-bills.routes.ts",
  accrual: "apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.ts",
};

export function failures(src) {
  const f = [];
  const e = src.engine ?? "";
  if (!e) return ["the re-price-to-settlement engine is missing"];
  const check = e.indexOf("perMilePayCents(miles, input.ratePerMileCents)");
  const write = e.indexOf("UPDATE driver_finance.driver_bills");
  if (check < 0 || !/"rate_does_not_reproduce_settlement"/.test(e)) f.push("the engine must refuse a rate whose miles × rate does not reproduce the settlement line");
  if (check >= 0 && write >= 0 && write < check) f.push("the reproduce check must run BEFORE the driver bill is written");
  if (/UPDATE driver_finance\.settlement_lines|INSERT INTO driver_finance\.settlement_lines/.test(e)) f.push("the engine must never write the settlement line (the settlement is the document)");
  if (/UPDATE mdata\.drivers|driver_pay_rates|pay_rate_cards|INSERT INTO accounting\.|UPDATE accounting\./.test(e)) f.push("the engine must not change a driver's pay rate or write the GL / A/P itself");
  if (!/releaseDriverPayAccrualInClientTx\(/.test(e) || !/reaccrueDriverPayInClientTx\(/.test(e)) f.push("accrued pay must follow through THE restate engine (release + re-accrue)");
  if (!/"settlement_posted"/.test(e) || !/"settlement_line_not_this_bill"/.test(e)) f.push("the engine must refuse a posted settlement and a foreign line");
  if (!/sl\.source_driver_bill_id = \$3::uuid/.test(e)) f.push("the settlement line must be the bill's own (source_driver_bill_id)");
  if (!/"driver_finance\.driver_bill\.repriced_to_settlement_line"/.test(e)) f.push("the engine must audit the re-price");
  const r = src.routes ?? "";
  if (!/"\/api\/v1\/driver-finance\/driver-bills\/:id\/reprice-to-settlement-line"/.test(r) || !/repriceDriverBillToSettlementLineInClientTx\(/.test(r) || !/accrue: accrueDriverPayAtDeliveryInClientTx/.test(r)) f.push("a callable route must run the engine with THE delivery accrual");
  if (!/THEN 'settlement_pays_less_than_bill'/.test(src.accrual ?? "")) f.push("the delivery accrual must keep refusing a bill its settlement pays less than");
  return f;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), "utf8") : null]));

if (process.argv.includes("--selftest")) {
  const base = read();
  const clean = failures(base);
  if (clean.length) { console.error(`${LABEL} SELFTEST: live tree must pass first: ${clean.join(" | ")}`); process.exit(1); }
  const plant = (name, key, from, to) => {
    const m = (base[key] ?? "").replace(from, to);
    if (m === base[key]) { console.error(`${LABEL} SELFTEST: plant "${name}" did not apply`); process.exit(1); }
    if (!failures({ ...base, [key]: m }).length) { console.error(`${LABEL} SELFTEST: plant "${name}" NOT caught`); process.exit(1); }
    console.log(`  caught: ${name}`);
  };
  plant("rate back-solved / not checked", "engine", '"rate_does_not_reproduce_settlement"', '"rate_note"');
  plant("engine rewrites the settlement line", "engine", "const upd = await client.query(", "await client.query(`UPDATE driver_finance.settlement_lines SET amount = 0`);\n  const upd = await client.query(");
  plant("engine changes the driver's pay rate", "engine", "const upd = await client.query(", "await client.query(`UPDATE mdata.drivers SET pay = 1`);\n  const upd = await client.query(");
  plant("accrued pay left at the old amount", "engine", "await releaseDriverPayAccrualInClientTx(client,", "await Promise.resolve(client,");
  plant("posted settlement re-priced", "engine", '"settlement_posted"', '"ok"');
  plant("no route", "routes", "/api/v1/driver-finance/driver-bills/:id/reprice-to-settlement-line", "/x");
  plant("accrual accrues a mismatched bill", "accrual", "THEN 'settlement_pays_less_than_bill'", "THEN NULL");
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const out = failures(read());
if (out.length) { console.error(`${LABEL} FAIL:\n  - ${out.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — a driver bill re-prices TO its settlement line (miles × rate reproduces it), accrual follows the restate engine, the settlement and the driver's rate are never written`);
