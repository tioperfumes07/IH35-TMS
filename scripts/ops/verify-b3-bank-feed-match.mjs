#!/usr/bin/env node
/**
 * B-3 BANK TRANSACTIONS (feed) + MATCH — ORDERS-2026-10-01-BANKING-REGISTER-SET §16–§21.
 * Asserts Home connection-error strip, MatchDrawer "Find other matches" + arithmetic box,
 * and the four QBO expand radios (Categorize · Match · Record as transfer · Record as CC payment).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-b3-bank-feed-match";

const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const STRIP = "apps/frontend/src/pages/banking/components/BankingHomeConnectionErrorStrip.tsx";
const MATCH = "apps/frontend/src/pages/banking/components/MatchDrawer.tsx";
const FEED = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const TOKENS = "apps/frontend/src/design/qbo-parity.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function main() {
  const home = read(HOME);
  const strip = read(STRIP);
  const match = read(MATCH);
  const feed = read(FEED);
  const tokens = read(TOKENS);

  assertIncludes(home, "BankingHomeConnectionErrorStrip", HOME);
  assertIncludes(strip, 'data-b3-connection-error-strip="1"', STRIP);
  assertIncludes(strip, "Fix now", STRIP);
  assertIncludes(strip, "Disconnect", STRIP);
  assertIncludes(strip, "Send request", STRIP);
  assertIncludes(strip, "needs_reauth", STRIP);
  assertIncludes(strip, "keep your existing transactions", STRIP);

  assertIncludes(match, 'title="Find other matches"', MATCH);
  assertIncludes(match, 'data-b3-find-other-matches="1"', MATCH);
  assertIncludes(match, 'data-b3-match-arithmetic="1"', MATCH);
  assertIncludes(match, "Bank transaction amount:", MATCH);
  assertIncludes(match, "Selected amount:", MATCH);
  assertIncludes(match, "Difference:", MATCH);
  assertIncludes(match, "text-red-700", MATCH);
  // B-3 §19 — Find Other Matches default date range is bank date ±90 days (ORDERS 2026-10-01).
  assertIncludes(match, "matchWindowPlusMinus90", MATCH);
  assertIncludes(match, "bankTransactionDate", MATCH);
  assertIncludes(match, "±90 days", MATCH);
  assertIncludes(match, "Reset to ±90 days", MATCH);
  // B-3 §19c — If needed, resolve the difference (bank_transaction_splits mini-grid).
  assertIncludes(match, 'data-b3-resolve-difference="1"', MATCH);
  assertIncludes(match, "If needed, resolve the difference", MATCH);
  assertIncludes(match, 'data-testid="match-resolve-difference-grid"', MATCH);
  assertIncludes(match, "saveBankTransactionSplitDraft", MATCH);
  assertIncludes(match, "commitBankTransactionSplit", MATCH);
  assertIncludes(match, "Resolved amount:", MATCH);
  // B-3 §19 — Suggested + Record type chips (QBO Find Other Matches).
  assertIncludes(match, 'data-b3-suggested-record-type-chips="1"', MATCH);
  assertIncludes(match, 'data-testid="match-chip-suggested"', MATCH);
  assertIncludes(match, 'data-testid="match-chip-record-all"', MATCH);
  assertIncludes(match, "match-chip-record-${chip.kind}", MATCH);
  assertIncludes(match, "RECORD_TYPE_CHIPS", MATCH);
  assertIncludes(match, "suggestedOnly", MATCH);
  assertIncludes(match, "kinds: recordKind ? [recordKind] : undefined", MATCH);

  assertIncludes(feed, "bankTransactionDate=", FEED);
  // BANK-F91058 — ORDERS §18 GEAR Groups · Turn off grouping (same turnOffGrouping as toolbar).
  assertIncludes(feed, 'data-testid="banking-gear-groups"', FEED);
  assertIncludes(feed, "Turn off grouping", FEED);
  assertIncludes(feed, "turnOffGrouping: checked", FEED);
  // B-3 §19 — Categorized tab ADDED OR MATCHED provenance + RULE + Undo (Undo already wired).
  assertIncludes(feed, "categorizedProvenanceText", FEED);
  assertIncludes(feed, 'data-b3-categorized-provenance="1"', FEED);
  assertIncludes(feed, "Added to:", FEED);
  assertIncludes(feed, "Matched to:", FEED);
  assertIncludes(feed, "Matched to: multiple transactions", FEED);
  assertIncludes(feed, "categorizedRuleLabel", FEED);
  assertIncludes(feed, "isUndoEligible", FEED);

  assertIncludes(feed, 'data-b3-expand-modes="1"', FEED);
  assertIncludes(feed, "banking-expand-mode-${modeId}", FEED);
  assertIncludes(feed, '["categorize", QBO_BANKING_ACTIONS.categorize]', FEED);
  assertIncludes(feed, '["match", QBO_BANKING_ACTIONS.match]', FEED);
  assertIncludes(feed, '["transfer", QBO_BANKING_ACTIONS.recordAsTransfer]', FEED);
  assertIncludes(feed, '["cc_payment", QBO_BANKING_ACTIONS.recordCcPayment]', FEED);
  assertIncludes(feed, "QBO_BANKING_ACTIONS.findOtherMatches", FEED);
  assertIncludes(feed, "1 match found", FEED);
  assertIncludes(feed, 'mode: "match" | "categorize" | "transfer" | "cc_payment"', FEED);

  assertIncludes(tokens, 'categorize: "Categorize"', TOKENS);
  assertIncludes(tokens, 'recordTransfer: "Record transfer"', TOKENS);
  assertIncludes(tokens, 'recordAsTransfer: "Record as transfer"', TOKENS);
  assertIncludes(tokens, 'recordCcPayment: "Record as credit card payment"', TOKENS);
  assertIncludes(tokens, 'findOtherMatches: "Find other matches"', TOKENS);

  // BANK-F91064 — MatchDrawer body/actions use locked text-xs (12px), not off-scale text-[11px].
  if (match.includes("text-[11px]")) {
    throw new Error(`${MATCH}: must not use text-[11px] (GLOBAL-TYPE-SIZE-BASELINE body 12px = text-xs)`);
  }

  // BANK-F91068 — B-3 Split modal labels use text-section-header / text-xs, not text-[11px].
  const splitModal = read("apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx");
  if (splitModal.includes("text-[11px]")) {
    throw new Error("BankTransactionSplitModal.tsx: must not use text-[11px] — use text-section-header or text-xs");
  }
  assertIncludes(splitModal, "text-section-header", "BankTransactionSplitModal.tsx");

  // BANK-F91069 — B-3 Banking Home account tile + Transfers list use locked text tokens.
  const accountTile = read("apps/frontend/src/pages/banking/components/AccountTile.tsx");
  if (accountTile.includes("text-[11px]")) {
    throw new Error("AccountTile.tsx: must not use text-[11px] — use text-xs (ORDERS §16 card chrome)");
  }
  const transfers = read("apps/frontend/src/pages/banking/TransfersListPage.tsx");
  if (transfers.includes("text-[11px]")) {
    throw new Error("TransfersListPage.tsx: must not use text-[11px] — use text-xs");
  }
  const escrow = read("apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx");
  if (escrow.includes("text-[11px]")) {
    throw new Error("DriverEscrowLedgerSection.tsx: must not use text-[11px] — use text-xs");
  }

  // BANK-F91074 — archived BankTxCategorizationPage KPI/body use locked tokens (not text-[11px]).
  const bankTxCat = read("apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx");
  if (bankTxCat.includes("text-[11px]")) {
    throw new Error("BankTxCategorizationPage.tsx: must not use text-[11px] — use text-section-header or text-xs");
  }
  if (!bankTxCat.includes("text-section-header")) {
    throw new Error("BankTxCategorizationPage.tsx: KPI labels must use text-section-header");
  }

  // BANK-F91076 — EmailQueuePage mono/body uses text-xs, not text-[11px].
  const emailQueue = read("apps/frontend/src/pages/banking/EmailQueuePage.tsx");
  if (emailQueue.includes("text-[11px]")) {
    throw new Error("EmailQueuePage.tsx: must not use text-[11px] — use text-xs");
  }

  console.log(`${LABEL}: PASS`);
}

function selftest() {
  try {
    main();
  } catch (err) {
    console.error(`${LABEL}: SELFTEST FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
