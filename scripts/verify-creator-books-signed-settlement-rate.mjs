#!/usr/bin/env node
/**
 * GUARD — ROUND 443.31: a Settlement Creator load pays what the signed settlement paid. When today's rate card would pay
 * differently, the seeder books through the EXISTING GO-21 B5 reason-carrying override (driver_pay_rate_per_mile +
 * driver_pay_rate_override_reason >= 10 chars, audited by bookLoad); the rate card is never written; no override when the
 * card already pays the signed rate.
 * Run: node scripts/verify-creator-books-signed-settlement-rate.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-creator-books-signed-settlement-rate";
const F = {
  helper: "apps/backend/src/driver-finance/settlement-creator-signed-rate.ts",
  seed: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-signed-rate.test.ts",
};

export function problems(src) {
  const p = [];
  if (!/driver_pay_rate_override_reason: `Signed settlement \$\{no\}: driver paid \$\$\{rateDollars\.toFixed\(2\)\}\/mi`/.test(src.helper)) p.push("override reason is not 'Signed settlement <no>: driver paid $<rate>/mi'");
  if (!/if \(cardPaysSigned\) return null;/.test(src.helper)) p.push("an override is written even when the card already pays the signed rate");
  if (!/if \(!Number\.isFinite\(signed\) \|\| signed <= 0\) return null;/.test(src.helper)) p.push("a missing signed rate is not left alone");
  if (/INSERT INTO driver_finance\.driver_pay_rates|UPDATE driver_finance\.driver_pay_rates/i.test(src.seed + src.helper)) p.push("the Creator writes the rate card");
  if (!/const payOverride = signedRateOverride\(draft\.settlement_no, load, card\);/.test(src.seed)) p.push("the seeder does not compute the signed-rate override");
  if (!/\.\.\.\(payOverride \?\? \{\}\),/.test(src.seed)) p.push("the seeder does not pass the override into bookLoad");
  if (!/Signed settlement 5769: driver paid \$0\.45\/mi/.test(src.test) || !/toBeNull\(\)/.test(src.test)) p.push("unit test for the 5769 override / no-override case is missing");
  return p;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

function selftest() {
  const good = read();
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    ["helper", (s) => s.replace("if (cardPaysSigned) return null;", "")],
    ["helper", (s) => s.replace("Signed settlement ${no}: driver paid", "override")],
    ["seed", (s) => s.replace("...(payOverride ?? {}),", "")],
    ["seed", (s) => s + "\nconst x = `UPDATE driver_finance.driver_pay_rates SET rate_per_mile_cents = 45`;"],
    ["test", () => ""],
  ];
  for (const [k, f] of plants) {
    const planted = f(good[k]);
    if (planted === good[k]) bad.push(`plant on ${k} did not apply`);
    else if (!problems({ ...good, [k]: planted }).length) bad.push(`plant on ${k} passed`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(read());
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
