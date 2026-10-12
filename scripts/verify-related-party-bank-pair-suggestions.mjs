#!/usr/bin/env node
/**
 * ROUND 443.54-7 — related-party bank↔Relay SUGGESTED pairs (5-day same amount).
 * Owner confirms; nothing auto-pairs. Confirm = categorize Due to/from + party_transfer_out
 * document + optional deposit link; loan poster OFF (0 duplicate postings).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-bank-pair-suggestions";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  cardMap: "apps/backend/src/accounting/bank-recon/related-party-card-map.ts",
  suggest: "apps/backend/src/accounting/bank-recon/related-party-pair-suggestions.service.ts",
  confirm: "apps/backend/src/accounting/bank-recon/related-party-pair-confirm.service.ts",
  createEntry: "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts",
  poster: "apps/backend/src/accounting/related-party-loan-posting/poster.service.ts",
  routes: "apps/backend/src/banking/p7-wave2.routes.ts",
  migration: "db/migrations/202615561540_related_party_loan_party_transfer_out.sql",
  feApi: "apps/frontend/src/api/banking.ts",
  fePanel: "apps/frontend/src/pages/banking/components/RelatedPartyPairSuggestionsPanel.tsx",
  feView: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const errors = [];

const cardMap = read(FILES.cardMap);
for (const last4 of ["0210", "6248", "9855", "0275", "1354", "4823", "9708"]) {
  if (!cardMap.includes(`"${last4}"`)) {
    errors.push(`${FILES.cardMap} must map card ${last4}`);
  }
}
if (!cardMap.includes('USMCA_OWN_RELAY_CARD_LAST4 = "0680"')) {
  errors.push(`${FILES.cardMap} must exclude USMCA own card 0680`);
}
if (!cardMap.includes("card_confirmed: false") || !cardMap.includes("0275")) {
  errors.push(`${FILES.cardMap} card 0275 must be card_confirmed=false (suggestion only)`);
}

const suggest = read(FILES.suggest);
if (!suggest.includes("RELATED_PARTY_PAIR_WINDOW_DAYS = 5")) {
  errors.push(`${FILES.suggest} must use 5-day window`);
}
if (!suggest.includes("listRelatedPartyPairSuggestions")) {
  errors.push(`${FILES.suggest} must export listRelatedPartyPairSuggestions`);
}
if (!suggest.includes("pair_status") || !suggest.includes('"unpaired"')) {
  errors.push(`${FILES.suggest} must surface unpaired rows`);
}
if (!suggest.includes("zelle") || !suggest.includes("IDCGR")) {
  errors.push(`${FILES.suggest} must candidate Zelle + IDCGR outflows`);
}

const confirm = read(FILES.confirm);
if (!confirm.includes("confirmRelatedPartyPair")) {
  errors.push(`${FILES.confirm} must export confirmRelatedPartyPair`);
}
if (!confirm.includes("postBankCategorizationOnClient")) {
  errors.push(`${FILES.confirm} must categorize via postBankCategorizationOnClient (one JE)`);
}
if (!confirm.includes("createRelatedPartyLoanEntry")) {
  errors.push(`${FILES.confirm} must create party_transfer_out via createRelatedPartyLoanEntry`);
}
if (!confirm.includes('target_type: "party_transfer_out"') && !confirm.includes("party_transfer_out")) {
  errors.push(`${FILES.confirm} must use target_type party_transfer_out`);
}
if (/postRelatedPartyLoan|RELATED_PARTY_LOAN_GL_POSTING|postingEnabled\(/.test(confirm)) {
  errors.push(`${FILES.confirm} must NOT call the loan poster (0 duplicate postings)`);
}
if (!confirm.includes("matched_relay_deposit_id") || !confirm.includes("matched_bank_transaction_id")) {
  errors.push(`${FILES.confirm} must link bank↔deposit pointers on confirm`);
}
if (!confirm.includes("duplicate_postings: 0")) {
  errors.push(`${FILES.confirm} must report duplicate_postings: 0`);
}
if (!confirm.includes(".posted !== true") && !confirm.includes("posted !== true")) {
  errors.push(`${FILES.confirm} must fail-closed on BankFeedGlResult.posted !== true (not .ok)`);
}

const createEntry = read(FILES.createEntry);
if (!createEntry.includes('"party_transfer_out"') && !createEntry.includes("party_transfer_out")) {
  errors.push(`${FILES.createEntry} TARGET_TYPES must include party_transfer_out`);
}
if (!createEntry.includes("isPartyTransferOut")) {
  errors.push(`${FILES.createEntry} must validate party_transfer_out (direction out + funding_account_id)`);
}

const poster = read(FILES.poster);
if (!poster.includes("fundingAccountId") || !poster.includes("direction === \"out\"")) {
  errors.push(`${FILES.poster} resolveCounterAccount must accept fundingAccountId for out`);
}

const routes = read(FILES.routes);
if (!routes.includes("related-party-pairs")) {
  errors.push(`${FILES.routes} must register GET /api/v1/banking/related-party-pairs`);
}
if (!routes.includes("related-party-pairs/confirm")) {
  errors.push(`${FILES.routes} must register POST /api/v1/banking/related-party-pairs/confirm`);
}
if (!routes.includes("listRelatedPartyPairSuggestions") || !routes.includes("confirmRelatedPartyPair")) {
  errors.push(`${FILES.routes} must wire suggest + confirm services`);
}

const migration = read(FILES.migration);
if (!migration.includes("party_transfer_out")) {
  errors.push(`${FILES.migration} must widen target_type CHECK for party_transfer_out`);
}
if (!migration.includes("related_party_loan_entries_target_type_check")) {
  errors.push(`${FILES.migration} must restate related_party_loan_entries_target_type_check`);
}

const feApi = read(FILES.feApi);
if (!feApi.includes("related-party-pairs") || !feApi.includes("getRelatedPartyPairSuggestions")) {
  errors.push(`${FILES.feApi} must call related-party-pairs API`);
}
if (!feApi.includes("confirmRelatedPartyPair")) {
  errors.push(`${FILES.feApi} must export confirmRelatedPartyPair`);
}

const fePanel = read(FILES.fePanel);
if (!fePanel.includes("data-testid=\"related-party-pair-suggestions\"")) {
  errors.push(`${FILES.fePanel} must expose related-party-pair-suggestions test id`);
}
if (!fePanel.includes("Confirm")) {
  errors.push(`${FILES.fePanel} must offer Confirm (owner-only action)`);
}

const feView = read(FILES.feView);
if (!feView.includes("RelatedPartyPairSuggestionsPanel")) {
  errors.push(`${FILES.feView} must mount RelatedPartyPairSuggestionsPanel`);
}

if (errors.length) fail(errors);
console.log(`${LABEL} OK`);
process.exit(0);
