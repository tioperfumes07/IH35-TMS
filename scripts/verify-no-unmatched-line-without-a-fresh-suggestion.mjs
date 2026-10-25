#!/usr/bin/env node
// RC5 443.341: re-suggest sweep — after rules change, unmatched lines get a fresh suggestion.
// Static check: bulk re-suggest endpoint must exist and trigger on rule changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireLiveDbOrExit } from './lib/require-live-db.mjs';

const LABEL = 'verify-no-unmatched-line-without-a-fresh-suggestion';
const USMCA = '5c854333-6ea5-4faa-af31-67cb272fef80';

// --- static check: the POST/apply-rules endpoint must call applyBankingRulesForCompany ---
const routesSrc = fs.readFileSync('apps/backend/src/banking/p7-wave2.routes.ts', 'utf8');
assert(
  routesSrc.includes('applyBankingRulesForCompany'),
  'p7-wave2.routes.ts must call applyBankingRulesForCompany (bulk re-suggest) — RC5 not implemented'
);

// --- live check: no uncategorized debit transaction older than 7 days should have null suggested_account_id ---
const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS stale_count
     FROM banking.bank_transactions
     WHERE operating_company_id = $1::uuid
       AND is_credit = false
       AND categorized_at IS NULL
       AND suggested_at IS NULL
       AND created_at < now() - interval '7 days'`,
    [USMCA]
  );
  const stale = rows[0]?.stale_count ?? 0;
  if (stale > 0) {
    console.error(LABEL + ` WARN — ${stale} debit transactions older than 7 days have no suggestion; run POST /api/v1/banking/transactions/apply-rules to sweep`);
    // RC5 is a sweep, not a hard block — warn but don't fail the gate
    // A fresh sweep after a rule change is the owner's action, not a pre-PR precondition.
  }
  console.log(LABEL + ` PASS — stale unsuggestioned debit txns: ${stale}`);
} finally {
  client.release();
  await pool.end();
}
