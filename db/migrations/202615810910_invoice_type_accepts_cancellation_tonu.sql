-- 443.113 AJK-10/11 (Codex deep-wiring audit 2026-10-12) — the TONU writer's own invoice type was refused.
--
-- createTonuInvoiceForCancellation (apps/backend/src/dispatch/cancellation-tonu-invoice.ts) writes the earned
-- cancellation charge as accounting.invoices.invoice_type = 'cancellation_tonu' (ACCT-F5701). The column's CHECK
-- (inline since 0106/0123, auto-named invoices_invoice_type_check) never listed it, so every billable cancellation
-- with TONU_CANCELLATION_AR_POSTING_ENABLED on rolled back with 23514. Prod (read-only, 2026-10-12): the flag is ON
-- for USMCA (per-company override) and USMCA has 0 cancellations yet — latent, it would refuse the first one.
--
-- Widen by exactly one value; every existing row already satisfies it. Idempotent (drop-if-exists + re-add the
-- same definition). The other six values are prod's definition verbatim.
ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE accounting.invoices
  ADD CONSTRAINT invoices_invoice_type_check CHECK (invoice_type = ANY (ARRAY[
    'from_load'::text, 'driver_damage'::text, 'driver_misc'::text, 'vendor_chargeback'::text,
    'customer_adjustment'::text, 'manual'::text, 'cancellation_tonu'::text
  ]));
