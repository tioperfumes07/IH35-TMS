-- LEAD 443.151 (b) (owner 2026-10-16, ruling option 3): void-and-reissue keeps the SAME invoice number. A voided invoice is
-- never deleted (WORM: trg_worm_refuse_delete), so under the unique (operating_company_id, display_id) index it held its
-- number forever and a corrected reissue could never carry the number the owner submitted to Faro. The engine
-- (apps/backend/src/accounting/invoice-number-release.service.ts) now renames a VOIDED invoice to "<number>-V<n>" (audited,
-- original number in the audit row), which frees the number for the reissue. This CHECK accepts that shape ONLY on a void
-- row; a live invoice still carries one of the original shapes. Same definition as 202615660900 plus the one void clause.
-- Idempotent.
SET LOCAL lock_timeout = '60s';

ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_display_id_check;
ALTER TABLE accounting.invoices ADD CONSTRAINT invoices_display_id_check CHECK (
  display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'
  OR display_id ~ '^L-[0-9]{8}-[0-9]{4}$'
  OR display_id ~ '^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$'
  OR display_id ~ '^[0-9]{1,12}$'
  OR display_id ~ '^[0-9]{1,6}-[0-9]{1,12}$'
  OR (
    status = 'void'
    AND display_id ~ '^(INV-[0-9]{4}-[0-9]{5}|L-[0-9]{8}-[0-9]{4}|LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}|[0-9]{1,12}|[0-9]{1,6}-[0-9]{1,12})-V[0-9]{1,3}$'
  )
) NOT VALID;
ALTER TABLE accounting.invoices VALIDATE CONSTRAINT invoices_display_id_check;
