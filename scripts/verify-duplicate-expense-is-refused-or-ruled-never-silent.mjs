#!/usr/bin/env node
// ROUND 367.2 / 367.8 (CC-2) — a duplicate fuel purchase is REFUSED by name or RULED, never recorded silently.
//
// Static, every writer: each apps/backend file that INSERTs INTO fuel.fuel_transactions either
//   (a) checks the provider transaction ID through apps/backend/src/fuel/fuel-provider-reference.ts before the INSERT, or
//   (b) is named below with the key that makes a second copy impossible.
// A new writer that does neither fails here. Also pins: the hand-entry writers set source_row_hash (NOT NULL since
// 202614220000 — both omitted it), and migration 202615370600 still carries the database refusal.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-duplicate-expense-is-refused-or-ruled-never-silent";
const ROOT = "apps/backend/src";
const HELPER = "fuel-provider-reference";

const KEYED_BY_PROVIDER_ID = {
  // The hash IS the provider reference ("ref:<id>") and ON CONFLICT DO NOTHING: a re-import of the same purchase is
  // the same row, not a second one.
  "apps/backend/src/fuel/fuel-transaction-import.ts": /ref:\$\{fields\.transaction_reference/,
  // sha256("relay:" + Relay transaction_id), ON CONFLICT DO UPDATE: one Relay transaction, one row.
  "apps/backend/src/integrations/relay-payments/relay-fuel-canonical-bridge.ts": /ON CONFLICT \(operating_company_id, source_row_hash\)/,
};
const MUST_SET_HASH = [
  "apps/backend/src/driver-finance/settlement-creator.service.ts",
  "apps/backend/src/fuel/fuel-transactions.routes.ts",
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") walk(p, acc);
    } else if (/\.(ts|mts)$/.test(name) && !/\.test\.ts$/.test(name)) acc.push(p);
  }
  return acc;
}

const fails = [];
const writers = walk(ROOT).filter((f) => /INSERT INTO fuel\.fuel_transactions\b/.test(readFileSync(f, "utf8")));
if (writers.length === 0) fails.push(`found 0 writers of fuel.fuel_transactions under ${ROOT} — the scan is broken, not clean`);

for (const f of writers) {
  const src = readFileSync(f, "utf8");
  if (KEYED_BY_PROVIDER_ID[f]) {
    if (!KEYED_BY_PROVIDER_ID[f].test(src)) fails.push(`${f}: named as keyed by the provider ID, but that key is gone`);
    continue;
  }
  if (!src.includes(HELPER)) {
    fails.push(`${f}: INSERTs a fuel purchase without checking its provider transaction ID (${HELPER}.ts) — a second copy would be recorded silently`);
    continue;
  }
  const insertAt = src.search(/INSERT INTO fuel\.fuel_transactions\b/);
  const checkAt = src.search(/(findLiveFuelByProviderTransactionId|refuseDuplicateProviderTransaction)\(/);
  if (checkAt < 0 || checkAt > insertAt) fails.push(`${f}: the provider-ID check must run BEFORE the INSERT`);
}
for (const f of MUST_SET_HASH) {
  const src = readFileSync(f, "utf8");
  const insert = src.slice(src.search(/INSERT INTO fuel\.fuel_transactions\b/));
  if (!/source_row_hash/.test(insert.slice(0, 1500)) || !/enteredFuelRowHash\(/.test(src)) {
    fails.push(`${f}: INSERT omits source_row_hash (NOT NULL) — every entry fails with 23502`);
  }
}

const mig = readFileSync("db/migrations/202615370600_fuel_purchase_unique_per_provider_transaction.sql", "utf8");
for (const needle of ["fuel_provider_transaction_already_recorded", "BEFORE INSERT OR UPDATE OF transaction_reference, vendor_id, voided_at", "pg_advisory_xact_lock", "'^[0-9]+$'"]) {
  if (!mig.includes(needle)) fails.push(`202615370600: database refusal lost "${needle}"`);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${writers.length} writers of fuel.fuel_transactions; every one refuses or is keyed by the provider transaction ID; the database refuses too (202615370600)`);
