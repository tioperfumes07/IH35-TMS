#!/usr/bin/env node
/**
 * GUARD — ROUND 443.2 (owner 2026-10-10): "there is no quickpay that should render if confirmed those are factored."
 *
 * MEASURED on main 745714fe5d: SettlementCreatorDrawer computed quick pay = 0.50% x (invoice + accessorials) ONLY for
 * faro_usmca / faro_transportation loads — the exact inverse of the rule — and rendered it in the load block
 * (sc-quickpay-expense) and the settlement totals.
 *
 * STATIC
 *   1. no quick-pay percentage in the drawer: no 0.005 / 0.5% / "0.50 percent" literal, no quickPayExpenseCents
 *   2. factored = isFactoredLoad() (faro_usmca | faro_transportation) in api/settlementCreator.ts
 *   3. the QuickPay field renders only behind quickPayApplies = loads.some(l => !isFactoredLoad(l.factoring))
 *   4. the settlement totals carry no QuickPay row (nothing is computed, so nothing is totalled)
 * RENDER
 *   5. the render test exists and asserts a factored-only draft has 0 sc-quickpay-expense nodes
 * Run: node scripts/verify-settlement-creator-no-quickpay-on-factored.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-no-quickpay-on-factored";
const F = {
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  api: "apps/frontend/src/api/settlementCreator.ts",
  test: "apps/frontend/src/pages/settlements/__tests__/SettlementCreatorDrawer.quickpay.test.tsx",
};

export function problems(src) {
  const p = [];
  const d = src.drawer;
  if (/0\.005\b|\b0\.5\s*%|0\.50\s*(%|percent)|quickPayExpenseCents/i.test(d)) p.push("the drawer still carries a quick-pay percentage");
  if (!/export function isFactoredLoad[\s\S]{0,200}"faro_usmca"[\s\S]{0,80}"faro_transportation"/.test(src.api)) p.push("isFactoredLoad (faro_usmca | faro_transportation) missing from api/settlementCreator.ts");
  if (!/const quickPayApplies = loads\.some\(\(l\) => !isFactoredLoad\(l\.factoring\)\)/.test(d)) p.push("quickPayApplies must be 'some load is NOT factored'");
  const i = d.indexOf('data-testid="sc-quickpay-expense"');
  if (i < 0 || !/\{quickPayApplies \? \(\s*<Field label="QuickPay expense"/.test(d.slice(Math.max(0, i - 200), i))) p.push("sc-quickpay-expense must render only behind quickPayApplies");
  const totals = d.slice(d.indexOf('data-testid="sc-settlement-totals"'));
  if (/TotalRow label="QuickPay/.test(totals)) p.push("the settlement totals still carry a QuickPay row");
  if (!/queryAllByTestId\("sc-quickpay-expense"\)\)\.toHaveLength\(0\)/.test(src.test)) p.push("render test asserting 0 sc-quickpay-expense on a factored-only draft is missing");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("drawer", "const quickPayApplies", "const fee = Math.round(x * 0.005);\n  const quickPayApplies")).some((x) => /percentage/.test(x))) bad.push("a 0.005 literal passed");
  if (!problems(m("drawer", "loads.some((l) => !isFactoredLoad(l.factoring))", "loads.some((l) => isFactoredLoad(l.factoring))")).some((x) => /NOT factored/.test(x))) bad.push("the inverted rule passed");
  if (!problems(m("drawer", /\{quickPayApplies \? \(\s*<Field label="QuickPay expense"/, '{true ? (\n <Field label="QuickPay expense"')).some((x) => /behind quickPayApplies/.test(x))) bad.push("an ungated field passed");
  if (!problems(m("drawer", '<TotalRow label="Company total"', '<TotalRow label="QuickPay expense" cents={0} />\n<TotalRow label="Company total"')).some((x) => /QuickPay row/.test(x))) bad.push("a QuickPay totals row passed");
  if (!problems(m("test", '.toHaveLength(0)', ".toBeTruthy()")).some((x) => /render test/.test(x))) bad.push("a weakened render test passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 6/6 (real tree passes; 0.005 literal, inverted rule, ungated field, totals row, weakened render test each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — no quick-pay percentage; a factored-only settlement renders no QuickPay field or totals row.`);
