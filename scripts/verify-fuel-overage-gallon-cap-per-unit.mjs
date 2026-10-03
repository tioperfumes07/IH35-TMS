#!/usr/bin/env node
// ROUND 355 R-2 — the fuel-card cap is GALLONS, per unit, from the unit's own tank; the dollar limit is the LAST
// fallback, for a card row with no gallon quantity.
// Static: migration 202615330700 adds the tank + policy fallback + the active-policy-has-a-limit CHECK; the math
// evaluates gallons before dollars; the engine feeds the unit's tank into the math; the receivable posts to role
// fuel_overage_receivable (1250), never Cash Advance; void reverses a posted receivable (never deletes); an exemption needs a reason, a person and (repair) a work order.
// Live (DATABASE_URL): no active policy without a limit; and no overage event judged on DOLLARS whose card row
// carried gallons — the regression this ROUND fixes. Named debt below is shrink-only (events minted before R-2).
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "reads fuel.fuel_card_overage_policies and fuel.fuel_card_overage_events";

const LABEL = "verify-fuel-overage-gallon-cap-per-unit";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  mig: "db/migrations/202615330700_fuel_overage_gallon_cap_per_unit.sql",
  math: "apps/backend/src/fuel/fuel-card-overage.math.ts",
  svc: "apps/backend/src/fuel/fuel-card-overage.service.ts",
  post: "apps/backend/src/fuel/fuel-card-overage-posting.service.ts",
};
/**
 * NAMED DEBT (committed, shrink-only): dollar-rule events on rows that carry gallons, minted by the pre-R-2 engine.
 * All three are TRANSP, 2026-09; purge population. A new id here is a regression.
 */
export const DEBT = new Set([
  "09a5eb03-5c31-4aab-a1c1-63ffce493fd8", // 222.471 gal, posted
  "9e5f9166-4a82-499c-8de9-68d84a09412f", // 210.997 gal, company_variance
  "7b5435f6-405e-4315-afa2-288f7cd69235", // 211.044 gal, company_variance
]);

