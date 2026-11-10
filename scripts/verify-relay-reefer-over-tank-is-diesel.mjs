#!/usr/bin/env node
/**
 * ACCT-F11107 (Lead ruling 2026-11-10) — a Relay line coded reefer (033 / "Reefer") of MORE than 60 gallons is TRUCK DIESEL
 * (no reefer tank takes it) and is flagged for review; reefer gallons are never inflated (the federal reefer credit).
 *
 * Measured on prod 2026-11-10: 8 of 10 Relay fills posted for DREAMLINE-ticket duplicates carried 033 lines of 58.732-173.839
 * gal whose Dreamline pump receipts say diesel; $4,387.94 posted to 5015 Reefer Diesel.
 *
 * Static (no DB) on apps/backend/src/fuel/relay-product-kind.ts (the ONE classifier every Relay reader uses):
 *   - RELAY_REEFER_MAX_GALLONS = 60;
 *   - relayLineKindSql's FIRST branch is the over-tank predicate -> 'diesel', before the reefer branch;
 *   - relayLineKind (TS twin) tests relayLineReeferOverTank before the reefer signal;
 *   - the Settlement Creator's Relay line read selects volume (else the TS twin cannot apply the bound).
 * --selftest plants each defect.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-reefer-over-tank-is-diesel";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIND = "apps/backend/src/fuel/relay-product-kind.ts";
const CREATOR = "apps/backend/src/driver-finance/settlement-creator.service.ts";

const strip = (s) => String(s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Pure: (classifier source, creator source) -> problems. */
export function evaluate(kindSrc, creatorSrc) {
  const p = [];
  const k = strip(kindSrc);
  if (!/export const RELAY_REEFER_MAX_GALLONS\s*=\s*60\s*;/.test(k)) p.push("RELAY_REEFER_MAX_GALLONS is not exported as 60");
  if (!/export function relayLineReeferOverTankSql[\s\S]*?\$\{reeferSignalSql\(l\)\} AND COALESCE\(\$\{l\}\.volume, 0\) > \$\{RELAY_REEFER_MAX_GALLONS\}/.test(k)) p.push("relayLineReeferOverTankSql does not test the reefer signal AND volume > RELAY_REEFER_MAX_GALLONS");
  const sqlFn = k.slice(k.indexOf("export function relayLineKindSql("));
  const caseBody = sqlFn.slice(0, sqlFn.indexOf("END)"));
  const over = caseBody.indexOf("WHEN ${relayLineReeferOverTankSql(l)} THEN 'diesel'");
  const reefer = caseBody.indexOf("THEN 'reefer'");
  if (over < 0 || reefer < 0 || over > reefer) p.push("relayLineKindSql does not classify an over-tank reefer line as 'diesel' BEFORE the reefer branch");
  const tsFn = k.slice(k.indexOf("export function relayLineKind("));
  const tsOver = tsFn.indexOf("if (relayLineReeferOverTank(line)) return \"diesel\";");
  const tsReefer = tsFn.indexOf("return \"reefer\"");
  if (tsOver < 0 || tsReefer < 0 || tsOver > tsReefer) p.push("relayLineKind does not return 'diesel' for an over-tank reefer line before returning 'reefer'");
  const c = strip(creatorSrc);
  const at = c.indexOf("const { relayLineKind } = await import(\"../fuel/relay-product-kind.js\");");
  const read = at < 0 ? "" : c.slice(Math.max(0, at - 1200), at);
  if (!/SELECT fuel_type, fuel_product_code, fuel_type_description,[\s\S]*?\bvolume\b[\s\S]*?FROM integrations\.relay_fuel_transaction_lines/.test(read)) p.push(`${CREATOR}: the Relay line read before relayLineKind does not select volume`);
  return p;
}

function selftest() {
  const kind = readFileSync(path.join(ROOT, KIND), "utf8");
  const creator = readFileSync(path.join(ROOT, CREATOR), "utf8");
  const cases = [
    ["the real sources pass", kind, creator, 0],
    ["planted: bound raised to 200 fails", kind.replace("RELAY_REEFER_MAX_GALLONS = 60;", "RELAY_REEFER_MAX_GALLONS = 200;"), creator, 1],
    ["planted: over-tank SQL branch removed (origin/main shape) fails", kind.replace("    WHEN ${relayLineReeferOverTankSql(l)} THEN 'diesel'\n", ""), creator, 1],
    ["planted: TS twin checks reefer first fails", kind.replace('  if (relayLineReeferOverTank(line)) return "diesel";\n', ""), creator, 1],
    ["planted: over-tank predicate drops the volume test fails", kind.replace(" AND COALESCE(${l}.volume, 0) > ${RELAY_REEFER_MAX_GALLONS}", ""), creator, 1],
    ["planted: Creator reads lines without volume fails", kind, creator.replace("fee_amount_cents, fee_type, volume\n", "fee_amount_cents, fee_type\n"), 1],
  ];
  let bad = 0;
  for (const [name, k, c, want] of cases) {
    const got = evaluate(k, c).length > 0 ? 1 : 0;
    if (got !== want) bad++;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}`);
  }
  console.log(`${LABEL} --selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = evaluate(readFileSync(path.join(ROOT, KIND), "utf8"), readFileSync(path.join(ROOT, CREATOR), "utf8"));
  if (problems.length) { console.error(`${LABEL}: FAIL`); for (const x of problems) console.error(`  - ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — a reefer-coded Relay line over 60 gal is truck diesel (flagged); reefer is never inflated`);
}
