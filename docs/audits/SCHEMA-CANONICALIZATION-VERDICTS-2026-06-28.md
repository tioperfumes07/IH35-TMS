# Schema-Canonicalization Verdicts + Financial-Queue Handoff (GUARD-verified 2026-06-28)

> **FRESH SESSION: read this file first, then continue `~/Downloads/IH35-CLAUDE-CODER-ALL (1)`
> starting at CODER-28B.** All verdicts below are GUARD live-verified this session (prod
> `pg_stat_user_tables` / `information_schema`, `scripts/canonical-relations.json`,
> `docs/audits/SETTLEMENTS-AUDIT-2026-06-06.md`) — not memory, not guesses.

## CODER-30 canonical verdicts (design doc only; folds are separate Tier-1 HOLD blocks AFTER Jorge decides)
1. **bank → banking — real fold.** `bank.reconciliation_matches` (11 cols, 0 rows) → `banking.reconciliation_matches`; `banking.*` is the live canonical (bank_transactions 2,649 rows, bank_accounts 9). Repoint `match.service.ts`; deprecate-not-drop `bank.*`.
2. **factor ≠ factoring — DISTINCT concerns, NOT duplicates.** `factoring.*` = the canonical factoring LEDGER (factor/batch/reserve_movement/customer_factor_assignment/bank_match_suggestion, per `canonical-relations.json`). `factor.*` = FARO import/recon STAGING (faro_daily_imports/faro_invoice_lines/reconciliation_runs/reconciliation_items). **Do NOT fold.** **OPEN DECISION (Jorge):** optional rename `factor.*` → `factoring.faro_*` (only if it doesn't disturb FARO recon code). Gates the factoring GL build (CODER-34).
3. **settlement header canonical = `driver_finance.driver_settlements`** (+ `settlement_lines`; every live writer). Deprecate-not-drop `settlement.*` (0 rows, no writer). **OPEN DECISION (Jorge):** `payroll.driver_settlements` (0233, Block-22 parallel, 0 rows) — reconcile-into-driver_finance vs deprecate (verify no live writer first). `settlements.*` (settlement_disputes, team_split_configs, team_split_load_overrides) STAYS — child config, correctly scoped.

## Other GUARD-verified answers (locked)
- **CODER-28B** (GL idempotency UNIQUE index on `accounting.journal_entry_postings (operating_company_id, idempotency_key) WHERE NOT NULL` + `ON CONFLICT` in all 7 posters + guard): GUARD prod dup-check = **ZERO dups → safe to add**. T1 HOLD. The 7 posters: posting-engine.service, journal-entries.service, recurring.worker, void.service, bank-recon/match.service, period-close-retained-earnings.service, fuel-posting/poster.service.
- **CODER-29** — the 4 tables (auto_deduction_policies, team_split_configs, road_service_tickets, maintenance_parts) **ALREADY EXIST on prod → FORCE-RLS only, do NOT create** (they're RLS-enabled-but-FORCE-OFF; settlement_disputes already forced) + orphaned-dir ban-guard. T1 HOLD.
- **FIN-18** settlement-posting design: 5 answers locked (1099 / floor default 0 / 376.12(h) consent / 376.12(k) escrow / COA-by-role / maker≠checker HARD); classification = attorney's call; posting GATED OFF; references `driver_finance.driver_settlements` canonical.
- Flag pattern: `lib.feature_flags` (flag_key/default_enabled), all new flags default OFF.

## CODER-36 — CORRECTED by verify-first (READ THIS before building it)
GUARD's CODER-36 spec says "add `entity_type` / `operating_company_id` columns + reconcile the
writers." **The fresh-migrated DB (authoritative, = CI model, 667 tables) proves those columns
ALREADY EXIST in `db/migrations/`:**
- `qbo.sync_alerts` HAS `entity_type` (0144) — all 4 QBO writers (sync-with-retry, expenses.routes, journal-entry-qbo-push, qbo-sync-worker) write valid columns vs the migrated schema.
- `sms.queue` / `whatsapp.queue` HAVE `operating_company_id, to_phone, provider_status, provider_error, variables, status, error, to_number` (0166 + drift-capture).
- These are **NOT in `sql-write-targets-known-debt.json`** and the write-targets guard **PASSES** for them against the live model — i.e. the code is correct vs the migration source.

**Therefore the real root cause is PROD MIGRATION-DEPLOY DRIFT**, not missing-from-source and not wrong code:
- An existing migration `202606271520_capture_prod_column_drift.sql` already does idempotent `ADD COLUMN IF NOT EXISTS` for the **sister** columns (kind, message, payload, sync_run_id, to_number, status, attempts, error…) — but it does **NOT** cover the columns GUARD now reports prod-missing (`entity_type`, `operating_company_id`, `to_phone`, `provider_status`, `provider_error`, `variables`).
- **Duplicate-column drift exists:** `sms.queue` has BOTH `to_phone` AND `to_number`, BOTH `status` AND `provider_status`, BOTH `error` AND `provider_error` (from prior bidirectional drift-reconciliation). Reconciling the writers to a different valid column (GUARD's option) needs a **canonical decision** — do not guess.

**CORRECT fix (do this, NOT the spec's "add new column / reconcile code"):**
1. A NEW **idempotent `ADD COLUMN IF NOT EXISTS`** migration re-asserting only the GUARD-confirmed prod-missing columns (`qbo.sync_alerts.entity_type`; `sms.queue` + `whatsapp.queue` `operating_company_id`, `to_phone`, `provider_status`, `provider_error`; `whatsapp.queue.variables`) — **no-op on CI/fresh (they exist), additive on prod** — mirroring the `202606271520` pattern. **No code reconcile** (the writers already target columns that exist in the migrated schema). T1 HOLD; GUARD Neon-verifies exactly which are missing on prod.
2. **OPEN DECISION (Jorge):** canonicalize the duplicate queue columns (`to_phone` vs `to_number`, `status` vs `provider_status`, `error` vs `provider_error`) — pick one, deprecate the other, in a separate cleanup. This is a `legal/audit`-grade tidiness item, not a silent-failure blocker.
3. Do **NOT** add these to known-debt (they aren't debt; the guard passes).

## What shipped this session (merged / auto-merging)
CODER-12 (#1620), CODER-27 (#1621), CODER-28A (#1622), CODER-16 (#1619), CODER-21 (#1611), CODER-23 (#1609/#1610), DB-7 P1/P2 (#1607/#1614), CODER-14 (#1617), CODER-17 (#1615/#1616), factoring-FK Tier-1 (#1612), RLS intransit_issues Tier-1 (#1618), CODER-32 drift tool (#1613). Held for label: any open Tier-1.
