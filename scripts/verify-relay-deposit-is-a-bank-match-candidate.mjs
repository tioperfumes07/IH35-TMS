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

/** Every check, over in-memory sources keyed like FILES — so --selftest can plant regressions. */
export function findErrors(src) {
  const errors = [];
  const match = src.match;
  const math = src.math;
  const kinds = src.kinds;
  const routes = src.routes;
  const accept = src.accept;
  const hints = src.hints;
  const migration = src.migration;
  const pointer = src.pointer;
  const fe = src.fe;
  const drawer = src.drawer;

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

  return errors;
}

function liveCheck() {
  const errors = findErrors(Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)])));
  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — relay deposit is a bank match candidate (engine + accept + read-only review)`);
}

function selftest() {
  const sources = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const planted = [
    ["relay_deposit kind dropped from the match query", { match: sources.match.replaceAll('wants("relay_deposit")', 'wants("relay_deposit_MISSING")') }],
    ["fee changed to 300 bps", { math: sources.math.replace("RELAY_DEPOSIT_FEE_BPS = 325", "RELAY_DEPOSIT_FEE_BPS = 300") }],
    ["charged amount back to wallet+fee", { math: sources.math.replace("RELAY_DEPOSIT_CHARGED_AMOUNT_SQL = `rd.total_amount_cents`", "RELAY_DEPOSIT_CHARGED_AMOUNT_SQL = `rd.wallet_cents + rd.fee_cents`") }],
    ["accept no longer stamps the pointer", { match: sources.match.replaceAll("matched_relay_deposit_id", "matched_other_id") }],
    ["accept kinds lose relay_deposit", { kinds: sources.kinds.replaceAll('"relay_deposit"', '"relay_other"') }],
    ["drawer hides the wallet/fee split", { drawer: sources.drawer.replaceAll("match-relay-deposit-split", "match-split") }],
  ];
  let caught = 0;
  for (const [name, patch] of planted) {
    if (findErrors({ ...sources, ...patch }).length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  }
  const clean = findErrors(sources);
  if (clean.length) console.error(`${LABEL} SELFTEST: clean sources flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else liveCheck();
