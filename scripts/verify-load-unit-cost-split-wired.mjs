#!/usr/bin/env node
/**
 * verify-load-unit-cost-split-wired.mjs
 *
 * SET-28 (owner defect register 2026-09-03 / assignment 2026-09-07: "vehicle-swap mid-trip cost
 * split by miles each truck ran; 0 hits in code"). LAW §3 attribution rung 3 = allocate by miles.
 *
 * Locks the full vertical slice so it cannot silently regress:
 *   1. the PURE split math (largest-remainder, exact-cent reconciliation, single-truck = 100%);
 *   2. the assembling backend route GET /api/v1/accounting/loads/:loadId/unit-cost-split, which
 *      reads the running units from dispatch.load_assignment_history, per-unit miles from
 *      telematics.load_odometer_segments (else time-window fallback), the expenses+bills cost pool,
 *      and calls the math — and asserts reconciliation on the way out;
 *   3. the frontend LoadUnitCostSplitPanel mounted on the load Costs tab.
 *
 * node scripts/verify-load-unit-cost-split-wired.mjs
 * node scripts/verify-load-unit-cost-split-wired.mjs --selftest
 */
import { readFileSync } from "node:fs";

const mathPath = "apps/backend/src/accounting/load-unit-cost-split.math.ts";
const routePath = "apps/backend/src/accounting/load-unit-cost-split.routes.ts";
const panelPath = "apps/frontend/src/components/dispatch/LoadUnitCostSplitPanel.tsx";
const tabPath = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
const apiPath = "apps/frontend/src/api/accounting.ts";

const source = {
  math: readFileSync(mathPath, "utf8"),
  route: readFileSync(routePath, "utf8"),
  panel: readFileSync(panelPath, "utf8"),
  tab: readFileSync(tabPath, "utf8"),
  api: readFileSync(apiPath, "utf8"),
};

