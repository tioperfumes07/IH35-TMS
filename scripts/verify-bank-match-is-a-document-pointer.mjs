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

function readAll() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
}

/** The rules, pure over the sources (keys of FILES). Returns every violation (empty = OK). */
export function pointerFailures(src) {
  const errors = [];
  const { helper, alert, kpi, match, suggest, reconcile, kpiGuard, feedLinks } = src;

  for (const n of [
    "BANK_LINE_DOCUMENT_POINTER_COLUMNS",
    "matched_deposit_id",
    "matched_relay_deposit_id",
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
  if (!feedLinks.includes("matched_relay_deposit_id")) {
    errors.push(`${FILES.feedLinks} LINK_COLUMNS must include matched_relay_deposit_id (ROUND 443.29-B)`);
  }
  const { voidReleaser, voidGuard } = src;
  if (!voidReleaser.includes("BANK_LINE_DOCUMENT_POINTER_COLUMNS")) {
    errors.push(`${FILES.voidReleaser} RELEASABLE_POINTER_COLUMNS must be the helper list (deposit was dropped from a second copy)`);
  }
  if (!voidGuard.includes("matched_deposit_id") || !voidGuard.includes("accounting.deposits")) {
    errors.push(`${FILES.voidGuard} POINTER/DOCUMENTS must include accounting.deposits / matched_deposit_id`);
  }
  if (kpiGuard.includes("review_state = 'for_review' AND is_credit")) {
    errors.push(`${FILES.kpiGuard} still ties unmatched KPI to review_state`);
  }

  return errors;
}

function liveCheck() {
  const errors = pointerFailures(readAll());
  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — unmatched is a live document pointer (helper + KPI + accept + suggest + reconcile)`);
}

function selftest() {
  const src = readAll();
  const plant = (k, from, to) => ({ ...src, [k]: src[k].split(from).join(to) });
  const cases = [
    ["the real sources pass", pointerFailures(src).length === 0],
    ["a helper that drops matched_deposit_id fails", pointerFailures(plant("helper", "matched_deposit_id", "matched_x_id")).length > 0],
    ["a helper that keys match off review_state fails", pointerFailures({ ...src, helper: src.helper + "\n// review_state" }).length > 0],
    ["a KPI that treats for_review as unmatched fails", pointerFailures({ ...src, kpi: src.kpi + "\nconst UNMATCHED = `b.review_state = 'for_review'`" }).length > 0],
    ["an accept path without the live-pointer refusal fails", pointerFailures(plant("match", "bankLineHasLiveDocumentPointer", "x")).length > 0],
    ["a feed state machine without matched_relay_deposit_id fails", pointerFailures(plant("feedLinks", "matched_relay_deposit_id", "x")).length > 0],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else liveCheck();
