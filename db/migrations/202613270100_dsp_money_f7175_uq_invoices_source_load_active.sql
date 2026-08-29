-- DSP-MONEY-F7175-LOAD-INVOICE-LOOKUP-FAILURE-CAN-CREATE-DUPLICATE (backend half):
-- accounting.invoices.source_load_id had no DB-level uniqueness backing it. buildInvoiceFromLoad
-- (from-load.ts) does a plain SELECT-for-existing then INSERT with no row lock -- a textbook TOCTOU:
-- two racing from-load calls (double-click, timeout-retry, or the POD-approval auto-trigger racing a
-- manual click) can both pass the SELECT and both INSERT, producing two live invoices for one load.
-- Separately, factoring/packet-assemble.service.ts's own from-load auto-create already assumed this
-- constraint existed -- its INSERT carries `ON CONFLICT (source_load_id) DO NOTHING`, which requires a
-- real unique/exclusion index matching that exact arbiter or Postgres raises 42P10 (undefined_column /
-- no unique constraint matching ON CONFLICT). With no matching index, that branch has been throwing a
-- guaranteed 42P10 for every newly-delivered, POD-approved load with no invoice yet -- silently caught
-- one level up by pod.routes.ts's fire-and-forget `.catch((err) => req.log.warn(...))`, so
-- auto-factoring-packet invoice creation has been non-functional with only a warn-level log line.
--
-- Verified live on prod (tiny-field-89581227, neondb_owner, bypass_rls) before writing this migration:
-- 12032 total invoices, 36 carrying a source_load_id, ZERO duplicate-active-invoice-per-load groups
-- today -- safe to add the constraint with no data conflict.
--
-- Partial (not plain) unique index, matching from-load.ts's own findConflictingInvoiceForLoad
-- predicate exactly (`voided_at IS NULL`) -- a load may accumulate multiple VOIDED invoices over time
-- (void-not-delete), and only one ACTIVE (non-voided) invoice per load is the real invariant.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_source_load_active
  ON accounting.invoices (source_load_id)
  WHERE voided_at IS NULL AND source_load_id IS NOT NULL;

COMMIT;
