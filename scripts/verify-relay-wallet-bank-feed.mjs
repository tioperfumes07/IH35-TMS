#!/usr/bin/env node
/**
 * verify-relay-wallet-bank-feed.mjs
 *
 * GUARD 2026-07-16: Relay fuel purchases must land on the Relay Fuel Wallet bank feed
 * (banking.bank_transactions), with auto-linkage columns set — not only fuel.* tables.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-wallet-bank-feed";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`MISSING ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const service = read("apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts");
const ingest = read("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts");
const backfill = read(
  "apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed-backfill.routes.ts",
);
const index = read("apps/backend/src/index.ts");
const plaid = read("apps/backend/src/integrations/plaid/link.routes.ts");
const pkg = read("package.json");

if (service) {
  if (!/upsertRelayWalletBankFeedRow/.test(service)) {
    failures.push("wallet feed service must export upsertRelayWalletBankFeedRow");
  }
  if (!/categorization_unit_id/.test(service) || !/categorization_driver_id/.test(service)) {
    failures.push("wallet feed must set categorization_unit_id + categorization_driver_id");
  }
  if (!/matched_load_id/.test(service) || !/matched_settlement_id/.test(service)) {
    failures.push("wallet feed must set matched_load_id + matched_settlement_id when resolvable");
  }
  if (!/RELAY_WALLET_SOURCE_REF_PREFIX|relay_fuel:/.test(service)) {
    failures.push("wallet feed must use relay_fuel: source_ref for idempotency");
  }
  if (/journal_entr|postJournal|EXPENSE_GL/.test(service)) {
    failures.push("wallet feed must NOT post GL (visibility only)");
  }
  // Planted regression: coalesce(enum, '') is typed as the enum → 22P02 on '' → zero bank feed rows.
  if (/coalesce\(\s*l\.status\s*,\s*['"]['"]\s*\)/.test(service)) {
    failures.push(
      "resolveLoadForUnitAt must cast status::text BEFORE coalesce(..., '') — bare coalesce(l.status, '') 22P02's",
    );
  }
  if (!/coalesce\(\s*l\.status::text\s*,\s*['"]['"]\s*\)/.test(service)) {
    failures.push("resolveLoadForUnitAt must use coalesce(l.status::text, '') for cancelled filter");
  }
  if (!/SAVEPOINT relay_wallet_feed_row/.test(service)) {
    failures.push("backfill must use per-row SAVEPOINT so one linkage failure cannot abort the company");
  }
  if (!/upsertRelayWalletDepositFeedRow/.test(service) || !/RELAY_DEPOSIT_SOURCE_REF_PREFIX|relay_deposit:/.test(service)) {
    failures.push("wallet feed must mirror deposits as Received (relay_deposit: + is_credit)");
  }
  if (!/is_credit\s*=\s*true/.test(service)) {
    failures.push("deposit feed rows must set is_credit = true for Received column");
  }
}

if (ingest && !/upsertRelayWalletBankFeedRow/.test(ingest)) {
  failures.push("relay-fuel-ingest.service must call upsertRelayWalletBankFeedRow after bridge");
}

const depositClassifier = read(
  "apps/backend/src/integrations/relay-payments/relay-deposit-classifier.service.ts",
);
if (depositClassifier && !/upsertRelayWalletDepositFeedRow/.test(depositClassifier)) {
  failures.push("deposit classifier must call upsertRelayWalletDepositFeedRow after upsert");
}

const csvImport = read("apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.ts");
if (csvImport && !/upsertRelayDeposit/.test(csvImport)) {
  failures.push("CSV import must call upsertRelayDeposit for type=deposit rows (Received path)");
}
if (csvImport && !/rowType === \"deposit\"|rowType === 'deposit'/.test(csvImport)) {
  failures.push("CSV import must branch on type=deposit");
}

const matchService = read("apps/backend/src/accounting/bank-recon/match.service.ts");
if (matchService && !/windowDays|window_days|searchQuery|search_query/.test(matchService)) {
  failures.push("match.service findCandidates must support Search-all window_days + search_query");
}
if (matchService && !/make_interval\(days =>/.test(matchService)) {
  failures.push("match.service must use parameterized make_interval for match date window");
}

const designView = read(
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
);
if (designView) {
  if (!/isRelayWalletAccount/.test(designView) || !/label=\"Driver\"/.test(designView) || !/label=\"Truck\"/.test(designView)) {
    failures.push("BankingTransactionsDesignView must show Driver/Truck/Load columns on Relay wallet");
  }
  if (!/buildRelayFuelBreakdown|Fuel breakdown \(Relay\)/.test(designView)) {
    failures.push("BankingTransactionsDesignView must surface Relay fuel line breakdown");
  }
  if (!/Transfer from account/.test(designView) || !/Transfer to account/.test(designView)) {
    failures.push("Transfer categorize must expose inline From/To account pickers (QBO)");
  }
  if (!/PrintOrientationDialog|printDialogOpen/.test(designView)) {
    failures.push("BankingTransactionsDesignView must ask portrait/landscape before print");
  }
  if (!/Search all|matchSearchAll|inline-match-search-all/.test(designView)) {
    failures.push("BankingTransactionsDesignView match pane must expose Search all (QBO)");
  }
  if (!/This month|Last month|bank-date-filter-button/.test(designView)) {
    failures.push("BankingTransactionsDesignView must expose QBO date presets + dynamic date label");
  }
}

if (backfill && !/wallet-bank-feed\/backfill/.test(backfill)) {
  failures.push("backfill route must expose /api/integrations/relay/wallet-bank-feed/backfill");
}
if (backfill && !/backfillRelayWalletDepositFeedForCompany/.test(backfill)) {
  failures.push("backfill route must also backfill deposit (Received) rows");
}

if (index && !/registerRelayWalletBankFeedBackfillRoute/.test(index)) {
  failures.push("index.ts must register registerRelayWalletBankFeedBackfillRoute");
}

if (plaid && !/categorization_unit_id/.test(plaid)) {
  failures.push("company-transactions must return categorization_unit_id for bank feed UI");
}
if (plaid && !/relay_fuel_lines/.test(plaid)) {
  failures.push("company-transactions must return relay_fuel_lines (diesel/reefer/DEF/fee breakdown)");
}

const breakdownHelper = read(
  "apps/frontend/src/pages/banking/components/relayFuelLineBreakdown.ts",
);
if (breakdownHelper && !/Diesel \(truck\)/.test(breakdownHelper)) {
  failures.push("relayFuelLineBreakdown must distinguish Diesel (truck) vs reefer vs DEF");
}

if (pkg && !/"verify:relay-wallet-bank-feed"/.test(pkg)) {
  failures.push("package.json must wire verify:relay-wallet-bank-feed");
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// Search-all: memo filter must be in SQL before LIMIT (not only post-filter of 500).
const matchSvcFull = read("apps/backend/src/accounting/bank-recon/match.service.ts");
if (!/LIKE \$\d/.test(matchSvcFull) || !/rowLimit|likeParam/.test(matchSvcFull)) {
  fail("match.service must push search LIKE into SQL before LIMIT (likeParam/rowLimit)");
}

console.log(`${LABEL}: OK — Relay wallet bank feed + linkage + QBO breakdown/columns/deposits`);
process.exit(0);
