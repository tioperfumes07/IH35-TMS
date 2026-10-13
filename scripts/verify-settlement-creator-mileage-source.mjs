#!/usr/bin/env node
/**
 * GUARD — CC-2 live finding 2026-10-11 (verify-mileage-g1-g5-live G4 on 5769's loads 13498 / 13508): a Settlement Creator
 * load booked with practical miles carries mileage_source ("Operator entered" — typed from the signed settlement).
 * Run: node scripts/verify-settlement-creator-mileage-source.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-mileage-source";
const FILE = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
export function problems(src) {
  return /mileage_source: \(load\.loaded_miles \?\? load\.line_haul_miles\) != null \? "Operator entered" : undefined,/.test(src)
    ? [] : ["the Creator books practical miles without mileage_source"];
}
function selftest() {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const bad = [];
  if (problems(good).length) bad.push("real tree flagged");
  const planted = good.replace(/\n\s*mileage_source: \(load[^\n]*\n/, "\n");
  if (planted === good || !problems(planted).length) bad.push("dropping mileage_source passed");
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (1 plant caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(fs.readFileSync(path.join(ROOT, FILE), "utf8")); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
