# CURSOR RULING — 202610090300 checksum override (deploy unblock)

**Date:** 2026-10-11  
**Seat:** Cursor (banking / deploy unblock)  
**Owner / Lead order:** ROUND 443.54 — fix failed deployments first

## Measured failure

Render BE `srv-d7rpem7avr4c73fhp4n0` `pre_deploy_failed` on tip `a57934e157` (and every tip after #26363):

```
Migration 202610090300_backfill_bank_categorization_vendor.sql was modified after apply
(ledger checksum ea4a0dc522696ddf4b36c6089beac1472b94928e27f75d5ae091179f2a036086,
 disk checksum 7551b689701c1b010f0b1fca8104583c37cd2534aaa9e065fc05f401f8fcaa0b).
```

Live BE healthz still `git_sha=51617081…` while FE tip is ahead.

## Root cause

PR #26363 (ROUND 443.29-B) edited the already-applied file `202610090300_backfill_bank_categorization_vendor.sql` to prepend:

```sql
ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS entity_type text;
```

so fresh-DB filename sort does not `SET entity_type` before `202612670000` creates the column. Prod already has `entity_type` (applied via later migrations); the added DDL is an idempotent no-op on prod. The UPDATE body is unchanged. `db:migrate` correctly refuses the post-apply edit without a registered checksum override.

## Ruling

Register one override pair in `scripts/lib/migration-checksum-overrides.json`:

- `ledger_checksum` = prod applied bytes (`ea4a0dc5…` = tip before the IF NOT EXISTS shim)
- `disk_checksum` = committed tip bytes (`7551b689…`)
- `ruling` = this file

Do **not** rewrite the applied SQL. Do **not** drop the IF NOT EXISTS shim (fresh replay still needs it). Deploy migrate must SKIP with "checksum override accepted".

## Proof required after merge

1. BE redeploy of tip that includes this override.
2. Render log: `SKIP 202610090300_backfill_bank_categorization_vendor.sql (checksum override accepted)`.
3. `GET https://ih35-tms.onrender.com/api/v1/healthz/shallow` → `git_sha` equals the squash-merge commit.
