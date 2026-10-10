#!/usr/bin/env node
/**
 * GUARD — ROUND 443.6: COMPANY EXPENSE — REAL PAYMENT SOURCE, FULL STAMP, BILL WHEN OWED (owner 2026-10-10: "create bills,
 * bill expenses stamp"; law doc §3: paid now = Dr expense / Cr bank-card; owed = Dr expense / Cr A/P via a bill).
 *
 * MEASURED on main 745714fe5d (settlement-creator.service.ts): :1254 card = exp.card ?? "relay" (a missing source
 * silently credited the Relay wallet); :1274-1292 INSERT with no vendor / unit / trailer / vendor_document_number;
 * :1298-1302 quantity 1, rate = whole amount, 'each'; :1846 fallback to other operating expense with a null item;
 * :1326-1328 and the fuel path swallowed EXPENSE_POST_GL_REFUSED — document created, ledger not, post "succeeded".
 *
 * STATIC
 *   1. no "?? \"relay\"" default for a company expense; missing source refuses expense_payment_source_required (admission
 *      and post); the drawer has no default and offers Owed to vendor
 *   2. the expense carries vendor_uuid, load, driver, unit_id, trailer_id, vendor_document_number; lines carry the
 *      source quantity / unit / rate
 *   3. no fallback account: unresolved item refuses expense_item_unresolved
 *   4. no swallowed posting refusal (EXPENSE_POST_GL_REFUSED is never caught to continue)
 *   5. owed never credits a card: it becomes an A/P bill through createBillInClientTx carrying vendor document number,
 *      load, driver, unit, trailer and the source quantity (bill engine extended by CC-1 ROUND 443.13)
 * Run: node scripts/verify-settlement-creator-expense-stamped-and-sourced.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-expense-stamped-and-sourced";
const F = {
  svc: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  rule: "apps/backend/src/driver-finance/settlement-creator-line-load.ts",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-line-load.test.ts",
};

export function problems(src) {
  const p = [];
  const s = src.svc;
  if (/exp\.card \?\? "relay"/.test(s)) p.push('a company expense still defaults its payment source to "relay"');
  if (!/"expense_payment_source_required"/.test(s) || !/"expense_payment_source_required"/.test(src.rule)) p.push("a missing payment source must refuse expense_payment_source_required (admission and post)");
  if (!/vendor_uuid, unit_id, trailer_id, vendor_document_number/.test(s)) p.push("the company expense must carry vendor, unit, trailer and vendor_document_number");
  if (!/qty, rateCents, uom, itemAcct\.item_id/.test(s)) p.push("expense lines must carry the source quantity / unit / rate");
  if (/other_operating_expense"\);\s*\n\s*return fallback/.test(s) || !/"expense_item_unresolved"/.test(s)) p.push("an unresolved item must refuse (no fallback account)");
  if (/EXPENSE_POST_GL_REFUSED\|not posting-eligible/.test(s)) p.push("a posting refusal is swallowed — it must fail the whole post");
  {
    // ROUND 443.13 (CC-1) made the bill engine carry the stamp: owed -> createBillInClientTx (A/P), never a card credit.
    const owed = s.slice(s.indexOf('if (card === "owed") {'), s.indexOf('const preference = card === "dreamline"'));
    if (!/createBillInClientTx\(/.test(owed) || !/continue;/.test(owed)) p.push("owed must become an A/P bill (createBillInClientTx) and never fall through to a card credit");
    else if (!/vendorDocumentNumber:/.test(owed) || !/\bloadId,/.test(owed) || !/driverId: draft\.driver_id/.test(owed) || !/unitId:/.test(owed) || !/trailerId:/.test(owed) || !/quantity: qty/.test(owed)) p.push("the owed bill must carry vendor document number, load, driver, unit, trailer and the source quantity");
  }
  if (!/card: null,\s*\n\s*vendor_name: ""/.test(src.drawer) || !/value: "owed", label: "Owed to vendor \(bill\)"/.test(src.drawer)) p.push("the drawer must have no default payment source and offer Owed to vendor");
  if (!/expense_payment_source_required/.test(src.test) || !/6784/.test(src.test)) p.push("443.6 unit tests missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("svc", "const card = exp.card ?? null;\n    if (!card) {", 'const card = exp.card ?? "relay";\n    if (!card) {')).some((x) => /defaults/.test(x))) bad.push("a relay default passed");
  if (!problems(m("svc", "vendor_uuid, unit_id, trailer_id, vendor_document_number", "vendor_uuid")).some((x) => /carry vendor/.test(x))) bad.push("an unstamped expense passed");
  if (!problems(m("svc", 'throw new SettlementCreatorError("expense_post_refused"', 'if (!/EXPENSE_POST_GL_REFUSED|not posting-eligible/.test(String(err))) throw new SettlementCreatorError("expense_post_refused"')).some((x) => /swallowed/.test(x))) bad.push("a swallowed posting refusal passed");
  if (!problems(m("drawer", 'card: null,\n    vendor_name: ""', 'card: "relay",\n    vendor_name: ""')).some((x) => /drawer/.test(x))) bad.push("a drawer default passed");
  if (!problems(m("svc", "          driverId: draft.driver_id,\n", "")).some((x) => /owed bill must carry/.test(x))) bad.push("an unstamped owed bill passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 6/6 (real tree passes; relay default, unstamped expense, swallowed posting refusal, drawer default, unstamped owed bill each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — a company expense names its payment source (no default), carries vendor / load / driver / unit / trailer / vendor document number and the source quantity, has no fallback account, and a posting refusal fails the post.`);
