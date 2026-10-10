#!/usr/bin/env node
/**
 * GUARD — ROUND 443.3 (owner 2026-10-10): "we need to input in our app the invoice numbers for these loads that we
 * presented to faro and those in quickbooks that were not purchased." Law doc §5: every transaction creator has an
 * empty, editable number box; typed value wins verbatim; blank means the system assigns.
 *
 * MEASURED on main 745714fe5d: draftSchema loads[] had no invoice number; the Creator called buildInvoiceFromLoad with
 * loadId only, so every invoice was forced to the load number (the owner's USMCA numbers run 1..118).
 *
 * STATIC (part a / c / e — shipped)
 *   1. draftSchema loads[] carries invoice_number (digits 1..12, blank -> null)
 *   2. the mint passes requestedDisplayId from load.invoice_number and maps DuplicateDocumentNumberError to
 *      invoice_number_taken
 *   3. the route runs assertCreatorDraftAdmissible BEFORE ensureDispatchedLoadsForCreator (zero rows on refusal)
 *   4. admission refuses full_transportation_settlement with the owner's message, duplicate numbers in the draft, and
 *      a number already on another load's invoice (company-scoped); preview reports the same refusals as blockers
 *   5. the drawer has the "Invoice no." box and sends invoice_number
 *   6. the factor auto-submit stays faro_usmca-only (faro_transportation never submitted)
 * Part b / d ($0 Transportation invoice, feed-gate authorized case) need CC-1 ROUND 443.1 (authorizedZeroRevenue);
 * this guard is extended in that PR.
 * Run: node scripts/verify-settlement-creator-invoice-number-and-zero-invoice.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-invoice-number-and-zero-invoice";
const F = {
  routes: "apps/backend/src/driver-finance/settlement-creator.routes.ts",
  service: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  admission: "apps/backend/src/driver-finance/settlement-creator-admission.ts",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-admission.test.ts",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
};

export function problems(src) {
  const p = [];
  if (!/invoice_number: z\s*\.preprocess\([\s\S]{0,160}\^\[0-9\]\{1,12\}\$/.test(src.routes)) p.push("draftSchema loads[] has no digits-only invoice_number");
  const post = src.routes.slice(src.routes.indexOf('"/api/v1/driver-finance/settlement-creator/post"'));
  const a = post.indexOf("assertCreatorDraftAdmissible(client, draft)");
  const e = post.indexOf("ensureDispatchedLoadsForCreator(");
  if (a < 0 || e < 0 || a > e) p.push("admission must run before any load is booked");
  if (!/buildInvoiceFromLoad\(client, \{[\s\S]{0,400}requestedDisplayId: String\(load\.invoice_number/.test(src.service)) p.push("the mint does not pass the typed Invoice no. as requestedDisplayId");
  if (!/err instanceof DuplicateDocumentNumberError[\s\S]{0,120}"invoice_number_taken"/.test(src.service)) p.push("a duplicate number at mint must refuse as invoice_number_taken");
  if (!/blockers\.push\(err\.message\)/.test(src.service.slice(src.service.indexOf("export async function previewSettlementCreator"), src.service.indexOf("export async function previewSettlementCreator") + 1600)))
    p.push("preview does not report admission refusals as blockers");
  if (!/every\(\(l\) => l\.factoring === "faro_transportation"\)/.test(src.admission) || !/"full_transportation_settlement"/.test(src.admission)) p.push("an all-Transportation settlement is not refused");
  if (!/Every load in this settlement is Transportation — it is not entered in USMCA\./.test(src.admission)) p.push("the owner's full-Transportation message changed");
  if (!/"invoice_number_duplicate"/.test(src.admission) || !/"invoice_number_taken"/.test(src.admission)) p.push("admission does not refuse duplicate / taken numbers");
  if (!/i\.operating_company_id = \$1::uuid AND i\.display_id = ANY/.test(src.admission)) p.push("the taken-number check must be company-scoped");
  if (!/<Field label="Invoice no\.">/.test(src.drawer) || !/invoice_number: \(l\.invoice_number \?\? ""\)\.trim\(\) \|\| null/.test(src.drawer)) p.push("the drawer has no Invoice no. box or does not send invoice_number");
  if (!/if \(load\.factoring !== "faro_usmca"\) continue;/.test(src.routes)) p.push("factor auto-submit must stay faro_usmca-only");
  if (!/invoice_number_taken/.test(src.test) || !/full_transportation_settlement/.test(src.test)) p.push("admission unit tests missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("service", "requestedDisplayId: String(load.invoice_number", "requestedDisplayId: null && String(load.invoice_number")).some((x) => /requestedDisplayId/.test(x))) bad.push("a dropped typed number passed");
  if (!problems(m("routes", "await assertCreatorDraftAdmissible(client, draft);\n", "")).some((x) => /before any load/.test(x))) bad.push("admission after seeding passed");
  if (!problems(m("admission", 'every((l) => l.factoring === "faro_transportation")', 'some((l) => l.factoring === "faro_transportation")')).some((x) => /all-Transportation/.test(x))) bad.push("a some() Transportation rule passed");
  if (!problems(m("admission", "i.operating_company_id = $1::uuid AND ", "")).some((x) => /company-scoped/.test(x))) bad.push("an unscoped taken-number read passed");
  if (!problems(m("routes", 'if (load.factoring !== "faro_usmca") continue;', "")).some((x) => /faro_usmca-only/.test(x))) bad.push("a Transportation factor submit passed");
  if (!problems(m("drawer", '<Field label="Invoice no.">', '<Field label="Load #">')).some((x) => /Invoice no/.test(x))) bad.push("a missing Invoice no. box passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 7/7 (real tree passes; dropped number, late admission, some() rule, unscoped read, Transportation submit, missing box each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — Invoice no. box (typed wins, blank = load number), duplicates refused before any write, all-Transportation settlement refused.`);
