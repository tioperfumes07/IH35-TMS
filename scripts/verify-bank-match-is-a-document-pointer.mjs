#!/usr/bin/env node
/**
 * ENG-MATCH — unmatched is a live document pointer, never CATEGORIZE-account null
 * and never review_state='for_review' alone. Age (when used) is transaction_date, not created_at.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-bank-match-is-a-document-pointer";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  helper: "apps/backend/src/banking/bank-line-match-pointer.ts",
  alert: "apps/backend/src/banking/unmatched-7d-alert.ts",
  kpi: "apps/backend/src/banking/banking-kpi.service.ts",
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  suggest: "apps/backend/src/banking/link-suggestions.routes.ts",
  reconcile: "apps/backend/src/banking/obligation-reconcile.routes.ts",
  kpiGuard: "scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs",
  feedLinks: "scripts/lib/bank-feed-state-machine.mjs",
  voidReleaser: "apps/backend/src/accounting/void.service.ts",
  voidGuard: "scripts/verify-every-void-releases-its-bank-lines.mjs",
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
  const helper = read(FILES.helper);
  const alert = read(FILES.alert);
  const kpi = read(FILES.kpi);
  const match = read(FILES.match);
  const suggest = read(FILES.suggest);
  const reconcile = read(FILES.reconcile);
  const kpiGuard = read(FILES.kpiGuard);
  const feedLinks = read(FILES.feedLinks);

  for (const n of [
    "BANK_LINE_DOCUMENT_POINTER_COLUMNS",
    "matched_deposit_id",
    "matched_payment_id",
    "matched_bill_id",
    "bankLineIsUnmatchedSql",
    "bankLineHasLiveDocumentPointer",
  ]) {
    if (!helper.includes(n)) errors.push(`${FILES.helper} missing ${JSON.stringify(n)}`);
  }
  if (helper.includes("coa_account_id")) {
    errors.push(`${FILES.helper} must not key match off coa_account_id (CATEGORIZE ≠ MATCH)`);
  }
  if (helper.includes("review_state")) {
    errors.push(`${FILES.helper} must not key match off review_state`);
  }
  if (/created_at\s*>=/.test(helper)) {
    errors.push(`${FILES.helper} must not use created_at recency`);
  }

  if (!alert.includes("bankLineIsUnmatchedSql")) {
    errors.push(`${FILES.alert} must use the shared unmatched pointer predicate`);
  }
  if (!kpi.includes("bankLineIsUnmatchedSql") || !kpi.includes("bankLineHasLiveDocumentPointerSql")) {
    errors.push(`${FILES.kpi} unmatched/match_rate must use the shared pointer predicate`);
  }
  if (/const UNMATCHED = `b\.review_state = 'for_review'`/.test(kpi)) {
    errors.push(`${FILES.kpi} still treats review_state=for_review as unmatched`);
  }

  if (!match.includes("bankLineHasLiveDocumentPointer")) {
    errors.push(`${FILES.match} accept must refuse rematch on a live document pointer`);
  }

  if (!suggest.includes("bankLineIsUnmatchedSql")) {
    errors.push(`${FILES.suggest} suggestion pool must use the shared unmatched pointer predicate`);
  }
  if (suggest.includes("AND matched_expense_id IS NULL") && suggest.includes("AND matched_invoice_id IS NULL")) {
    errors.push(`${FILES.suggest} still uses the five-column unmatched subset`);
  }

  if (!reconcile.includes("bankLineIsUnmatchedSql") || !reconcile.includes("bankLineHasLiveDocumentPointer")) {
    errors.push(`${FILES.reconcile} unmatched queue must use the shared pointer predicate`);
  }
  if (reconcile.includes("AND matched_load_id IS NULL") && reconcile.includes("AND matched_settlement_id IS NULL")) {
    errors.push(`${FILES.reconcile} still uses the three-column unmatched subset`);
  }

  if (!kpiGuard.includes("matched_deposit_id") || !kpiGuard.includes("num_nonnulls")) {
    errors.push(`${FILES.kpiGuard} independent SQL must recompute unmatched from document pointers`);
  }
  if (!feedLinks.includes("matched_deposit_id")) {
    errors.push(`${FILES.feedLinks} LINK_COLUMNS must include matched_deposit_id (ROUND 373.4)`);
  }
  const voidReleaser = read(FILES.voidReleaser);
  const voidGuard = read(FILES.voidGuard);
  if (!voidReleaser.includes("BANK_LINE_DOCUMENT_POINTER_COLUMNS")) {
    errors.push(`${FILES.voidReleaser} RELEASABLE_POINTER_COLUMNS must be the helper list (deposit was dropped from a second copy)`);
  }
  if (!voidGuard.includes("matched_deposit_id") || !voidGuard.includes("accounting.deposits")) {
    errors.push(`${FILES.voidGuard} POINTER/DOCUMENTS must include accounting.deposits / matched_deposit_id`);
  }
  if (kpiGuard.includes("review_state = 'for_review' AND is_credit")) {
    errors.push(`${FILES.kpiGuard} still ties unmatched KPI to review_state`);
  }

  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — unmatched is a live document pointer (helper + KPI + accept + suggest + reconcile)`);
}

function selftest() {
  const helper = read(FILES.helper);
  const planted = helper.replace("matched_deposit_id", "matched_MISSING_deposit_id");
  if (planted.includes("matched_deposit_id") && !planted.includes("matched_MISSING_deposit_id")) {
    console.error(`${LABEL} --selftest: plant did not change source`);
    process.exit(1);
  }
  if (!planted.includes("matched_MISSING_deposit_id")) {
    console.error(`${LABEL} --selftest FAILED: mutation not visible`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: OK (deposit pointer plant visible)`);
}

const arg = process.argv[2] ?? "";
if (arg === "--selftest") selftest();
else liveCheck();