export function collectFailures(src = source) {
  const failures = [];

  // --- 1. The pure split math: the money invariant must be visibly present ---
  if (!/export function splitCostByMiles\(poolCents: number, units: UnitMiles\[\]\): UnitCostShare\[\]/.test(src.math)) {
    failures.push(`${mathPath}: splitCostByMiles(poolCents, units) signature changed`);
  }
  // largest-remainder apportionment: floor then distribute the leftover pennies.
  if (!/Math\.floor/.test(src.math) || !/remainder/.test(src.math)) {
    failures.push(`${mathPath}: no largest-remainder apportionment (Math.floor + remainder) — cents will not reconcile`);
  }
  // exact reconciliation helper, keyed off the same pool coercion.
  if (!/export function sharesReconcile\(/.test(src.math) || !/return sum === pool/.test(src.math)) {
    failures.push(`${mathPath}: sharesReconcile no longer asserts sum === pool`);
  }
  // equal-split fallback so a no-miles case still reconciles.
  if (!/totalMiles > 0 \? .* : units\.map\(\(\) => 1 \/ n\)/.test(src.math)) {
    failures.push(`${mathPath}: lost the equal-split fallback when no truck has miles`);
  }

  // --- 2. The backend route: reads the real inputs, calls the math, asserts reconciliation ---
  if (!/"\/api\/v1\/accounting\/loads\/:loadId\/unit-cost-split",/.test(src.route)) {
    failures.push(`${routePath}: the unit-cost-split endpoint is no longer registered (app.get path)`);
  }
  if (!/export default fp\(/.test(src.route)) {
    failures.push(`${routePath}: no default fastify-plugin export — autoload will not mount it`);
  }
  if (!/dispatch\.load_assignment_history/.test(src.route)) {
    failures.push(`${routePath}: no longer reads the vehicle-swap timeline (dispatch.load_assignment_history)`);
  }
  if (!/telematics\.load_odometer_segments/.test(src.route)) {
    failures.push(`${routePath}: no longer reads per-unit real miles (telematics.load_odometer_segments)`);
  }
  if (!/splitCostByMiles\(/.test(src.route)) {
    failures.push(`${routePath}: no longer calls splitCostByMiles — the split is not computed by the pure math`);
  }
  if (!/sharesReconcile\(pool, shares\)/.test(src.route)) {
    failures.push(`${routePath}: the response no longer reports reconciled = sharesReconcile(pool, shares)`);
  }
  // The pool is expenses + bills (NOT driver pay — pay follows the driver, never split by truck).
  if (!/accounting\.expenses/.test(src.route) || !/accounting\.bill_lines/.test(src.route)) {
    failures.push(`${routePath}: the cost pool is no longer expenses + bills`);
  }
  if (/driver_bills/.test(src.route)) {
    failures.push(`${routePath}: driver pay (driver_bills) must NOT be in the truck-split pool — pay follows the driver`);
  }

  // --- 3. The frontend panel, mounted on the Costs tab ---
  if (!/export function LoadUnitCostSplitPanel/.test(src.panel)) {
    failures.push(`${panelPath}: no longer exports LoadUnitCostSplitPanel`);
  }
  if (!/getLoadUnitCostSplit\(/.test(src.panel)) {
    failures.push(`${panelPath}: panel no longer calls getLoadUnitCostSplit`);
  }
  if (!/data-testid="load-unit-cost-split"/.test(src.panel)) {
    failures.push(`${panelPath}: the split section testid is gone`);
  }
  if (!/is_multi_unit/.test(src.panel) || !/data\.reconciled/.test(src.panel)) {
    failures.push(`${panelPath}: panel no longer distinguishes multi-unit or surfaces the reconciled flag`);
  }
  if (!/import \{ LoadUnitCostSplitPanel \} from "\.\/LoadUnitCostSplitPanel"/.test(src.tab)) {
    failures.push(`${tabPath}: LoadDetailCostsTab no longer imports the split panel`);
  }
  if (!/<LoadUnitCostSplitPanel[\s\S]{0,120}?loadId=\{load\.id\}[\s\S]{0,120}?operatingCompanyId=\{opco\}/.test(src.tab)) {
    failures.push(`${tabPath}: LoadUnitCostSplitPanel is not mounted with loadId + operatingCompanyId`);
  }
  if (!/export function getLoadUnitCostSplit\(/.test(src.api)) {
    failures.push(`${apiPath}: getLoadUnitCostSplit API client is gone`);
  }
  if (!/loads\/\$\{encodeURIComponent\(loadId\)\}\/unit-cost-split/.test(src.api)) {
    failures.push(`${apiPath}: getLoadUnitCostSplit no longer targets the unit-cost-split endpoint`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-load-unit-cost-split-wired SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const mutations = [
    ["math signature", "math", /export function splitCostByMiles\(poolCents: number, units: UnitMiles\[\]\): UnitCostShare\[\]/, "export function splitCostByMiles(x: number)"],
    ["largest-remainder", "math", /Math\.floor/g, "Math.round"],
    ["reconcile helper", "math", /return sum === pool/, "return sum === 0"],
    ["equal fallback", "math", /totalMiles > 0 \? miles\.map\(\(m\) => m \/ totalMiles\) : units\.map\(\(\) => 1 \/ n\)/, "miles.map((m) => m / totalMiles)"],
    ["endpoint path", "route", /"\/api\/v1\/accounting\/loads\/:loadId\/unit-cost-split",/, '"/api/v1/accounting/loads/:loadId/x",'],
    ["fp export", "route", /export default fp\(/, "const notExported = (("],
    ["swap timeline", "route", /dispatch\.load_assignment_history/g, "dispatch.nope"],
    ["real miles", "route", /telematics\.load_odometer_segments/g, "telematics.nope"],
    ["calls math", "route", /splitCostByMiles\(/g, "notTheMath("],
    ["reconcile out", "route", /sharesReconcile\(pool, shares\)/, "true"],
    ["no driver pay", "route", /const pool = numOr0\(load\.pool_cents\);/, "const pool = numOr0(load.pool_cents); // driver_bills"],
    ["panel export", "panel", /export function LoadUnitCostSplitPanel/, "function LoadUnitCostSplitPanel"],
    ["panel calls api", "panel", /getLoadUnitCostSplit\(/g, "getNope("],
    ["panel testid", "panel", /data-testid="load-unit-cost-split"/, 'data-testid="x"'],
    ["tab import", "tab", /import \{ LoadUnitCostSplitPanel \} from "\.\/LoadUnitCostSplitPanel";\n/, ""],
    ["tab mount", "tab", /<LoadUnitCostSplitPanel loadId=\{load\.id\} operatingCompanyId=\{opco\} currency=\{currency\} \/>/, "<div />"],
    ["api client", "api", /export function getLoadUnitCostSplit\(/, "function getLoadUnitCostSplit("],
    ["api endpoint", "api", /unit-cost-split/g, "unit-cost-x"],
  ];
  const escaped = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const planted = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (planted[key] === source[key] || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-load-unit-cost-split-wired SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-load-unit-cost-split-wired SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-load-unit-cost-split-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-load-unit-cost-split-wired: OK — vehicle-swap cost split is miles-weighted, exact-cent reconciling, reads the swap timeline + per-unit miles + expenses/bills pool, and renders on the load Costs tab"
);
