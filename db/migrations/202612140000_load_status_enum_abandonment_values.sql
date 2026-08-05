-- DISP-01 / ACCT-F117 — restore the three abandonment members of mdata.load_status_enum.
--
-- WHY THIS FILE CONTAINS NOTHING ELSE. This is the whole point, not tidiness.
-- Migration 0094 already ran these exact three ADD VALUE statements and is ledgered as applied in
-- BOTH ledgers, yet the labels are absent from prod (verified 2026-08-05 on
-- br-fancy-credit-akjnd07a: mdata.load_status_enum has 17 labels, none of them abandoned /
-- driver_walkoff / driver_no_show, and NO enum anywhere in the database carries them). 0094 ran
-- those ALTER TYPEs at top level inside one BEGIN…COMMIT that ALSO created schemas, the
-- dispatch.load_abandonments table, functions and triggers. Anything in that transaction that
-- aborted took the enum additions down with it. By contrast 0040 added four values from inside a
-- guarded DO block and all four are present today.
--
-- So: this migration does ONE thing. No schema, no table, no function, no trigger, no seed. There
-- is nothing here that can fail and roll the ADD VALUEs back with it. Do not add anything to this
-- file — put it in the next migration.
--
-- NO EXPLICIT BEGIN/COMMIT, deliberately. scripts/db-migrate.mjs wraps a file without an explicit
-- transaction in its own; PostgreSQL 16 permits ALTER TYPE … ADD VALUE inside a transaction block
-- provided the new value is not USED in that same transaction — and nothing here uses it.
--
-- WHAT THIS UNBLOCKS. driver-finance/abandonment.service.ts writes `SET status = 'abandoned'`
-- uncast; with the label missing that throws 22P02 and rolls back the entire abandonment flow,
-- chargeback insert included. Migration 202610291200 already had to rewrite
-- trg_auto_propose_escrow_on_abandon to compare NEW.status::text because the same missing literals
-- were aborting EVERY load status UPDATE on the table. That ::text comparison stays exactly as it
-- is — it keeps working once the labels exist, and removing it is not part of this fix.
--
-- IDEMPOTENT: ADD VALUE IF NOT EXISTS is a no-op when the label is already present, so a re-run and
-- a from-scratch CI database both land in the same state.
--
-- The EFFECT of this migration is asserted after every apply by scripts/db-migrate.mjs (see
-- REQUIRED_ENUM_LABELS) and by scripts/verify-load-status-enum-abandonment-values.mjs. A ledger row
-- saying "applied" is exactly what 0094 produced while doing nothing, so the ledger is not proof.

ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'abandoned';

ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'driver_walkoff';

ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS 'driver_no_show';
