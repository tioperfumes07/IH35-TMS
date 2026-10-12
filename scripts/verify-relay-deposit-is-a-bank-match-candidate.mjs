#!/usr/bin/env node
/**
 * ROUND 443.29-B — Relay wallet funding: bank outflow must offer integrations.relay_deposits
 * as a match candidate (charged = wallet + 3.25% fee); accept path stamps matched_relay_deposit_id.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-deposit-is-a-bank-match-candidate";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  math: "apps/backend/src/accounting/bank-recon/relay-deposit-match-math.ts",
  kinds: "apps/backend/src/accounting/bank-recon/match-api-kinds.ts",
  routes: "apps/backend/src/banking/p7-wave2.routes.ts",
  accept: "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts",
  hints: "apps/backend/src/accounting/bank-recon/relay-deposit-categorized-match-hints.service.ts",
  migration: "db/migrations/202615441301_relay_deposit_is_a_bank_match_target.sql",
  pointer: "apps/backend/src/banking/bank-line-match-pointer.ts",
  fe: "apps/frontend/src/api/banking.ts",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
};

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
  const match = read(FILES.match);
  const math = read(FILES.math);
  const kinds = read(FILES.kinds);
  const routes = read(FILES.routes);
  const accept = read(FILES.accept);
  const hints = read(FILES.hints);
  const migration = read(FILES.migration);
  const pointer = read(FILES.pointer);
  const fe = read(FILES.fe);
  const drawer = read(FILES.drawer);

  if (!math.includes("RELAY_DEPOSIT_FEE_BPS = 325")) {
    errors.push(`${FILES.math} must use 325 bps fee`);
  }
  if (!math.includes("5000) / 10000")) {
    errors.push(`${FILES.math} must half-up fee with +5000 / 10000`);
  }
  if (!math.includes("RELAY_DEPOSIT_MATCHABLE_SQL")) {
    errors.push(`${FILES.math} must export RELAY_DEPOSIT_MATCHABLE_SQL (company OR deposit JE)`);
  }
  if (!math.includes("RELAY_DEPOSIT_CHARGED_AMOUNT_SQL = `rd.total_amount_cents`")) {
    errors.push(`${FILES.math} charged amount must be rd.total_amount_cents (never wallet+fee again)`);
  }

  if (!kinds.includes('"relay_deposit"')) {
    errors.push(`${FILES.kinds} must list relay_deposit in accept + filter kinds`);
  }

  if (!match.includes('wants("relay_deposit")')) {
    errors.push(`${FILES.match} must query relay_deposit candidates when kind filter allows`);
  }
  if (!match.includes("integrations.relay_deposits")) {
    errors.push(`${FILES.match} must source relay_deposit from integrations.relay_deposits`);
  }
  if (!match.includes("relay_deposit_wallet_cents")) {
    errors.push(`${FILES.match} must expose wallet/fee split on relay_deposit candidates`);
  }
  if (!match.includes("RELAY_DEPOSIT_MATCHABLE_SQL")) {
    errors.push(`${FILES.match} must use RELAY_DEPOSIT_MATCHABLE_SQL (not classification=company alone)`);
  }
  if (!match.includes("'Relay deposit ' || rd.deposit_id") && !match.includes('"Relay deposit " || rd.deposit_id')) {
    errors.push(`${FILES.match} must label candidates as Relay deposit <txn id>`);
  }
  if (!match.includes("matched_relay_deposit_id")) {
    errors.push(`${FILES.match} must persist matched_relay_deposit_id on accept`);
  }
  if (!match.includes("integrations.relay_deposits") || !match.includes("matched_bank_transaction_id")) {
    errors.push(`${FILES.match} must stamp relay_deposits.matched_bank_transaction_id on accept`);
  }
  if (!hints.includes("RELAY_DEPOSIT_MATCHABLE_SQL")) {
    errors.push(`${FILES.hints} must use RELAY_DEPOSIT_MATCHABLE_SQL (same charged math as Match drawer)`);
  }

  if (!routes.includes("relay-deposit-match-review")) {
    errors.push(`${FILES.routes} must register GET /api/v1/banking/relay-deposit-match-review`);
  }
  if (!routes.includes("bankMatchFilterKindSchema")) {
    errors.push(`${FILES.routes} match-candidates kinds filter must use bankMatchFilterKindSchema`);
  }

  if (!accept.includes("bankMatchAcceptKindSchema")) {
    errors.push(`${FILES.accept} accept-match must use bankMatchAcceptKindSchema (relay_deposit accept)`);
  }

  if (!hints.includes("relay_fuel_wallet")) {
    errors.push(`${FILES.hints} read-only review must scope wallet-categorized outflows`);
  }

  if (!migration.includes("matched_relay_deposit_id")) {
    errors.push(`${FILES.migration} must add banking.bank_transactions.matched_relay_deposit_id`);
  }
  if (!migration.includes("relay_deposit")) {
    errors.push(`${FILES.migration} must allow ledger_entry_kind relay_deposit on reconciliation_matches`);
  }

  if (!pointer.includes("matched_relay_deposit_id")) {
    errors.push(`${FILES.pointer} document pointer list must include matched_relay_deposit_id`);
  }

  if (!fe.includes('"relay_deposit"')) {
    errors.push(`${FILES.fe} BankMatchCandidateKind must include relay_deposit`);
  }
  if (!fe.includes("relay-deposit-match-review")) {
    errors.push(`${FILES.fe} must call relay-deposit-match-review API`);
  }

  if (!drawer.includes("match-relay-deposit-split")) {
    errors.push(`${FILES.drawer} must show wallet/fee split before confirm for relay_deposit`);
  }

  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — relay deposit is a bank match candidate (engine + accept + read-only review)`);
}

function selftest() {
  const match = read(FILES.match);
  const planted = match.replace('wants("relay_deposit")', 'wants("relay_deposit_MISSING")');
  if (planted.includes('wants("relay_deposit")') && !planted.includes('wants("relay_deposit_MISSING")')) {
    console.error(`${LABEL} --selftest: plant did not change source`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: OK`);
}

const arg = process.argv[2] ?? "";
if (arg === "--selftest") selftest();
else liveCheck();
