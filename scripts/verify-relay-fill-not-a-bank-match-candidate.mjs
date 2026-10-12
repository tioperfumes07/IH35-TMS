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

function liveCheck() {
  const errors = [];
  const match = read(MATCH);

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
  if (!match.includes('matched_relay_fuel_transaction_id')) {
    errors.push(`${MATCH} must keep matched_relay_fuel_transaction_id for existing fill pointers`);
  }

  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — relay fills are not bank Match-drawer candidates`);
}

function selftest() {
  const match = read(MATCH);
  if (/if\s*\(\s*wants\(\s*"relay_fuel"\s*\)\s*\)/.test(match)) {
    console.error(`${LABEL} --selftest: live source still lists relay_fuel candidates`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: OK`);
}

const arg = process.argv[2] ?? "";
if (arg === "--selftest") selftest();
else liveCheck();
