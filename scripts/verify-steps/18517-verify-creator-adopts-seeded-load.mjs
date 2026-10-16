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
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const SVC = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const seed = src.seed ?? read(SEED);
  const svc = src.svc ?? read(SVC);
  const f = [];
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
  const restate = svc.match(/export async function restateOpenDriverBillToSignedPay\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!restate) f.push(`${SVC}: restateOpenDriverBillToSignedPay missing (3)`);
  else {
    if (/DELETE\s+FROM/i.test(restate)) f.push(`${SVC}: the restate deletes a money row (3)`);
    if (!/SET status = 'void', voided_at = now\(\)/.test(restate) || !/`\$\{input\.loadNumber\}-R`/.test(restate)) f.push(`${SVC}: the restate must void the bill and mint one -R replacement (3)`);
    if (!/state\.settled \|\| state\.accrued/.test(restate)) f.push(`${SVC}: the restate does not refuse a live-settled or delivery-accrued bill (3)`);
  }
  const restCall = svc.indexOf("await restateOpenDriverBillToSignedPay(client, {");
  const payCall = svc.indexOf('lineType: "earnings",', restCall === -1 ? 0 : restCall);
  if (restCall === -1 || payCall === -1) f.push(`${SVC}: the post never restates the proforma bill before writing pay (3)`);
  if (/draft\.edit_void_repost && \["delivered", "delivered_pending_docs", "invoiced"/.test(svc)) f.push(`${SVC}: a delivered adopted load is re-delivered unless the post is an Edit (4)`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const seed = read(SEED), svc = read(SVC);
  if (check().length) { console.error("SELFTEST FAIL: baseline not clean", check()); process.exit(1); }
  const plants = [
    ["any driver", { seed: seed.replace("AND l.assigned_primary_driver_id = $3::uuid", "AND $3::uuid IS NOT NULL") }],
    ["live other settlement", { seed: seed.replace("AND s.voided_at IS NULL AND s.status <> 'cancelled'", "AND false") }],
    ["adoption removed", { seed: seed.replace("await isSeededLoadFreeForThisSettlement(client, draft, existing.rows[0].id)", "false") }],
    ["restate skipped", { svc: svc.replace("await restateOpenDriverBillToSignedPay(client, {", "void ({") }],
    ["restate no refusal", { svc: svc.replace("state.settled || state.accrued", "false") }],
    ["re-deliver unless edit", { svc: svc.replace('if (!["delivered", "delivered_pending_docs", "invoiced"', 'if (!(draft.edit_void_repost && ["delivered", "delivered_pending_docs", "invoiced"') }],
  ];
  for (const [n, s] of plants) {
    const same = (s.seed ?? seed) === seed && (s.svc ?? svc) === svc;
    if (same || !check(s).length) { console.error(`SELFTEST FAIL: plant "${n}" ${same ? "did not apply" : "not caught"}`); process.exit(1); }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
const f = check();
if (f.length) { console.error(`verify-creator-adopts-seeded-load FAIL (${f.length}):`); for (const x of f) console.error(`  ${x}`); process.exit(1); }
console.log("verify-creator-adopts-seeded-load PASS: seeded loads adopted by their signed settlement; proforma bill restated; no re-delivery");
