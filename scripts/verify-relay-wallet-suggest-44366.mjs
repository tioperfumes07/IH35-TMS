#!/usr/bin/env node
/**
 * ROUND 443.66-C — Relay Fuel Wallet (+ Dreamline) list suggestions.
 *
 * Pins:
 * 1. POST /banking/transactions/suggest calls suggestRelayWalletLine before findCandidates.
 * 2. Wallet helper exists and keys OUT by txn_* → expense (fee-inclusive) / IN → relay_deposit.
 * 3. Fills stay out of Match-drawer candidates (443.54 law preserved).
 * 4. Dreamline card suggest is wired on the same route.
 * 5. FE type accepts relay_deposit; badge opens Match drawer (never auto-accept).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-wallet-suggest-44366";
const ROUTE = "apps/backend/src/banking/p7-wave2.routes.ts";
const WALLET = "apps/backend/src/accounting/bank-recon/relay-wallet-suggest.service.ts";
const DREAM = "apps/backend/src/accounting/bank-recon/dreamline-card-suggest.service.ts";
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";
const FE_API = "apps/frontend/src/api/banking.ts";
const FE_VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const rd = (rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };

  const route = rd(ROUTE);
  if (!route) problems.push(`missing ${ROUTE}`);
  else {
    if (!/suggestRelayWalletLine/.test(route)) {
      problems.push(`${ROUTE}: must call suggestRelayWalletLine for Relay Fuel Wallet list suggest`);
    }
    if (!/suggestDreamlineCardLine/.test(route)) {
      problems.push(`${ROUTE}: must call suggestDreamlineCardLine for Dreamline list suggest`);
    }
    const routeStart = route.indexOf('"/api/v1/banking/transactions/suggest"');
    if (routeStart < 0) {
      problems.push(`${ROUTE}: POST /api/v1/banking/transactions/suggest missing`);
    } else {
      const next = route.indexOf("\n  app.", routeStart + 10);
      const body = route.slice(routeStart, next > 0 ? next : route.length);
      const walletIdx = body.indexOf("suggestRelayWalletLine");
      const findIdx = body.indexOf("findCandidates");
      if (walletIdx < 0 || findIdx < 0 || walletIdx > findIdx) {
        problems.push(`${ROUTE}: suggestRelayWalletLine must run before findCandidates`);
      }
      if (!/gap_reasons/.test(body)) {
        problems.push(`${ROUTE}: must return gap_reasons for wallet/card lines with no 1:1 document`);
      }
      if (/postSourceTransaction|storeMatch\(/.test(body)) {
        problems.push(`${ROUTE}: suggest route must stay read-only (no post/storeMatch)`);
      }
    }
  }

  const wallet = rd(WALLET);
  if (!wallet) problems.push(`missing ${WALLET}`);
  else {
    if (!/txn_\[A-Za-z0-9\]\+/.test(wallet) && !/txn_/.test(wallet)) {
      problems.push(`${WALLET}: must parse Relay txn_* from bank description`);
    }
    if (!/suggested_ledger_entry_kind:\s*"expense"/.test(wallet)) {
      problems.push(`${WALLET}: OUT path must suggest expense`);
    }
    if (!/suggested_ledger_entry_kind:\s*"relay_deposit"/.test(wallet)) {
      problems.push(`${WALLET}: IN path must suggest relay_deposit`);
    }
    if (!/no_document_card_owner_pending/.test(wallet)) {
      problems.push(`${WALLET}: held deposits must gap as no_document_card_owner_pending`);
    }
    if (!/feeInclusiveExact|fee_cents/.test(wallet)) {
      problems.push(`${WALLET}: must fee-include wallet OUT vs fill expense`);
    }
  }

  const dream = rd(DREAM);
  if (!dream) problems.push(`missing ${DREAM}`);
  else {
    if (!/dreamline/i.test(dream) || !/2510/.test(dream)) {
      problems.push(`${DREAM}: must scope to Dreamline / 2510`);
    }
    if (!/location_city/.test(dream)) {
      problems.push(`${DREAM}: must match by store city`);
    }
  }

  const match = rd(MATCH);
  if (!match) problems.push(`missing ${MATCH}`);
  else {
    if (/if\s*\(\s*wants\(\s*"relay_fuel"\s*\)\s*\)/.test(match)) {
      problems.push(`${MATCH}: must not list relay_fuel candidates (443.54)`);
    }
    // relay_deposit must be under isCredit (wallet funding = MONEY IN).
    const creditBlock = match.slice(
      match.indexOf("if (isCredit)"),
      match.indexOf("if (!isCredit)")
    );
    if (!/wants\(\s*"relay_deposit"\s*\)/.test(creditBlock)) {
      problems.push(`${MATCH}: relay_deposit candidates must be under isCredit (443.66-C)`);
    }
  }

  const feApi = rd(FE_API);
  if (!feApi) problems.push(`missing ${FE_API}`);
  else if (!/relay_deposit/.test(feApi)) {
    problems.push(`${FE_API}: BankTransactionSuggestion kind must include relay_deposit`);
  }

  const feView = rd(FE_VIEW);
  if (!feView) problems.push(`missing ${FE_VIEW}`);
  else {
    if (!/Relay deposit/.test(feView)) {
      problems.push(`${FE_VIEW}: formatSuggestedMatchInline must label relay_deposit`);
    }
  }

  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "relay-wallet-suggest-44366-"));
  try {
    for (const rel of [ROUTE, WALLET, DREAM, MATCH, FE_API, FE_VIEW]) {
      fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), "// planted stub missing 443.66 wiring\n");
    }
    const planted = collectProblems(tmp);
    if (planted.length < 3) {
      fail([`selftest expected planted stub to fail hard, got ${planted.length} problems`]);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${LABEL} --selftest: OK`);
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) fail(problems);
console.log(`${LABEL}: OK — Relay wallet + Dreamline list suggest wired; fills stay non-candidates`);
