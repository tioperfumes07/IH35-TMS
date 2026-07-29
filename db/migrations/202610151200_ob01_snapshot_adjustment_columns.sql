-- OB-01 — OWNER RULING 2026-07-29 (Cursor-OpeningBalances-OB01.md): opening balances are LIVE and
-- CHANGE. There is no finality gate. This migration is purely additive schema to carry the
-- three-column worksheet model (QBO Snapshot | Adjustment | Adjusted Opening) that the owner asked
-- for, so a re-import can refresh the Snapshot without clobbering an Adjustment someone already made.
--
-- catalogs.accounts gets two new nullable/defaulted columns. The canonical "value used everywhere
-- else in the system" stays `opening_balance_cents` (unchanged column, unchanged meaning): it IS the
-- Adjusted Opening balance, i.e. `coalesce(opening_balance_qbo_snapshot_cents, 0) +
-- opening_balance_adjustment_cents`. That identity is documented on the column (COMMENT), not
-- enforced by a CHECK constraint, because pre-existing rows (USMCA manual entries, legacy commits
-- before this migration existed) can carry a non-NULL opening_balance_cents with NULL snapshot / 0
-- adjustment — a CHECK would either reject those rows or force a backfill guess this migration has no
-- authority to make. The commit path (opening-balance-register.service.ts) is what keeps new writes
-- consistent with the identity; this migration only adds the columns it writes to.
--
-- accounting.ob_register_staging_lines gets the same two columns so the review buffer can show the
-- Snapshot and Adjustment values the register was staged from, not just the resulting Adjusted
-- Opening (`amount_cents`, unchanged meaning: it stays the value a commit would write onto
-- catalogs.accounts.opening_balance_cents).
--
-- Idempotent (IF NOT EXISTS + DO guards), apply-twice safe, NOTICE + RETURN never RAISE on absent
-- prerequisites (fresh-DB CI has no rows and may not even have run 202610141200 yet in some branch
-- orderings — guarded explicitly below). No hardcoded company UUID: this migration touches no company
-- row at all, only columns. FORCE RLS is unchanged — these are additive columns on tables that already
-- carry FORCE RLS from their creating migrations.

BEGIN;

DO $$
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL THEN
    RAISE NOTICE 'OB-01 snapshot/adjustment columns: catalogs.accounts absent — skip';
    RETURN;
  END IF;

  ALTER TABLE catalogs.accounts
    ADD COLUMN IF NOT EXISTS opening_balance_qbo_snapshot_cents bigint NULL,
    ADD COLUMN IF NOT EXISTS opening_balance_adjustment_cents bigint NOT NULL DEFAULT 0;

  COMMENT ON COLUMN catalogs.accounts.opening_balance_qbo_snapshot_cents IS
    'OB-01: the QBO Balance Sheet snapshot as last imported (read-only in the register UI). Refreshed '
    'by re-import; NULL for accounts never imported from QBO (e.g. USMCA manual-only entries).';
  COMMENT ON COLUMN catalogs.accounts.opening_balance_adjustment_cents IS
    'OB-01: the owner/accountant editable adjustment layered on top of the QBO snapshot. Persists '
    'across re-imports (re-import refreshes the snapshot only). Adjusted Opening = '
    'coalesce(opening_balance_qbo_snapshot_cents, 0) + opening_balance_adjustment_cents, and that '
    'Adjusted Opening value is what a commit writes onto opening_balance_cents (see '
    'opening-balance-register.service.ts commitObRegister).';
  COMMENT ON COLUMN catalogs.accounts.opening_balance_cents IS
    'The committed Adjusted Opening balance (signed-actual). Owner ruling 2026-07-29: balances are '
    'LIVE and CHANGE — there is no finality lock. Identity when set via the OB-01 register: '
    'opening_balance_cents = coalesce(opening_balance_qbo_snapshot_cents, 0) + '
    'opening_balance_adjustment_cents.';
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.ob_register_staging_lines') IS NULL THEN
    RAISE NOTICE 'OB-01 snapshot/adjustment columns: accounting.ob_register_staging_lines absent — skip';
    RETURN;
  END IF;

  ALTER TABLE accounting.ob_register_staging_lines
    ADD COLUMN IF NOT EXISTS qbo_snapshot_cents bigint NULL,
    ADD COLUMN IF NOT EXISTS adjustment_cents bigint NOT NULL DEFAULT 0;

  COMMENT ON COLUMN accounting.ob_register_staging_lines.qbo_snapshot_cents IS
    'OB-01: QBO/fixture snapshot this staged line was imported from. NULL for hand-entered lines that '
    'never had a source snapshot (e.g. USMCA manual-only).';
  COMMENT ON COLUMN accounting.ob_register_staging_lines.adjustment_cents IS
    'OB-01: the editable adjustment on top of qbo_snapshot_cents. Preserved across re-import.';
  COMMENT ON COLUMN accounting.ob_register_staging_lines.amount_cents IS
    'The Adjusted Opening to commit: qbo_snapshot_cents (or 0) + adjustment_cents. This is the value a '
    'commit writes onto catalogs.accounts.opening_balance_cents — unchanged meaning from the original '
    '202610141200 migration, now explicitly decomposed into its two source columns.';
END
$$;

COMMIT;

-- Read-only verify (harmless on re-run): the four new columns exist with the expected types/defaults.
SELECT table_schema, table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE (table_schema, table_name, column_name) IN (
  ('catalogs', 'accounts', 'opening_balance_qbo_snapshot_cents'),
  ('catalogs', 'accounts', 'opening_balance_adjustment_cents'),
  ('accounting', 'ob_register_staging_lines', 'qbo_snapshot_cents'),
  ('accounting', 'ob_register_staging_lines', 'adjustment_cents')
)
ORDER BY table_schema, table_name, column_name;

-- DOWN
-- BEGIN;
-- ALTER TABLE accounting.ob_register_staging_lines DROP COLUMN IF EXISTS adjustment_cents;
-- ALTER TABLE accounting.ob_register_staging_lines DROP COLUMN IF EXISTS qbo_snapshot_cents;
-- ALTER TABLE catalogs.accounts DROP COLUMN IF EXISTS opening_balance_adjustment_cents;
-- ALTER TABLE catalogs.accounts DROP COLUMN IF EXISTS opening_balance_qbo_snapshot_cents;
-- COMMIT;
