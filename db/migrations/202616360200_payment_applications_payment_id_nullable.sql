-- 202616360200_payment_applications_payment_id_nullable.sql
-- ACCT-F11094 (register row 257): ACCT-F11070 (#28623, row 129) records poster relief on an invoice (Faro collected the
-- cash — no TMS customer-payment document) as ONE accounting.payment_applications row with payment_id NULL; the trigger
-- accounting.recompute_invoice_paid() derives amount_paid_cents from it. Prod already has payment_id NULLABLE (measured
-- 2026-11-04: is_nullable = YES; 0 rows with NULL yet) but no migration ever dropped the NOT NULL from 0060 / 0123, so a
-- fresh migrate refuses the relief application (CI CHAIN-06 F1: null value in column "payment_id" violates not-null).
-- This brings the migration chain to prod's shape. Idempotent: DROP NOT NULL on a nullable column is a no-op.
-- The FK to accounting.payments stays (a NULL references nothing); target_kind / target_id stay NOT NULL.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE accounting.payment_applications ALTER COLUMN payment_id DROP NOT NULL;
COMMIT;
