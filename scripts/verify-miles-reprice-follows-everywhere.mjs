#!/usr/bin/env node
// LEAD 443.269-B (owner order 10-23 7:52 AM CT): a miles change re-prices the driver bill EVERYWHERE — driver_bills,
// the accrued A/P bill (accounting.bills) and its journal entry by reversal + repost, the open pre-settlement's pay
// lines and header, Cash Flow (it reads the A/P bill) — through ONE restate engine (driver-pay-restate.service.ts).
// Measured on a fork before the fix: load 13688 on an OPEN pre-settlement, miles 1875.7 -> 1700 => Edit Load returned
// already_exists (nothing moved); a bill accrued at delivery kept its A/P + JE at the old amount; the Creator refused an
// accrued bill with no restate path. --selftest plants each regression.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-miles-reprice-follows-everywhere";
const FILES = {
  engine: "apps/backend/src/driver-finance/driver-pay-restate.service.ts",
  bookLoad: "apps/backend/src/dispatch/book-load.service.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  accrual: "apps/backend/src/driver-finance/driver-pay-delivery-accrual.service.ts",
};
// The Creator's driver-bill restate was moved VERBATIM into settlement-creator-restate-bill.ts on 2026-10-25 (import-cycle break;
// the service re-exports it). The Creator source is judged as the service + that leaf, as one text.
const CREATOR_RESTATE = "apps/backend/src/driver-finance/settlement-creator-restate-bill.ts";
const read = () => {
  const out = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(join(ROOT, p), "utf8")]));
  out.creator = `${out.creator}\n${readFileSync(join(ROOT, CREATOR_RESTATE), "utf8")}`;
  return out;
};

export function repriceFailures({ engine, bookLoad, creator, accrual }) {
  const f = [];
  // The engine: reversal through THE bill void engine (never an edit of the A/P amount), re-accrual, refusals, audit.
  if (!/voidBillInClientTx\(/.test(engine)) f.push("restate engine must reverse the accrued A/P bill through voidBillInClientTx");
  if (/UPDATE accounting\.bills[\s\S]{0,200}amount_cents\s*=/.test(engine)) f.push("restate engine must never edit an A/P bill amount in place");
  // The engine is a leaf (no import cycle): the delivery accrual is passed in, and BOTH callers must pass THE accrual.
  if (!/await input\.accrue\(/.test(engine)) f.push("restate engine must re-accrue through THE delivery accrual");
  if (!/accrue: accrueDriverPayAtDeliveryInClientTx,?\s*\}\)/.test(bookLoad)) f.push("Edit Load must re-accrue through THE delivery accrual");
  if (!/accrue: accrueDriverPayAtDeliveryInClientTx \}\)/.test(creator)) f.push("Settlement Creator must re-accrue through THE delivery accrual");
  if (!/"accrued_bill_paid"/.test(engine) || !/"driver_bill_settled"/.test(engine)) f.push("restate engine must refuse a paid A/P bill and a settled driver bill (adjustment on the next settlement)");
  if (!/out\.accrued\.some\(\(a\) => a\.driver_bill_id === input\.driverBillId\)/.test(engine)) f.push("a re-accrual that posts nothing must refuse (the reversal already posted)");
  if (!/SET is_active = false, voided_at = now\(\)/.test(engine)) f.push("pay lines on the open pre-settlement are voided, never deleted or edited in place");
  // Edit Load: an OPEN pre-settlement bill is re-priceable; the re-price calls the engine for the A/P and the lines.
  if (!/existing\.settled_in_settlement_id == null \|\| existing\.editable_settlement_id != null/.test(bookLoad)) f.push("Edit Load must re-price a bill on an OPEN, unposted pre-settlement");
  const branch = bookLoad.slice(bookLoad.indexOf("UPDATE driver_finance.driver_bills\n           SET driver_id = $2::uuid,"));
  if (!/restateOpenSettlementPayLinesInClientTx\(/.test(branch)) f.push("Edit Load re-price must restate the open pre-settlement pay lines");
  if (!/releaseDriverPayAccrualInClientTx\(/.test(branch) || !/reaccrueDriverPayInClientTx\(/.test(branch)) f.push("Edit Load re-price must release + re-accrue the delivery A/P");
  // Creator: an accrued bill is restated through the engine, not refused.
  if (/state\.settled \|\| state\.accrued\)/.test(creator)) f.push("Settlement Creator must not refuse an accrued bill — it restates it through the engine");
  if (!/releaseDriverPayAccrualInClientTx\(/.test(creator) || !/reaccrueDriverPayInClientTx\(/.test(creator)) f.push("Settlement Creator restate must release + re-accrue the delivery A/P");
  // The accrual can re-accrue the restated bill while it sits on its open pre-settlement.
  if (!/restateDriverBillId\?: string/.test(accrual)) f.push("delivery accrual must accept restateDriverBillId (open pre-settlement re-accrual)");
  return f;
}

const sources = read();
if (process.argv.includes("--selftest")) {
  const real = repriceFailures(sources);
  if (real.length) { console.error(`${LABEL} --selftest FAIL — real tree not clean: ${real[0]}`); process.exit(1); }
  const plants = [
    ["A/P edited in place", { engine: sources.engine + "\nUPDATE accounting.bills SET amount_cents = 1 WHERE id = $1" }],
    ["no reversal", { engine: sources.engine.replaceAll("voidBillInClientTx(", "noVoid(") }],
    ["no re-accrual", { engine: sources.engine.replaceAll("await input.accrue(", "await noAccrue(") }],
    ["Edit Load re-accrues through a stand-in", { bookLoad: sources.bookLoad.replaceAll("accrue: accrueDriverPayAtDeliveryInClientTx", "accrue: async () => ({ accrued: [] })") }],
    ["Creator re-accrues through a stand-in", { creator: sources.creator.replaceAll("accrue: accrueDriverPayAtDeliveryInClientTx", "accrue: async () => ({ accrued: [] })") }],
    ["silent empty re-accrual", { engine: sources.engine.replace("out.accrued.some((a) => a.driver_bill_id === input.driverBillId)", "true") }],
    ["paid bill rewritten", { engine: sources.engine.replaceAll('"accrued_bill_paid"', '"x"') }],
    ["open pre-settlement frozen again", { bookLoad: sources.bookLoad.replace("existing.settled_in_settlement_id == null || existing.editable_settlement_id != null", "existing.settled_in_settlement_id == null") }],
    ["Edit Load skips the lines", { bookLoad: sources.bookLoad.replaceAll("restateOpenSettlementPayLinesInClientTx(", "skip(") }],
    ["Edit Load skips the A/P", { bookLoad: sources.bookLoad.replaceAll("releaseDriverPayAccrualInClientTx(", "skip(") }],
    ["Creator refuses accrued again", { creator: sources.creator.replace("|| state.settled) {", "|| state.settled || state.accrued) {") }],
  ];
  for (const [name, patch] of plants) {
    const mutated = { ...sources, ...patch };
    if (Object.keys(patch).every((k) => mutated[k] === sources[k])) { console.error(`${LABEL} --selftest FAIL — plant did not apply: ${name}`); process.exit(1); }
    if (repriceFailures(mutated).length === 0) { console.error(`${LABEL} --selftest FAIL — plant escaped: ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS (${plants.length}/${plants.length} plants caught; real tree clean)`);
  process.exit(0);
}
const failures = repriceFailures(sources);
if (failures.length) { for (const m of failures) console.error(`FAIL ${LABEL}: ${m}`); process.exit(1); }
console.log(`PASS ${LABEL}`);
