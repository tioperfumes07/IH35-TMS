-- FINDING: INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER
-- Owner 2026-08-24: going-forward from-load mint stores mdata.loads.load_number as
-- accounting.invoices.display_id. Historical INV-YYYY-NNNN rows stay (including TRANSP QBO
-- mirror). UNIQUE(operating_company_id, display_id) is unchanged.
--
-- LIVE CHECK (Neon production 2026-08-25): invoices_display_id_check =
-- CHECK ((display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'::text))
-- Live load_number prefixes (lucia 2026-08-25): L- (34), LUSMCAFREIGHT- (6).
-- Widen: INV sequence OR those two canonical load_number shapes only.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Fresh-DB: 0060 creates the
-- INV-only CHECK; this migration replaces it. No data rewrite. No RLS/grant change.
-- NO TMS→QBO write-back. No new GL math.

DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NOT NULL THEN
    ALTER TABLE accounting.invoices
      DROP CONSTRAINT IF EXISTS invoices_display_id_check;
    ALTER TABLE accounting.invoices
      ADD CONSTRAINT invoices_display_id_check
      CHECK (
        display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'
        OR display_id ~ '^L-[0-9]{8}-[0-9]{4}$'
        OR display_id ~ '^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$'
      );
  END IF;
END $$;
