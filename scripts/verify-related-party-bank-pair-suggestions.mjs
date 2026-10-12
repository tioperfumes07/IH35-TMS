#!/usr/bin/env node
/**
 * ROUND 443.54-7 — related-party bank↔Relay SUGGESTED pairs (5-day same amount).
 * Owner confirms; nothing auto-pairs. Confirm = categorize Due to/from + party_transfer_out
 * document + optional deposit link; loan poster OFF (0 duplicate postings).
 *
 * 443.99: also owns the Required leaf banking.panel.related_party_pair_suggestions (the inventory had no leaf for this
 * panel): connectivity (panel -> getRelatedPartyPairSuggestions / confirmRelatedPartyPair -> GET related-party-pairs /
 * POST related-party-pairs/confirm -> the two services) and reverse_link (the amount drills back to its bank line;
 * a confirmed pair links to the loan it created).
 */
/** @matrix-built {"modules":["banking"],"cols":["connectivity","reverse_link"],"leaves":["banking.panel.related_party_pair_suggestions"],"task":"443.99-RELATED-PARTY-PAIR-PANEL-LEAF"} */
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

/** Every check, over in-memory sources keyed like FILES — so --selftest can plant regressions. */
export function findErrors(src) {
  const errors = [];

  const cardMap = src.cardMap;
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

  const suggest = src.suggest;
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

  const confirm = src.confirm;
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

  const createEntry = src.createEntry;
  if (!createEntry.includes('"party_transfer_out"') && !createEntry.includes("party_transfer_out")) {
    errors.push(`${FILES.createEntry} TARGET_TYPES must include party_transfer_out`);
  }
  if (!createEntry.includes("isPartyTransferOut")) {
    errors.push(`${FILES.createEntry} must validate party_transfer_out (direction out + funding_account_id)`);
  }

  const poster = src.poster;
  if (!poster.includes("fundingAccountId") || !poster.includes("direction === \"out\"")) {
    errors.push(`${FILES.poster} resolveCounterAccount must accept fundingAccountId for out`);
  }

  const routes = src.routes;
  if (!routes.includes("related-party-pairs")) {
    errors.push(`${FILES.routes} must register GET /api/v1/banking/related-party-pairs`);
  }
  if (!routes.includes("related-party-pairs/confirm")) {
    errors.push(`${FILES.routes} must register POST /api/v1/banking/related-party-pairs/confirm`);
  }
  if (!routes.includes("listRelatedPartyPairSuggestions") || !routes.includes("confirmRelatedPartyPair")) {
    errors.push(`${FILES.routes} must wire suggest + confirm services`);
  }

  const migration = src.migration;
  if (!migration.includes("party_transfer_out")) {
    errors.push(`${FILES.migration} must widen target_type CHECK for party_transfer_out`);
  }
  if (!migration.includes("related_party_loan_entries_target_type_check")) {
    errors.push(`${FILES.migration} must restate related_party_loan_entries_target_type_check`);
  }

  const feApi = src.feApi;
  if (!feApi.includes("related-party-pairs") || !feApi.includes("getRelatedPartyPairSuggestions")) {
    errors.push(`${FILES.feApi} must call related-party-pairs API`);
  }
  if (!feApi.includes("confirmRelatedPartyPair")) {
    errors.push(`${FILES.feApi} must export confirmRelatedPartyPair`);
  }

  const fePanel = src.fePanel;
  if (!fePanel.includes("data-testid=\"related-party-pair-suggestions\"")) {
    errors.push(`${FILES.fePanel} must expose related-party-pair-suggestions test id`);
  }
  if (!fePanel.includes("Confirm")) {
    errors.push(`${FILES.fePanel} must offer Confirm (owner-only action)`);
  }

  const feView = src.feView;
  if (!feView.includes("RelatedPartyPairSuggestionsPanel")) {
    errors.push(`${FILES.feView} must mount RelatedPartyPairSuggestionsPanel`);
  }
  // Leaf banking.panel.related_party_pair_suggestions — connectivity + reverse_link.
  if (!/queryFn: \(\) => getRelatedPartyPairSuggestions\(companyId, \d+\)/.test(fePanel)) {
    errors.push(`${FILES.fePanel} must read getRelatedPartyPairSuggestions (connectivity)`);
  }
  if (!/mutationFn: \(row: RelatedPartyPairSuggestionRow\) =>\s*confirmRelatedPartyPair\(/.test(fePanel)) {
    errors.push(`${FILES.fePanel} Confirm must call confirmRelatedPartyPair (connectivity)`);
  }
  if (!/"\/api\/v1\/banking\/related-party-pairs"[\s\S]{0,600}listRelatedPartyPairSuggestions\(/.test(routes) ||
      !/"\/api\/v1\/banking\/related-party-pairs\/confirm"[\s\S]{0,900}confirmRelatedPartyPair\(/.test(routes)) {
    errors.push(`${FILES.routes} related-party-pairs GET/confirm must be served by their services`);
  }
  if (!/<RelatedPartyPairSuggestionsPanel companyId=\{companyId\} \/>/.test(feView)) {
    errors.push(`${FILES.feView} must mount <RelatedPartyPairSuggestionsPanel companyId={companyId} />`);
  }
  const cells = fePanel.match(/<MoneyCell[\s\S]*?\/>/g) ?? [];
  if (cells.length === 0 || cells.some((c) => !/drill=\{\{ entity: \{ kind: "bank_transaction", id: r\.bank_transaction_id \} \}\}/.test(c))) {
    errors.push(`${FILES.fePanel} every money cell must drill back to its bank line (reverse_link)`);
  }
  if (!/to=\{`\/accounting\/loans-advances\?loan_id=\$\{confirmMut\.data\.related_party_loan_id\}`\}/.test(fePanel)) {
    errors.push(`${FILES.fePanel} a confirmed pair must link to the loan it created (reverse_link)`);
  }
  return errors;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--selftest")) {
  const planted = [
    ["card 9708 unmapped", { cardMap: sources.cardMap.replaceAll('"9708"', '"0000"') }],
    ["own card 0680 no longer excluded", { cardMap: sources.cardMap.replace('USMCA_OWN_RELAY_CARD_LAST4 = "0680"', 'USMCA_OWN_RELAY_CARD_LAST4 = ""') }],
    ["window widened to 10 days", { suggest: sources.suggest.replace("RELATED_PARTY_PAIR_WINDOW_DAYS = 5", "RELATED_PARTY_PAIR_WINDOW_DAYS = 10") }],
    ["confirm calls the loan poster (duplicate posting)", { confirm: sources.confirm + "\nawait postRelatedPartyLoan(client, entry);\n" }],
    ["confirm trusts .ok instead of .posted", { confirm: sources.confirm.replaceAll("posted !== true", "ok !== true") }],
    ["confirm route unregistered", { routes: sources.routes.replaceAll("related-party-pairs/confirm", "related-party-pairs/x") }],
    ["panel unmounted", { feView: sources.feView.replaceAll("RelatedPartyPairSuggestionsPanel", "Nothing") }],
    ["panel reads a stub instead of the API", { fePanel: sources.fePanel.replace(/queryFn: \(\) => getRelatedPartyPairSuggestions\(companyId, \d+\)/, "queryFn: async () => ({ rows: [], total: 0 })") }],
    ["Confirm no longer calls the confirm API", { fePanel: sources.fePanel.replace(/mutationFn: \(row: RelatedPartyPairSuggestionRow\) =>\s*confirmRelatedPartyPair\(/, "mutationFn: (row: RelatedPartyPairSuggestionRow) => Promise.resolve(") }],
    ["amount loses its bank-line drill", { fePanel: sources.fePanel.replace(/(cents=\{r\.amount_cents\}\s*)drill=\{\{ entity: \{ kind: "bank_transaction", id: r\.bank_transaction_id \} \}\}/, "$1") }],
    ["confirmed pair no longer links to its loan", { fePanel: sources.fePanel.replace("/accounting/loans-advances?loan_id=", "/accounting/loans-advances?x=") }],
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

const errors = findErrors(sources);
if (errors.length) fail(errors);
console.log(`${LABEL} OK`);
process.exit(0);
