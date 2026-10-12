#!/usr/bin/env node
/**
 * ROUND 443.54 — Relay fills are paid from wallet 1295, NOT from the bank.
 * The bank Match drawer must never list relay_fuel as a candidate (accept of an
 * existing matched_relay_fuel_transaction_id pointer still works).
 * --selftest plants each violation into a copy of the real source (no database).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-fill-not-a-bank-match-candidate";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** The rule, pure: the errors for one match.service.ts source text. */
export function matchSourceErrors(match) {
  const errors = [];
  // Candidate listing for fills must be gone (443.54 retired 441.21-B R5 list).
  if (/if\s*\(\s*wants\(\s*"relay_fuel"\s*\)\s*\)/.test(match)) {
    errors.push(`${MATCH} must not list relay_fuel candidates via wants("relay_fuel") (fills draw from 1295, not bank)`);
  }
  if (/FROM\s+integrations\.relay_fuel_transactions\s+r[\s\S]{0,400}toCandidate\(\s*"relay_fuel"/.test(match)) {
    errors.push(`${MATCH} must not push relay_fuel rows into Match-drawer candidates`);
  }
  if (!match.includes("Relay fills are paid from wallet 1295")) {
    errors.push(`${MATCH} must document ROUND 443.54: fills are not bank match candidates`);
  }
  // Accept/unmatch of an existing fill pointer remains (column map + amount lookup).
  if (!match.includes("matched_relay_fuel_transaction_id")) {
    errors.push(`${MATCH} must keep matched_relay_fuel_transaction_id for existing fill pointers`);
  }
  return errors;
}

function liveCheck() {
  const errors = matchSourceErrors(read(MATCH));
  if (errors.length) {
    console.error(`${LABEL} FAILED:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — relay fills are not bank Match-drawer candidates`);
}

function selftest() {
  const real = read(MATCH);
  const cases = [
    ["the real match.service.ts passes", matchSourceErrors(real).length === 0],
    ["a wants(\"relay_fuel\") candidate branch fails", matchSourceErrors(`${real}\nif (wants("relay_fuel")) { /* list fills */ }`).length > 0],
    ["relay_fuel rows pushed into candidates fail", matchSourceErrors(`${real}\nconst q = \`SELECT 1 FROM integrations.relay_fuel_transactions r\`; out.push(toCandidate("relay_fuel", row));`).length > 0],
    ["a source without the 443.54 note fails", matchSourceErrors(real.split("Relay fills are paid from wallet 1295").join("x")).length > 0],
    ["a source without the fill pointer column fails", matchSourceErrors(real.split("matched_relay_fuel_transaction_id").join("x")).length > 0],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else liveCheck();
}
