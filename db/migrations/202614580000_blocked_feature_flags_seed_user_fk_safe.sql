-- ROUND 259 follow-up (Cursor) — do NOT edit 202614530000_qbo_flags_permanent_block.sql.
--
-- 202614530000 was applied with checksum f2098eb0627eefaa9c04740944fe4f134aa62b75ed4f8b75a3766a7855459358.
-- A later in-place edit (08eee92f52 / #23137) changed disk bytes and red'd deploy + main CI with:
--   "Migration … was modified after apply (ledger checksum f2098…, disk checksum b872…)".
-- Per owner P0: restore 202614530000 byte-for-byte to the applied version; put the intended
-- repair here in a NEW later migration.
--
-- Intent of the reverted edit: blocked_by_user_id REFERENCES identity.users(id). Fresh DBs may
-- lack owner uuid e4117991-…, so a bare UUID literal fails blocked_feature_flags_blocked_by_user_id_fkey.
-- Resolve via scalar subquery (NULL if missing — column is nullable). FK kept; never dropped.
--
-- Idempotent: UPDATE existing seed rows; INSERT … ON CONFLICT DO NOTHING for any missing keys.

BEGIN;

UPDATE catalogs.blocked_feature_flags
   SET blocked_by_user_id = (
         SELECT id FROM identity.users
          WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid
       )
 WHERE flag_key IN (
   'QBO_JE_PUSH_ENABLED',
   'QBO_ENTITY_PUSH_ENABLED',
   'VOID_QBO_MIRROR_ENABLED',
   'QBO_AP_BILLS_PROJECTION_ENABLED',
   'QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED',
   'QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED',
   'QBO_AP_MIRROR_PULL_ENABLED',
   'QBO_AR_INVOICES_PROJECTION_ENABLED',
   'QBO_AR_INVOICE_MIRROR_PULL_ENABLED',
   'QBO_AR_PAYMENTS_PROJECTION_ENABLED',
   'QBO_AR_PAYMENT_MIRROR_PULL_ENABLED',
   'QBO_EXPENSES_PROJECTION_ENABLED',
   'QBO_PURCHASES_MIRROR_PULL_ENABLED',
   'QBO_VENDOR_CREDITS_PROJECTION_ENABLED',
   'QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED',
   'QBO_MASTER_DATA_HEAL_ENABLED',
   'TMS_QBO_RECON_ENABLED'
 );

INSERT INTO catalogs.blocked_feature_flags (flag_key, reason, owner_ruling_ref, blocked_by_user_id)
VALUES
  ('QBO_JE_PUSH_ENABLED',
   'Push journal entries into QuickBooks. QBO write-back is the hard core the owner named.',
   'ROUND 195 (2026-09-28); law doc §2 "QuickBooks write-back: NEVER"',
   (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_ENTITY_PUSH_ENABLED',
   'Push invoice/bill/customer/vendor/account/item masterdata into QuickBooks. QBO write-back is the hard core the owner named.',
   'ROUND 195 (2026-09-28); law doc §2 "QuickBooks write-back: NEVER"',
   (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('VOID_QBO_MIRROR_ENABLED',
   'Mirror a TMS void into QuickBooks. QBO write-back is the hard core the owner named.',
   'ROUND 195 (2026-09-28); law doc §2 "QuickBooks write-back: NEVER"',
   (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_BILLS_PROJECTION_ENABLED',
   'Project the QBO A/P bills mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED',
   'Project the QBO A/P bill-payments mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED',
   'Pull QBO A/P bill payments into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AP_MIRROR_PULL_ENABLED',
   'Pull QBO A/P (purchases) into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_INVOICES_PROJECTION_ENABLED',
   'Project the QBO A/R invoices mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_INVOICE_MIRROR_PULL_ENABLED',
   'Pull QBO A/R invoices into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_PAYMENTS_PROJECTION_ENABLED',
   'Project the QBO A/R payments mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_AR_PAYMENT_MIRROR_PULL_ENABLED',
   'Pull QBO A/R payments into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_EXPENSES_PROJECTION_ENABLED',
   'Project the QBO expenses mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_PURCHASES_MIRROR_PULL_ENABLED',
   'Pull QBO purchases into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_VENDOR_CREDITS_PROJECTION_ENABLED',
   'Project the QBO vendor-credits mirror into TMS accounting.* tables.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED',
   'Pull QBO vendor credits into the read-only mirror.',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('QBO_MASTER_DATA_HEAL_ENABLED',
   'Auto-overwrite local vendor/customer/CoA fields from the QBO mirror (locked decision is detect-only).',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)),
  ('TMS_QBO_RECON_ENABLED',
   'Twice-daily QBO<->TMS reconciliation pass (data-moving recon engine, distinct from its read-only UI flag).',
   'ROUND 195 (2026-09-28)', (SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid))
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
