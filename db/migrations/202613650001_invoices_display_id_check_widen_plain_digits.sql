-- 202613650001_invoices_display_id_check_widen_plain_digits.sql
-- SET-25 (owner order 2026-09-04). The owner cannot create an invoice on his first real load.
--
-- THE COLLISION:
--   - accounting/from-load.ts:176 writes mdata.loads.load_number directly into
--     accounting.invoices.display_id (owner ruling 2026-08-24, INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER).
--   - dispatch/load-id-reservation.service.ts (GO-10 REV-B "L3 lock") mints load numbers as PLAIN
--     DIGITS ONLY ("13509"). It deliberately KILLED the L-YYYYMMDD-NNNN and
--     LUSMCAFREIGHT-YYYYMMDD-NNNN formats.
--   - Live constraint invoices_display_id_check allowed ONLY
--       ^INV-[0-9]{4}-[0-9]{5}$  OR  ^L-[0-9]{8}-[0-9]{4}$  OR  ^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$
--     -- i.e. only the two DEAD formats plus the manual/legacy INV- series. Plain digits (today's
--     real load-number shape) were rejected outright.
--
-- THE DECISION IS ALREADY MADE, NOT RE-OPENED HERE: load numbers stay plain digits (the owner's
-- external numbering, L3-locked). The CONSTRAINT was what was wrong, not the numbering.
--
-- PROVEN LIVE BEFORE WRITING THIS, NOT ASSUMED (run twice, identical both times, Neon prod
-- tiny-field-89581227, bypass_rls): accounting.invoices total=11,980, ALL 11,980 already match
-- ^INV-[0-9]{4}-[0-9]{5}$ (the untouched, kept pattern); ZERO rows match either dead format; ZERO
-- rows already match plain digits (expected -- the old constraint rejected them). Widening is
-- therefore PURELY ADDITIVE: it cannot orphan a single existing row, historical or the TRANSP QBO
-- mirror included, because every existing row's shape is untouched by this change.
--
-- Idempotent, CREATE-only pattern: DROP CONSTRAINT IF EXISTS, then ADD. Never DROP data, never
-- narrow. All three existing patterns are KEPT (owner: "Keep all three existing patterns").

BEGIN;

ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_display_id_check;

ALTER TABLE accounting.invoices
  ADD CONSTRAINT invoices_display_id_check
  CHECK (
    display_id ~ '^INV-[0-9]{4}-[0-9]{5}$'
    OR display_id ~ '^L-[0-9]{8}-[0-9]{4}$'
    OR display_id ~ '^LUSMCAFREIGHT-[0-9]{8}-[0-9]{4}$'
    OR display_id ~ '^[0-9]{1,12}$'
  );

COMMENT ON CONSTRAINT invoices_display_id_check ON accounting.invoices IS
  'Widened 2026-09-04 (SET-25) to also accept plain digits (the load_number shape GO-10 REV-B L3 locked) -- the two YYYYMMDD-prefixed formats it also accepts are dead (0 live rows, superseded by L3) and are KEPT, not removed, per owner order. INV-YYYY-NNNNN (11,980 live rows, manual/legacy path) is unchanged.';

COMMIT;
