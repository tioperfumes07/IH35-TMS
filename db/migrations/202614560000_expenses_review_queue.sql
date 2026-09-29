-- 202614560000_expenses_review_queue.sql
-- ROUND 236/248 (Lead, P0, 2026-09-29): AUTH-089's duplicate-expense-document cleanup voided 87
-- accounting.expenses rows keyed on (load_id, total_amount_cents) alone -- an unsafe identity that
-- can silently void a real, distinct charge. Of those, 10 carried a vendor_document_number and were
-- independently confirmed live to have NO true duplicate (all 10 reinstated: AUTH-127 + AUTH-128).
-- The remaining 77 carry NO vendor_document_number, so neither side of the claimed duplicate is
-- independently comparable from the data alone -- they can be resolved only by a human reviewing
-- each row's real source document. Per the owner's explicit order: they are NOT auto-reinstated and
-- NOT purged; they move to this review queue and stay there, exempt, until reviewed.
--
-- GRAIN: one row per AUTH-089-voided expense with vendor_document_number IS NULL. Snapshots the
-- expense's own identifying fields (load, date, amount, memo) plus the specific live row AUTH-089
-- claimed it duplicated, so the reviewer has both sides without re-deriving the (load, amount)
-- match themselves. A TRACKING record only -- never mutates accounting.expenses, posts no GL, and
-- carries no money-moving semantics of its own.
--
-- Additive, idempotent, CREATE-only, void-not-delete, FORCED RLS. No existing data touched.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.expenses_review_queue (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
  -- The voided expense this row is about. Not a live FK constraint against a NON-voided row (the
  -- whole point is this expense IS currently voided) -- still references accounting.expenses so the
  -- reviewer can join back to the full row.
  source_expense_id           uuid NOT NULL REFERENCES accounting.expenses(id),
  load_id                     uuid NULL REFERENCES mdata.loads(id),
  load_number                 text NULL,
  transaction_date            date NULL,
  amount_cents                bigint NOT NULL,
  memo                        text NULL,
  -- The specific live row AUTH-089's (load, amount) match claimed this expense duplicated --
  -- snapshotted so a reviewer sees exactly what the flawed detector compared it against, without
  -- re-running that same unsafe query.
  claimed_duplicate_expense_id uuid NULL REFERENCES accounting.expenses(id),
  claimed_duplicate_memo      text NULL,
  reason_queued               text NOT NULL DEFAULT
    'AUTH-089 duplicate-expense-document cleanup voided this row citing a (load, amount) match; no vendor_document_number exists to independently confirm or refute the claim.',
  status                      text NOT NULL DEFAULT 'pending_review',
  resolution                  text NULL,
  resolution_notes            text NULL,
  queued_at                   timestamptz NOT NULL DEFAULT now(),
  reviewed_at                 timestamptz NULL,
  reviewed_by_user_id         uuid NULL REFERENCES identity.users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_expenses_review_queue_status CHECK (status IN ('pending_review', 'resolved')),
  CONSTRAINT chk_expenses_review_queue_resolution CHECK (
    resolution IS NULL OR resolution IN ('reinstated', 'confirmed_duplicate', 'other')
  ),
  -- Resolved rows must carry a resolution and a reviewer; pending rows must not (mirrors
  -- invoice_disputes' own open/resolved state-machine check exactly).
  CONSTRAINT chk_expenses_review_queue_resolved_state CHECK (
    (status = 'pending_review' AND reviewed_at IS NULL AND resolution IS NULL)
    OR (status = 'resolved' AND reviewed_at IS NOT NULL AND resolution IS NOT NULL)
  )
);

-- One queue row per source expense -- re-running the population script must never duplicate an
-- already-queued row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_review_queue_source_expense
  ON accounting.expenses_review_queue (source_expense_id);
CREATE INDEX IF NOT EXISTS ix_expenses_review_queue_status
  ON accounting.expenses_review_queue (operating_company_id, status);

-- WORM: never DELETE a financial-adjacent tracking row.
DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION
      '202614560000: accounting.refuse_financial_row_delete() absent -- ACCT-F141 (202612220000) must exist first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'expenses_review_queue'
       AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.expenses_review_queue
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
  END IF;
END
$$;

DO $expenses_review_queue_rls$
BEGIN
  EXECUTE 'ALTER TABLE accounting.expenses_review_queue ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE accounting.expenses_review_queue FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'accounting' AND tablename = 'expenses_review_queue'
      AND policyname = 'expenses_review_queue_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY expenses_review_queue_tenant ON accounting.expenses_review_queue
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  -- void-not-delete: SELECT/INSERT/UPDATE only (UPDATE needed to record a review outcome). No DELETE.
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.expenses_review_queue TO ih35_app';
  EXECUTE 'REVOKE DELETE ON accounting.expenses_review_queue FROM ih35_app';
  EXECUTE 'REVOKE ALL ON accounting.expenses_review_queue FROM PUBLIC';
END
$expenses_review_queue_rls$;

COMMENT ON TABLE accounting.expenses_review_queue IS
  'ROUND 236/248: the 77 AUTH-089-voided expenses with no vendor_document_number, exempt from both reinstatement and purge until a human reviews each one''s real source document. A TRACKING record only -- never mutates accounting.expenses, posts no GL.';

COMMIT;
