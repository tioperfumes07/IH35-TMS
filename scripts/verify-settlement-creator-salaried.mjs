#!/usr/bin/env node
/**
 * GUARD — Lead 443.36 (owner closed ruling, Rafael Rogelio Rivero Reynoso is SALARIED): a salaried Creator settlement books
 * its loads with the 0-rate "Salaried" override (CC-2 #26276: no per-load driver bill, card untouched), writes no per-load
 * pay line, pays the salary as its own additional-pay line, and a $0 salaried settlement is closed with no journal entry;
 * the feed gate counts those loads and does not demand a driver bill; a no-fuel settlement can confirm it has none.
 * Run: node scripts/verify-settlement-creator-salaried.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-salaried";
const D = "apps/backend/src/driver-finance/";
const F = { seed: D + "settlement-creator-seed-loads.ts", svc: D + "settlement-creator.service.ts", routes: D + "settlement-creator.routes.ts", gate: D + "feed-gate/feed-gate.checks.ts", close: D + "settlement-payrun-close.service.ts" };
export function problems(s) {
  const p = [];
  if (!/draft\.salaried\s*\?\s*\{ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: SALARIED_OVERRIDE_REASON \}/.test(s.seed) || !/SALARIED_OVERRIDE_REASON = "Salaried/.test(s.seed)) p.push("a salaried draft is not booked with the 0-rate Salaried override");
  if (!/if \(!draft\.salaried && payMiles != null && loadedCents != null\) \{/.test(s.svc)) p.push("a salaried load still writes a per-load pay line");
  if (!/if \(postsThroughClose && salariedZero\) \{/.test(s.svc)) p.push("a $0 salaried settlement is sent to the pay run");
  if (!/salaried: z\.boolean\(\)/.test(s.routes) || !/confirmed_zero_fuel_purchases: z\.boolean\(\)/.test(s.routes)) p.push("the route drops salaried / confirmed_zero_fuel_purchases");
  if ((s.gate.match(/driver_pay_rate_override_reason ILIKE 'Salaried%'/g) ?? []).length < 4) p.push("the feed gate does not recognise salaried loads (driver bill / settlement loads / posted_to_ledger)");
  if (!/driver_pay_rate_override_reason ILIKE 'Salaried%'/.test(s.close)) p.push("the close's load-activity check ignores salaried loads");
  return p;
}
const read = () => Object.fromEntries(Object.entries(F).map(([k, r]) => [k, fs.readFileSync(path.join(ROOT, r), "utf8")]));
function selftest() {
  const g = read(); const bad = [];
  if (problems(g).length) bad.push(`real tree flagged: ${problems(g).join("; ")}`);
  const plants = [["seed", (x) => x.replace("draft.salaried\n      ? {", "false\n      ? {")], ["svc", (x) => x.replace("if (!draft.salaried && payMiles != null", "if (payMiles != null")], ["svc", (x) => x.replace("if (postsThroughClose && salariedZero) {", "if (false) {")], ["routes", (x) => x.replace("salaried: z.boolean()", "salariedx: z.boolean()")], ["close", (x) => x.replaceAll("ILIKE 'Salaried%'", "ILIKE 'x%'")]];
  for (const [k, f] of plants) { const pl = f(g[k]); if (pl === g[k]) bad.push(`plant on ${k} did not apply`); else if (!problems({ ...g, [k]: pl }).length) bad.push(`plant on ${k} passed`); }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(read()); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
