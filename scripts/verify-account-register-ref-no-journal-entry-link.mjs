#!/usr/bin/env node
/**
 * verify-account-register-ref-no-journal-entry-link.mjs
 *
 * LV-REPORTS-BALANCE-SHEET-GL-JE-DRILL — the owner P0 inbox item asks for accounting/banking/
 * factoring/settlements "unpaid Live climb" including "Reports money gl_je/reverse cells". Live
 * matrix showed report.balance_sheet:gl_je unpaid. The balance sheet already links every account
 * to /accounting/chart-of-accounts/register/:id (real, DOM-confirmed), but the Account Register's
 * own "Ref No." column was plain, unclickable text — even though every AccountRegisterRow already
 * carries a real journal_entry_id (the row IS a posting on this account's own JE; confirmed live on
 * Neon: bill 8c199b5f-... posts to journal entry 0e3bdf59-..., status=posted). The data was already
 * there; only the render was missing, so the two-hop drill (balance sheet -> register -> JE)
 * dead-ended one hop short.
 *
 * Guard: AccountRegisterPage.tsx's "reference" column renders a real EntityLink kind="journal_entry"
 * using the row's own journal_entry_id when present, falling back to plain reference text only when
 * genuinely absent — never silently dropping the existing plain-text fallback for a row missing the
 * FK (append-only-safe: rows without journal_entry_id keep their old, honest behavior).
 */
import { readFileSync } from "node:fs";

const failures = [];

const svcPath = "apps/backend/src/accounting/account-register.service.ts";
const svc = readFileSync(svcPath, "utf8");
if (/reference:\s*p\.source_transaction_id/.test(svc)) {
  failures.push(`${svcPath}: Ref No. still copies source_transaction_id (UUID) — EntityLink tombstones it`);
}
if (!/NULLIF\(btrim\(b\.bill_number\)/.test(svc)) {
  failures.push(`${svcPath}: human reference no longer COALESCE bill_number`);
}
if (!/CASE WHEN p\.source_transaction_type = 'expense' THEN 'Expense' END/.test(svc)) {
  failures.push(`${svcPath}: expense Ref No. no longer falls back to Expense when expense_number is null`);
}
if (!/\bAS reference\b/.test(svc)) {
  failures.push(`${svcPath}: SQL no longer aliases a human reference column`);
}

// ACCT-REGISTER-SOURCEROUTE-UUID-REGRESSION: reference became a human document id here, but
// AccountRegisterPage.tsx's drill-through onRowClick kept calling sourceRoute(...) with it —
// every route sourceRoute builds (invoice/bill/payment/expense/settlement) expects the real
// entity UUID, not its display id, so every row click silently 404'd/misrouted the moment
// `reference` stopped being a UUID. AccountRegisterRow must carry the raw id separately.
if (!/source_transaction_id:\s*p\.source_transaction_id\s*\?\?\s*null/.test(svc)) {
  failures.push(`${svcPath}: AccountRegisterRow no longer preserves source_transaction_id separately from the now-human reference — drill-through routing has no raw id to use`);
}

const pagePath = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";
const src = readFileSync(pagePath, "utf8");

if (!/onRowClick=\{\(r\)\s*=>\s*navigate\(sourceRoute\(r\.source_transaction_type,\s*r\.source_transaction_id\)\)\}/.test(src)) {
  failures.push(`${pagePath}: onRowClick no longer calls sourceRoute(..., r.source_transaction_id) — check it wasn't reverted to the now-human r.reference`);
}

// Isolate the "reference" column's own object literal (up to the next top-level `{ key:` sibling)
// so this guard cannot be satisfied by the unrelated audit-history journal_entry_id column that
// also lives in this file (both legitimately use kind="journal_entry").
const refColMatch = src.match(/key:\s*"reference"[\s\S]*?(?=\n\s*\{\s*key:)/);
if (!refColMatch) {
  failures.push(`${pagePath}: could not isolate the "reference" column definition`);
} else {
  const refCol = refColMatch[0];
  if (!/r\.journal_entry_id\s*\?\s*\(/.test(refCol)) {
    failures.push(`${pagePath}: the reference column no longer branches on r.journal_entry_id`);
  }
  if (!/kind="journal_entry"/.test(refCol)) {
    failures.push(`${pagePath}: the reference column no longer renders an EntityLink kind="journal_entry"`);
  }
  if (!/id=\{r\.journal_entry_id\}/.test(refCol)) {
    failures.push(`${pagePath}: the EntityLink no longer binds id={r.journal_entry_id}`);
  }
  if (/entityLabel\(\s*r\.reference,\s*r\.journal_entry_id/.test(refCol)) {
    failures.push(
      `${pagePath}: Ref No. still passes journal_entry_id into entityLabel — that paints "Journal entry — not visible" whenever reference is null (live USMCA BofA 0cec933: 31 tombstones; bank rows already have human reference)`
    );
  }
  if (!/r\.reference \?\? "—"/.test(refCol)) {
    failures.push(`${pagePath}: the honest plain-text fallback for rows with no journal_entry_id is gone`);
  }
}

if (failures.length > 0) {
  console.error("verify-account-register-ref-no-journal-entry-link: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-account-register-ref-no-journal-entry-link: OK — Account Register's Ref No. column renders a real EntityLink to the row's own journal_entry_id when present, honest plain-text fallback preserved otherwise"
);