export function check(src) {
  const f = [];
  const { mig, math, svc, post } = src;
  if (!/ADD COLUMN IF NOT EXISTS fuel_tank_capacity_gallons numeric/.test(mig)) f.push(`${FILES.mig}: mdata.units.fuel_tank_capacity_gallons missing`);
  if (!/ADD COLUMN IF NOT EXISTS per_swipe_gallon_limit numeric DEFAULT 150/.test(mig)) f.push(`${FILES.mig}: policy per_swipe_gallon_limit (default 150) missing`);
  if (!/CHECK \(NOT is_active OR per_swipe_gallon_limit IS NOT NULL OR per_transaction_limit_cents IS NOT NULL\)/.test(mig)) f.push(`${FILES.mig}: an active policy with neither limit is no longer refused`);
  if (!/exempt_reason <> 'repair' OR exempt_work_order_id IS NOT NULL/.test(mig)) f.push(`${FILES.mig}: a repair exemption no longer needs its work order`);
  if ((mig.match(/CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON fuel\.fuel_card_overage_(events|policies)/g) ?? []).length !== 2) f.push(`${FILES.mig}: both overage tables must refuse DELETE (WORM)`);
  const g = math.indexOf("// 2) Gallons FIRST");
  const d = math.indexOf("// 3) LAST fallback");
  if (g < 0 || d < 0 || g > d) f.push(`${FILES.math}: gallons must be evaluated before the dollar limit`);
  if (!/if \(gallons !== null\) \{[\s\S]*?if \(!gl \|\| gallons <= gl\.limit\) return NO_OVERAGE;/.test(math)) f.push(`${FILES.math}: a row with gallons must be judged on gallons only (no fall-through to dollars)`);
  if (!/tank_capacity_gallons: gallonInputs\.tank_capacity_gallons/.test(svc)) f.push(`${FILES.svc}: the engine no longer feeds the unit's tank into the math`);
  if (!/u\.fuel_tank_capacity_gallons/.test(svc)) f.push(`${FILES.svc}: the tank is no longer read from mdata.units`);
  if (!/"fuel_overage_receivable"/.test(post) || /cash_advance/i.test(post)) f.push(`${FILES.post}: the receivable must post to role fuel_overage_receivable (1250), never Cash Advance`);
  // ROUND 352 point 7 — reversible: void reverses a posted receivable with a linked reversing entry, never a flip/delete.
  const voidFn = svc.match(/export async function voidFuelCardOverage\([\s\S]*?\n\}\n/);
  if (!voidFn || !/reverseJournalEntryNoFlip\(/.test(voidFn[0]) || /DELETE FROM/i.test(voidFn[0])) {
    f.push(`${FILES.svc}: voidFuelCardOverage must reverse a posted receivable via reverseJournalEntryNoFlip and never delete`);
  }
  return f;
}

export function judge({ policiesWithoutLimit, dollarRuleOnGallonRows }) {
  const f = [];
  if (policiesWithoutLimit > 0) f.push(`${policiesWithoutLimit} active fuel-card policy(ies) carry no limit`);
  for (const id of dollarRuleOnGallonRows) {
    if (!DEBT.has(id)) f.push(`overage event ${id} was judged on the dollar limit although its card row carries gallons`);
  }
  return f;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["dollars before gallons", { ...real, math: real.math.replace("// 2) Gallons FIRST", "// 2) gallons").replace("// 3) LAST fallback", "// 2) Gallons FIRST") }],
    ["gallon row falls through to dollars", { ...real, math: real.math.replace("if (!gl || gallons <= gl.limit) return NO_OVERAGE;", "if (!gl) return NO_OVERAGE;") }],
    ["tank not fed", { ...real, svc: real.svc.replace("tank_capacity_gallons: gallonInputs.tank_capacity_gallons", "tank_capacity_gallons: null") }],
    ["limitless policy allowed", { ...real, mig: real.mig.replace("CHECK (NOT is_active OR per_swipe_gallon_limit IS NOT NULL OR per_transaction_limit_cents IS NOT NULL)", "CHECK (true)") }],
    ["void stops reversing", { ...real, svc: real.svc.replace("const { reversal } = await reverseJournalEntryNoFlip(", "const { reversal } = await Promise.resolve(") }],
    ["WORM dropped", { ...real, mig: real.mig.replace("CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON fuel.fuel_card_overage_events", "-- no worm") }],
    ["receivable to cash advance", { ...real, post: real.post.replace('"fuel_overage_receivable"', '"driver_cash_advance"') }],
  ];
  for (const [name, s] of plants) {
    if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (judge({ policiesWithoutLimit: 1, dollarRuleOnGallonRows: [] }).length !== 1) fails.push("limitless policy not caught");
  if (judge({ policiesWithoutLimit: 0, dollarRuleOnGallonRows: ["00000000-0000-0000-0000-000000000000"] }).length !== 1) fails.push("new dollar-rule event on a gallon row not caught");
  if (judge({ policiesWithoutLimit: 0, dollarRuleOnGallonRows: [...DEBT] }).length !== 0) fails.push("named debt flagged");
  const n = plants.length + 3;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const hasCol = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'fuel' AND table_name = 'fuel_card_overage_policies' AND column_name = 'per_swipe_gallon_limit'`)).rowCount > 0;
  const policiesWithoutLimit = Number((await c.query(
    `SELECT count(*)::int AS n FROM fuel.fuel_card_overage_policies
      WHERE is_active AND per_transaction_limit_cents IS NULL ${hasCol ? "AND per_swipe_gallon_limit IS NULL" : ""}`
  )).rows[0].n);
  const dollarRuleOnGallonRows = (await c.query(
    `SELECT e.id::text FROM fuel.fuel_card_overage_events e
       JOIN fuel.fuel_transactions ft ON ft.id = e.fuel_transaction_id AND ft.operating_company_id = e.operating_company_id
      WHERE e.voided_at IS NULL AND e.overage_rule = 'over_transaction_limit' AND ft.gallons > 0`
  )).rows.map((r) => r.id);
  await c.query("ROLLBACK");
  const bad = judge({ policiesWithoutLimit, dollarRuleOnGallonRows });
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — gallons first; ${policiesWithoutLimit} limitless active policy(ies); ${dollarRuleOnGallonRows.length} dollar-rule event(s) on gallon rows, all named debt (${DEBT.size})${hasCol ? "" : " — migration 202615330700 not yet applied"}`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
