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
};

export function problems(src) {
  const p = [];
  const ad = src.svc.slice(src.svc.indexOf("async function applyDeduction("), src.svc.indexOf("async function applyDeduction(") + 1400);
  if (!/createSettlementDeduction\([\s\S]{0,400}\bloadId,/.test(ad) || !/"deduction_load_required"/.test(ad)) p.push("deductions must carry their load (loadId) or refuse deduction_load_required");
  if (/adminFeePost/.test(src.svc)) p.push("a separate admin_fee_cents is still posted");
  if (!/"admin_fee_needs_load"/.test(src.rule)) p.push("admission must refuse a separate admin_fee_cents");
  if (!/admin_fee_cents: null,/.test(src.drawer) || !/description: "Admin fee", amount_cents: adminFeeCents, load_number: adminFeeLoadNumber/.test(src.drawer)) p.push("the drawer must send the admin fee as a deduction line with its load");
  if (!/const fuelLoadNumber = attributeFuelLoadNumber\(draft\.loads, fuel\)/.test(src.svc)) p.push("fuel with no load must be attributed by date (attributeFuelLoadNumber)");
  if (!/candidates\.length === 1\) return candidates\[0\]/.test(src.rule) || !/"fuel_load_ambiguous"/.test(src.rule) || /candidates\[0\]!?\s*;?\s*\/\/ first|\?\? loads\[0\]/.test(src.rule)) p.push("fuel attribution must take exactly one candidate, refuse otherwise, never the first load");
  if (!/lineLoadRefusal\(/.test(src.adm)) p.push("admission must run lineLoadRefusal before anything is written");
  if (!/e\.load_number\?\.trim\(\) \|\| draft\.loads\?\.\[0\]\?\.load_number/.test(src.svc)) p.push("escrow's first-load fallback changed (owner ruling 2026-10-10: leave it)");
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
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 5/5 (real tree passes; settlement-only deduction, first-load fuel, separate admin fee, missing admission rule each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — deductions and the admin fee carry their load; fuel attributes to the one load whose dates cover it, else refuses.`);
