#!/usr/bin/env node
/**
 * LEAD 443.167-R — the Settlement Creator pays a load the seed booked first.
 *
 * Measured on main before this step: settlements 5839–5842 could not post. The seed had booked their loads, and the
 * Creator adopted an existing load only through Edit of its own prior settlement ("only books NEW load numbers"). The
 * loads' proforma driver bills (seed miles) then broke the close identity gross = Σ driver bills.
 *
 * Guards (settlement-creator-seed-loads.ts / settlement-creator.service.ts):
 *   1. isSeededLoadFreeForThisSettlement adopts only this driver's live load on no LIVE settlement other than this document's;
 *   2. ensureDispatchedLoadsForCreator adopts it BEFORE the "only books NEW load numbers" refusal;
 *   3. restateOpenDriverBillToSignedPay runs before the pay lines, voids (never deletes) and mints one -R bill, and refuses a
 *      bill settled in a live settlement or accrued at delivery;
 *   4. a load already past delivery is never re-delivered (not gated on Edit only).
 *   5. (443.167-R2, owner standing ruling) a USMCA settlement document (AlwaysTrack number) admits an all-Transportation
 *      draft; only a draft with no USMCA settlement number is refused;
 *   6. an adopted Transportation load settled at $0 drops the seed's revenue (Event 1 earn reversed through the JE
 *      reversal engine, charge lines and rate to $0) before its $0 invoice, and refuses when a live invoice exists.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const SVC = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const ADM = "apps/backend/src/driver-finance/settlement-creator-admission.ts";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const seed = src.seed ?? read(SEED);
  const svc = src.svc ?? read(SVC);
  const adm = src.adm ?? read(ADM);
  const book = src.book ?? read(BOOK);
  const f = [];
  if (!book.includes("load.miles_shortest = pay.shortMiles") || !book.includes("load.driver_pay_rate_per_mile = pay.rateCents / 100") || !book.includes("driver_bill_signed_pay_invalid")) f.push(`${BOOK}: canonical adopted mint must validate and carry signed short miles/rate (8)`);
  if (!/const usmcaSettlementDocument = isAlwaysTrackSettlementNumber\(String\(draft\.settlement_no/.test(adm) || !/!usmcaSettlementDocument && loads\.every\(\(l\) => l\.factoring === "faro_transportation"\)/.test(adm))
    f.push(`${ADM}: a USMCA settlement document with only Transportation loads is refused (5: owner standing ruling 443.167-R2)`);
  const zero = svc.match(/export async function restateAdoptedLoadToZeroRevenue\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!zero) f.push(`${SVC}: restateAdoptedLoadToZeroRevenue missing (6)`);
  else {
    if (!/reverseJournalEntryNoFlip\(/.test(zero) || !/source_transaction_type = 'load'/.test(zero)) f.push(`${SVC}: the $0 restate does not reverse the load's Event 1 earn through the JE reversal engine (6)`);
    if (!/zero_revenue_load_already_invoiced/.test(zero)) f.push(`${SVC}: the $0 restate rewrites a load that already has a live invoice (6)`);
    if (/DELETE\s+FROM/i.test(zero)) f.push(`${SVC}: the $0 restate deletes rows (6)`);
  }
  const zc = svc.indexOf("await restateAdoptedLoadToZeroRevenue(client, {");
  const bi = svc.indexOf("built = await buildInvoiceFromLoad(client, {");
  if (zc === -1 || bi === -1 || zc > bi) f.push(`${SVC}: the $0 restate does not run before the invoice (6)`);
  const free = seed.match(/export async function isSeededLoadFreeForThisSettlement\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!free) f.push(`${SEED}: isSeededLoadFreeForThisSettlement missing (1)`);
  else {
    if (!/assigned_primary_driver_id = \$3::uuid/.test(free)) f.push(`${SEED}: adoption is not limited to this settlement's driver (1)`);
    if (!/l\.voided_at IS NULL AND l\.soft_deleted_at IS NULL/.test(free)) f.push(`${SEED}: a voided / deleted load can be adopted (1)`);
    if (!/s\.voided_at IS NULL AND s\.status <> 'cancelled'[\s\S]{0,120}source_document_ref, ''\) <> \$4/.test(free)) f.push(`${SEED}: a load paid by another live settlement can be adopted (1)`);
  }
  const ensure = seed.match(/export async function ensureDispatchedLoadsForCreator\([\s\S]*$/)?.[0] ?? "";
  const adoptAt = ensure.indexOf("await isSeededLoadFreeForThisSettlement(client, draft, existing.rows[0].id)");
  const refuseAt = ensure.indexOf("only books NEW load numbers");
  if (adoptAt === -1 || refuseAt === -1 || adoptAt > refuseAt) f.push(`${SEED}: the seeded-load adoption does not run before the NEW-loads refusal (2)`);
  const adoption = ensure.slice(adoptAt, refuseAt);
  const earlyRestate = adoption.indexOf("await restateCreatorDriverBillFromSignedLoad(client, draft, load, loadId, actor.uuid)");
  const earlyDeliver = adoption.indexOf("await deliverLoadThroughDispatch(client, actor.uuid");
  if (!adoption.includes("if (!(load.not_yet_delivered !== false && !load.delivery_date))") || earlyRestate < 0 || earlyDeliver < earlyRestate || !adoption.includes("await stampStopsFromTracking")) {
    f.push(`${SEED}: adopted completed leg must restate signed pay and stamp/deliver before booking the next leg (7)`);
  }
  const restate = svc.match(/export async function restateOpenDriverBillToSignedPay\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!restate) f.push(`${SVC}: restateOpenDriverBillToSignedPay missing (3)`);
  else {
    if (!restate.includes("await ensureDriverBillArtifactsForLoad(client, {") || !restate.includes("bill = await readBills()") || !restate.includes("driver_bill_missing_or_ambiguous")) f.push(`${SVC}: missing adopted bill must use canonical mint, re-read and refuse unless exactly one live bill (8)`);
    if (/DELETE\s+FROM/i.test(restate)) f.push(`${SVC}: the restate deletes a money row (3)`);
    if (!/SET status = 'void', voided_at = now\(\)/.test(restate) || !/`\$\{input\.loadNumber\}-R`/.test(restate)) f.push(`${SVC}: the restate must void the bill and mint one -R replacement (3)`);
    if (!/state\.settled \|\| state\.accrued/.test(restate)) f.push(`${SVC}: the restate does not refuse a live-settled or delivery-accrued bill (3)`);
  }
  const restCall = svc.indexOf("await restateOpenDriverBillToSignedPay(client, {");
  const payCall = svc.indexOf('lineType: "earnings",', restCall === -1 ? 0 : restCall);
  if (restCall === -1 || payCall === -1) f.push(`${SVC}: the post never restates the proforma bill before writing pay (3)`);
  if (!svc.includes("await restateCreatorDriverBillFromSignedLoad(client, draft, load, loadId, actorUserId)")) f.push(`${SVC}: posting must reuse the same signed-pay restatement as early delivery (7)`);
  if (/draft\.edit_void_repost && \["delivered", "delivered_pending_docs", "invoiced"/.test(svc)) f.push(`${SVC}: a delivered adopted load is re-delivered unless the post is an Edit (4)`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const seed = read(SEED), svc = read(SVC), adm = read(ADM), book = read(BOOK);
  if (check().length) { console.error("SELFTEST FAIL: baseline not clean", check()); process.exit(1); }
  const plants = [
    ["signed short projection removed", { book: book.replace("load.miles_shortest = pay.shortMiles", "void pay.shortMiles") }],
    ["signed rate projection removed", { book: book.replace("load.driver_pay_rate_per_mile = pay.rateCents / 100", "void pay.rateCents") }],
    ["missing bill mint removed", { svc: svc.replace("await ensureDriverBillArtifactsForLoad(client, {", "void ({") }],
    ["missing bill refusal removed", { svc: svc.replace("driver_bill_missing_or_ambiguous", "silent_missing_bill") }],
    ["early restatement removed", { seed: seed.replace("await restateCreatorDriverBillFromSignedLoad(client, draft, load, loadId, actor.uuid)", "void 0") }],
    ["unfinished leg delivered", { seed: seed.replace("if (!(load.not_yet_delivered !== false && !load.delivery_date))", "if (true)") }],
    ["early delivery removed", { seed: seed.replace("await deliverLoadThroughDispatch(client, actor.uuid", "void (client, actor.uuid") }],
    ["shared restatement disconnected", { svc: svc.replace("await restateCreatorDriverBillFromSignedLoad(client, draft, load, loadId, actorUserId)", "void 0") }],
    ["any driver", { seed: seed.replace("AND l.assigned_primary_driver_id = $3::uuid", "AND $3::uuid IS NOT NULL") }],
    ["live other settlement", { seed: seed.replace("AND s.voided_at IS NULL AND s.status <> 'cancelled'", "AND false") }],
    ["adoption removed", { seed: seed.replace("await isSeededLoadFreeForThisSettlement(client, draft, existing.rows[0].id)", "false") }],
    ["restate skipped", { svc: svc.replace("await restateOpenDriverBillToSignedPay(client, {", "void ({") }],
    ["restate no refusal", { svc: svc.replace("state.settled || state.accrued", "false") }],
    ["series refused", { adm: adm.replace("!usmcaSettlementDocument && loads.every", "loads.every") }],
    ["no earn reversal", { svc: svc.replace("await reverseJournalEntryNoFlip(client as never, { operatingCompanyId: input.companyId, journalEntryId: e.je", "void ({ operatingCompanyId: input.companyId, journalEntryId: e.je") }],
    ["zero restate skipped", { svc: svc.replace("await restateAdoptedLoadToZeroRevenue(client, {", "void ({") }],
    ["re-deliver unless edit", { svc: svc.replace('if (!["delivered", "delivered_pending_docs", "invoiced"', 'if (!(draft.edit_void_repost && ["delivered", "delivered_pending_docs", "invoiced"') }],
  ];
  for (const [n, s] of plants) {
    const same = (s.seed ?? seed) === seed && (s.svc ?? svc) === svc && (s.adm ?? adm) === adm && (s.book ?? book) === book;
    if (same || !check(s).length) { console.error(`SELFTEST FAIL: plant "${n}" ${same ? "did not apply" : "not caught"}`); process.exit(1); }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
const f = check();
if (f.length) { console.error(`verify-creator-adopts-seeded-load FAIL (${f.length}):`); for (const x of f) console.error(`  ${x}`); process.exit(1); }
console.log("verify-creator-adopts-seeded-load PASS: seeded loads adopted by their signed settlement; proforma bill restated; no re-delivery");
