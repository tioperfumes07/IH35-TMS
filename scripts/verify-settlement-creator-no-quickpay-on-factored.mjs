#!/usr/bin/env node
/**
 * GUARD — ROUND 443.2 as amended (owner 2026-10-10 2:36 PM CT): "there is no quickpay do not worry."
 *
 * MEASURED on main 745714fe5d: SettlementCreatorDrawer computed quick pay = 0.50% x (invoice + accessorials) on
 * faro_usmca / faro_transportation loads and rendered it in the load block (sc-quickpay-expense) and the totals.
 * Quick pay does not exist in the Settlement Creator: no formula, no field, no totals row, for factored OR direct
 * loads. Nothing replaces it.
 *
 * STATIC: the drawer contains 0 occurrences of "quick" (any case). The render test asserts 0 sc-quickpay-expense.
 * Run: node scripts/verify-settlement-creator-no-quickpay-on-factored.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-no-quickpay-on-factored";
const F = {
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  test: "apps/frontend/src/pages/settlements/__tests__/SettlementCreatorDrawer.quickpay.test.tsx",
};

export function problems(src) {
  const p = [];
  const n = (src.drawer.match(/quick/gi) ?? []).length;
  if (n > 0) p.push(`the drawer contains "quick" ${n} time(s) — quick pay does not exist in the Settlement Creator`);
  if (!/queryAllByTestId\("sc-quickpay-expense"\)\)\.toHaveLength\(0\)/.test(src.test)) p.push("render test asserting 0 sc-quickpay-expense is missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  for (const plant of ["const quickPayExpenseCents = 0;", '<Field label="QuickPay expense" />', "// QUICK pay"]) {
    if (!problems({ ...good, drawer: good.drawer + "\n" + plant }).length) bad.push(`planted ${plant} passed`);
  }
  if (!problems({ ...good, test: good.test.replace(".toHaveLength(0)", ".toBeTruthy()") }).length) bad.push("a weakened render test passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 5/5 (real tree passes; planted formula, field, any-case comment, weakened render test each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — "quick" count 0 in the Settlement Creator drawer; no quick-pay field or totals row for any load.`);
