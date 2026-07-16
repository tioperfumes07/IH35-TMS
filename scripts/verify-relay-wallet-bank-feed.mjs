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
}

if (ingest && !/upsertRelayWalletBankFeedRow/.test(ingest)) {
  failures.push("relay-fuel-ingest.service must call upsertRelayWalletBankFeedRow after bridge");
}

if (backfill && !/wallet-bank-feed\/backfill/.test(backfill)) {
  failures.push("backfill route must expose /api/integrations/relay/wallet-bank-feed/backfill");
}

if (index && !/registerRelayWalletBankFeedBackfillRoute/.test(index)) {
  failures.push("index.ts must register registerRelayWalletBankFeedBackfillRoute");
}

if (plaid && !/categorization_unit_id/.test(plaid)) {
  failures.push("company-transactions must return categorization_unit_id for bank feed UI");
}

if (pkg && !/"verify:relay-wallet-bank-feed"/.test(pkg)) {
  failures.push("package.json must wire verify:relay-wallet-bank-feed");
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Relay wallet bank feed + linkage wired`);
process.exit(0);
