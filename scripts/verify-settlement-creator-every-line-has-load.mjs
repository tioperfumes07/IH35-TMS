#!/usr/bin/env node
/**
 * GUARD — ROUND 443.5: EVERY DEDUCTION, ADMIN FEE AND FUEL LINE CARRIES ITS LOAD (owner rule 2026-10-02: "every
 * settlement item belongs to a load").
 *
 * MEASURED on main 745714fe5d: applyDeduction called createSettlementDeduction with no loadId; admin_fee_cents was a
 * settlement-level amount with no load; a fuel fill with no load typed was written with a load exemption reason.
 *
 * STATIC
 *   1. applyDeduction resolves the line's load and passes loadId; missing/unknown refuses deduction_load_required
 *   2. no separate admin_fee_cents posting; admission refuses admin_fee_cents (no load / double entry); the drawer
 *      sends the admin fee as a deduction line with its load and admin_fee_cents null
 *   3. fuel with no load is attributed by date to exactly one of this settlement's loads (attributeFuelLoadNumber);
 *      none or several refuses fuel_load_ambiguous — never the first load
 *   4. admission runs lineLoadRefusal before anything is written
 *   5. escrow's first-load fallback is unchanged (owner ruling 2026-10-10)
 * Run: node scripts/verify-settlement-creator-every-line-has-load.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-every-line-has-load";
const F = {
  svc: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  rule: "apps/backend/src/driver-finance/settlement-creator-line-load.ts",
  adm: "apps/backend/src/driver-finance/settlement-creator-admission.ts",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-line-load.test.ts",
  // 443.110 G3 + G5
  seed: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
  pre: "apps/backend/src/driver-finance/settlement-creator-preflight.ts",
  routes: "apps/backend/src/driver-finance/settlement-creator.routes.ts",
};

export function problems(src) {
  const p = [];
  const ad = src.svc.slice(src.svc.indexOf("async function applyDeduction("), src.svc.indexOf("async function applyDeduction(") + 1400);
  if (!/createSettlementDeduction\([\s\S]{0,400}\bloadId,/.test(ad) || !/"deduction_load_required"/.test(ad)) p.push("deductions must carry their load (loadId) or refuse deduction_load_required");
  if (/adminFeePost/.test(src.svc)) p.push("a separate admin_fee_cents is still posted");
  if (!/"admin_fee_needs_load"/.test(src.rule)) p.push("admission must refuse a separate admin_fee_cents");
  if (!/admin_fee_cents: null,/.test(src.drawer) || !/description: "Admin fee", amount_cents: adminFeeCents, load_number: adminFeeLoadNumber/.test(src.drawer)) p.push("the drawer must send the admin fee as a deduction line with its load");
  if (!/const fuelLoadNumber = attributeFuelLoadNumber\(draft\.loads, fuel\)/.test(src.svc)) p.push("fuel with no load must be attributed by date (attributeFuelLoadNumber)");
  const fuelRule = src.rule.slice(src.rule.indexOf("export function attributeFuelLoadNumber("), src.rule.indexOf("export function attributeFuelLoadNumber(") + 900);
  if (!/candidates\.length === 1\) return candidates\[0\]/.test(fuelRule) || !/"fuel_load_ambiguous"/.test(src.rule) || /candidates\[0\]!?\s*;?\s*\/\/ first|\?\? loads\[0\]/.test(src.rule)) p.push("fuel attribution must take exactly one candidate, refuse otherwise, never the first load");
  if (!/lineLoadRefusal\(/.test(src.adm)) p.push("admission must run lineLoadRefusal before anything is written");
  if (!/e\.load_number\?\.trim\(\) \|\| draft\.loads\?\.\[0\]\?\.load_number/.test(src.svc)) p.push("escrow's first-load fallback changed (owner ruling 2026-10-10: leave it)");
  // 443.110 G3 — the document's customer, never the company's oldest active customer.
  if (/ORDER BY created_at ASC\s+LIMIT 1/.test(src.seed) || !/code: "customer_unmatched"/.test(src.seed) || !/const found = await findCreatorCustomer\(client, opco, load\);[\s\S]{0,80}throw new SettlementCreatorSeedError\(found\.code/.test(src.seed)) p.push("G3: the Creator must refuse an unmatched customer (customer_unmatched) — never fall back to another customer");
  if (!/await findCreatorCustomer\(client as never, co, l\)/.test(src.pre)) p.push("G3: the preview must list an unmatched customer");
  // 443.110 G5 — every Creator settlement line binds load_id, and the line kinds resolve it or refuse.
  for (const m of src.svc.matchAll(/INSERT INTO driver_finance\.settlement_lines\s*\(([\s\S]*?)\)/g)) {
    if (!/\bload_id\b/.test(m[1])) p.push(`G5: a Creator settlement_lines insert does not bind load_id (${m[1].replace(/\s+/g, " ").slice(0, 80)})`);
  }
  if (!/const rLoadId = await creatorLineLoadId\(client, draft, \{ label: `Reimbursement/.test(src.svc)) p.push("G5: a reimbursement must carry its load (creatorLineLoadId)");
  if (!/const lineLoadId = await creatorLineLoadId\(client, draft, \{ label: `Reimbursable expense/.test(src.svc)) p.push("G5: a reimbursable expense line must carry its load (creatorLineLoadId)");
  if (!/const loadId = await creatorLineLoadId\(client, draft, \{ label: `Additional pay/.test(src.svc)) p.push("G5: additional pay must carry its load (creatorLineLoadId)");
  if (!/if \(!loadId\) throw lineLoadNotFound\(`Fuel/.test(src.svc)) p.push("G5: a fuel fill whose typed load is not this company's must refuse, never post load-less");
  if (!/if \(!id\) throw lineLoadNotFound\(line\.label, n\);/.test(src.svc)) p.push("G5: creatorLineLoadId must refuse, never return null");
  if (!/"line_load_unresolved"/.test(src.rule) || /return loads\[0\]!?\.load_number;\s*\n\s*\}\s*\n\s*\/\*\*/.test(src.rule) && !/if \(loads\.length === 1\) return loads\[0\]!\.load_number;/.test(src.rule)) p.push("G5: line attribution must refuse line_load_unresolved (only the settlement's single load may be taken undated)");
  if (!/creatorLineLoadNumber\(draft\.loads \?\? \[\], line\)/.test(src.pre)) p.push("G5: the preview must list every line whose load does not resolve");
  if (!/unit_id: z\.string\(\)\.uuid\(\),/.test(src.routes) || !/blockers\.push\("Unit \(truck\) is required\."\)/.test(src.svc)) p.push("G5: the Creator unit (truck) is required");
  if (!/774\.55|13508/.test(src.test) || !/fuel_load_ambiguous|loads 13508, 13510/.test(src.test)) p.push("5769-shape and ambiguity tests missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("svc", "      createdByUserId: actorUserId,\n      loadId,", "      createdByUserId: actorUserId,")).some((x) => /deductions must carry/.test(x))) bad.push("a settlement-only deduction passed");
  if (!problems(m("rule", "if (candidates.length === 1) return candidates[0]!;", "if (candidates.length >= 1) return candidates[0]!;")).some((x) => /exactly one/.test(x))) bad.push("first-load fuel attribution passed");
  if (!problems(m("drawer", "admin_fee_cents: null,", "admin_fee_cents: adminFeeCents > 0 ? adminFeeCents : null,")).some((x) => /admin fee/.test(x))) bad.push("a separate admin fee passed");
  if (!problems(m("adm", "lineLoadRefusal(", "noop(")).some((x) => /admission/.test(x))) bad.push("admission without the line rule passed");
  if (!problems(m("seed", "  return {\n    code: \"customer_unmatched\",\n    message: `Load ${load.load_number}: customer \"${name}\"", "  return { id: (await client.query(`SELECT id FROM mdata.customers ORDER BY created_at ASC\n      LIMIT 1`)).rows[0].id };\n  return {\n    code: \"customer_unmatched\",\n    message: `Load ${load.load_number}: customer \"${name}\"")).some((x) => /G3: the Creator must refuse/.test(x))) bad.push("the oldest-customer fallback passed");
  if (!problems(m("pre", "await findCreatorCustomer(client as never, co, l)", "await noop(client, co, l)")).some((x) => /G3: the preview/.test(x))) bad.push("a preview without the customer check passed");
  if (!problems(m("svc", "const rLoadId = await creatorLineLoadId(client, draft, { label: `Reimbursement", "const rLoadId = null && ({ label: `Reimbursement")).some((x) => /G5: a reimbursement/.test(x))) bad.push("a load-less reimbursement passed");
  if (!problems(m("svc", "if (!loadId) throw lineLoadNotFound(`Fuel", "if (false) throw lineLoadNotFound(`Fuel")).some((x) => /G5: a fuel fill/.test(x))) bad.push("a load-less fuel fill passed");
  if (!problems(m("svc", "          item_id, quantity, rate_cents, unit_of_measure, load_id\n", "          item_id, quantity, rate_cents, unit_of_measure\n")).some((x) => /does not bind load_id/.test(x))) bad.push("a settlement_lines insert without load_id passed");
  if (!problems(m("routes", "unit_id: z.string().uuid(),", "unit_id: z.string().uuid().nullable().optional(),")).some((x) => /unit \(truck\)/.test(x))) bad.push("an optional unit passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 11/11 (real tree passes; settlement-only deduction, first-load fuel, separate admin fee, missing admission rule, oldest-customer fallback, preview without customer check, load-less reimbursement, load-less fuel, insert without load_id, optional unit each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — deductions, the admin fee, reimbursements, reimbursable expenses, additional pay and fuel carry their load (else refuse); the customer is the document's (no fallback); the unit is required.`);
