#!/usr/bin/env node
/**
 * GUARD — Lead 443.36 (owner closed ruling, Rafael Rogelio Rivero Reynoso is SALARIED): a salaried Creator settlement books
 * its loads with the 0-rate "Salaried" override (CC-2 #26276: no per-load driver bill, card untouched), writes no per-load
 * pay line, pays the salary as its own additional-pay line, and a $0 salaried settlement is closed with no journal entry;
 * the feed gate counts those loads and does not demand a driver bill; a no-fuel settlement can confirm it has none;
 * and the delivery-path load re-read carries the override reason with the rate (5780).
 * Run: node scripts/verify-settlement-creator-salaried.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-salaried";
const D = "apps/backend/src/driver-finance/";
// Lead 443.53 #7: weekly salary = LOCAL driver. The marker is now "Local driver — weekly salary"; loads booked before the
// rename keep their "Salaried…" reason (history), so every reader matches both prefixes.
const MARK = "driver_pay_rate_override_reason ~* '^(salaried|local driver — weekly salary)'";
const F = { seed: D + "settlement-creator-seed-loads.ts", svc: D + "settlement-creator.service.ts", routes: D + "settlement-creator.routes.ts", gate: D + "feed-gate/feed-gate.checks.ts", close: D + "settlement-payrun-close.service.ts", book: "apps/backend/src/dispatch/book-load.service.ts" };
export function problems(s) {
  const p = [];
  if (!/draft\.salaried\s*\?\s*\{ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: SALARIED_OVERRIDE_REASON \}/.test(s.seed) || !/SALARIED_OVERRIDE_REASON = "Local driver — weekly salary/.test(s.seed)) p.push("a salaried draft is not booked with the 0-rate 'Local driver — weekly salary' override");
  if (!/if \(!draft\.salaried && payMiles != null && loadedCents != null\) \{/.test(s.svc)) p.push("a salaried load still writes a per-load pay line");
  if (!/if \(postsThroughClose && salariedZero\) \{/.test(s.svc)) p.push("a $0 salaried settlement is sent to the pay run");
  if (!/salaried: z\.boolean\(\)/.test(s.routes) || !/confirmed_zero_fuel_purchases: z\.boolean\(\)/.test(s.routes)) p.push("the route drops salaried / confirmed_zero_fuel_purchases");
  if (s.gate.split(MARK).length - 1 < 4) p.push("the feed gate does not recognise salaried loads (driver bill / settlement loads / posted_to_ledger)");
  if (!s.close.includes(MARK)) p.push("the close's load-activity check ignores salaried loads");
  // 5780 (2026-10-11): the delivery-path re-read must carry the override REASON with the rate, or isSalariedZeroRateOverride()
  // reads a salaried 0 as "no override" and the card mints a per-load bill.
  const reread = s.book.match(/SELECT id, operating_company_id, load_number, customer_id, status,[\s\S]*?FROM mdata\.loads/);
  if (!reread || !/driver_pay_rate_per_mile/.test(reread[0]) || !/driver_pay_rate_override_reason/.test(reread[0])) p.push("the delivery-path load re-read drops driver_pay_rate_override_reason (a salaried load gets a per-load bill)");
  return p;
}
const read = () => Object.fromEntries(Object.entries(F).map(([k, r]) => [k, fs.readFileSync(path.join(ROOT, r), "utf8")]));
function selftest() {
  const g = read(); const bad = [];
  if (problems(g).length) bad.push(`real tree flagged: ${problems(g).join("; ")}`);
  const plants = [["seed", (x) => x.replace("draft.salaried\n      ? {", "false\n      ? {")], ["svc", (x) => x.replace("if (!draft.salaried && payMiles != null", "if (payMiles != null")], ["svc", (x) => x.replace("if (postsThroughClose && salariedZero) {", "if (false) {")], ["routes", (x) => x.replace("salaried: z.boolean()", "salariedx: z.boolean()")], ["close", (x) => x.replaceAll("~* '^(salaried|local driver — weekly salary)'", "ILIKE 'x%'")], ["book", (x) => x.replace("driver_pay_rate_override_reason, miles_deadhead", "miles_deadhead")]];
  for (const [k, f] of plants) { const pl = f(g[k]); if (pl === g[k]) bad.push(`plant on ${k} did not apply`); else if (!problems({ ...g, [k]: pl }).length) bad.push(`plant on ${k} passed`); }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(read()); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
