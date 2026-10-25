#!/usr/bin/env node
// RC6 443.341: when a bank transaction is matched to a Relay fill, suggestion must come from
// the load's assigned primary driver (not just the relay API's own driver field).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LABEL = 'verify-relay-fill-driver-equals-load-driver';

const src = fs.readFileSync('apps/backend/src/banking/banking-rules.engine.ts', 'utf8');

assert(
  src.includes('applyRelayFillLoadDriverForTransaction'),
  'applyRelayFillLoadDriverForTransaction missing — RC6 not implemented'
);
assert(
  src.includes('matched_relay_fuel_transaction_id'),
  'RC6 must traverse matched_relay_fuel_transaction_id to reach the fuel transaction'
);
assert(
  src.includes('assigned_primary_driver_id'),
  "RC6 must use mdata.loads.assigned_primary_driver_id (the load's canonical driver)"
);
assert(
  src.includes("relay_fill_load_driver"),
  "RC6 must set suggested_source = 'relay_fill_load_driver'"
);
// Must be wired into suggestForBankTransaction
const suggestFn = src.slice(src.indexOf('export async function suggestForBankTransaction'));
assert(
  suggestFn.includes('applyRelayFillLoadDriverForTransaction'),
  'applyRelayFillLoadDriverForTransaction must be called from suggestForBankTransaction — RC6 not wired'
);

console.log(LABEL + ' PASS — RC6 relay fill load-driver suggestion present and wired');
