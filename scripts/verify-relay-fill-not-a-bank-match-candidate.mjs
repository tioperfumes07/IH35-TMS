#!/usr/bin/env node
/**
 * ROUND 443.54 — Relay fills are paid from wallet 1295, NOT from the bank.
 * The bank Match drawer must never list relay_fuel as a candidate (accept of an
 * existing matched_relay_fuel_transaction_id pointer still works).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-fill-not-a-bank-match-candidate";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

/** The match engine never offers a Relay fill as a bank Match-drawer candidate; returns every violation. */
export function checks(match) {
  const errors = [];
  if (/if\s*\(\s*wants\(\s*"relay_fuel"\s*\)\s*\)/.test(match)) {
    errors.push(`${MATCH} must not list relay_fuel candidates via wants("relay_fuel") (fills draw from 1295, not bank)`);
  }
  if (/FROM\s+integrations\.relay_fuel_transactions\s+r[\s\S]{0,400}toCandidate\(\s*"relay_fuel"/.test(match)) {
    errors.push(`${MATCH} must not push relay_fuel rows into Match-drawer candidates`);
  }
  if (!match.includes("Relay fills are paid from wallet 1295")) {
    errors.push(`${MATCH} must document ROUND 443.54: fills are not bank match candidates`);
  }
  if (!match.includes('matched_relay_fuel_transaction_id')) {
    errors.push(`${MATCH} must keep matched_relay_fuel_transaction_id for existing fill pointers`);
  }
  return errors;
}

function liveCheck() {
  const errors = checks(read(MATCH));
  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — relay fills are not bank Match-drawer candidates`);
}

if (process.argv.includes("--selftest")) {
  const match = read(MATCH);
  const cases = [
    ["the real match engine passes", checks(match).length === 0],
    ["re-adding wants(\"relay_fuel\") fails", checks(match + '\nif (wants("relay_fuel")) {}').length > 0],
    ["pushing relay_fuel rows as candidates fails", checks(match + '\nFROM integrations.relay_fuel_transactions r WHERE 1=1 toCandidate("relay_fuel"').length > 0],
    ["dropping the existing fill pointer fails", checks(match.split("matched_relay_fuel_transaction_id").join("x")).length > 0],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}
liveCheck();
