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
if (!/\bAS reference\b/.test(svc)) {
  failures.push(`${svcPath}: SQL no longer aliases a human reference column`);
}

const pagePath = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";
const src = readFileSync(pagePath, "utf8");

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
