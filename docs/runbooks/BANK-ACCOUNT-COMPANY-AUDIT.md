# Bank Account Company Audit Runbook (GAP-53)

1. `GET /api/banking/integrity/account-company-audit` — review mismatches.
2. `node apps/backend/scripts/backfill-bank-account-company-tagging.mjs` (dry-run).
3. Owner: `POST /api/banking/integrity/account-company-audit/reassign` per account.
4. `node apps/backend/scripts/report-bank-account-historical-txn-drift.mjs` — txn impact.
