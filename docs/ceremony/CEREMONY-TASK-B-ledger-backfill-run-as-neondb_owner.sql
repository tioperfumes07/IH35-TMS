-- CEREMONY TASK B — ledger reconcile for the 8 applied+held ceremony migrations (ITEM 13, 2026-07-11)
-- Ledger writes ONLY — NO DDL, NO data change. Safe to re-run (ON CONFLICT DO NOTHING).
-- Run in the Neon SQL Editor (neondb, connects as neondb_owner) AFTER the VALIDATE migration (#2364).
-- These 8 migrations are HELD (DO-NOT-RUN markers) + already applied on prod by hand; this records them
-- in BOTH ledgers so state is consistent and db:migrate stays a no-op for them.
--
-- PRE-FLIGHT (how many of the 8 are NOT yet dual-ledgered):
-- SELECT count(*) FROM (VALUES
--   ('202607110230_vendor_qbo_parity.sql'),
--   ('202607110240_customer_qbo_parity.sql'),
--   ('202607200000_bill_lines_load_id.sql'),
--   ('202607210000_detention_requests_invoice_fk.sql'),
--   ('202607220000_bills_mdata_vendor_fk.sql'),
--   ('202607230000_work_orders_unit_driver_fk.sql'),
--   ('202607240000_incidents_auto_claim_fk.sql'),
--   ('202607250000_phase4_crossmodule_fks.sql')
-- ) v(fn)
-- WHERE NOT EXISTS (SELECT 1 FROM _system._schema_migrations s WHERE s.filename=v.fn)
--    OR NOT EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations a WHERE a.name=v.fn);

BEGIN;

-- 202607110230_vendor_qbo_parity.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607110230_vendor_qbo_parity.sql', '501ca24359cd1f2e3655570ecba3b3336f083af3a66ee3d375261c373690608e', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607110230_vendor_qbo_parity.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607110240_customer_qbo_parity.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607110240_customer_qbo_parity.sql', '0ac098f7435448b35b312ca3ae6db4f3700437fe4bb00a27431990ff9ddc0097', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607110240_customer_qbo_parity.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607200000_bill_lines_load_id.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607200000_bill_lines_load_id.sql', '88cae4b1eaf5c52fd38c247bda977cf4df5ff4b30188aa2c2831ee54f75e891b', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607200000_bill_lines_load_id.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607210000_detention_requests_invoice_fk.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607210000_detention_requests_invoice_fk.sql', '42473c9aaf11e1f07d439babdcfc07b98e955bb6386ab2adf2e27c08b391cae8', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607210000_detention_requests_invoice_fk.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607220000_bills_mdata_vendor_fk.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607220000_bills_mdata_vendor_fk.sql', '92797e8693266e2b09a4ae03282bc101c7cfaf9d8d4543a0ec71725071dd8ec8', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607220000_bills_mdata_vendor_fk.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607230000_work_orders_unit_driver_fk.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607230000_work_orders_unit_driver_fk.sql', '072e86e9d1d0ea6f9f6a3381780082557129480943b7df3fff6dd782e3d554ac', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607230000_work_orders_unit_driver_fk.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607240000_incidents_auto_claim_fk.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607240000_incidents_auto_claim_fk.sql', '01479ab1124359cf811ee2901cf86d63a1340ee3f350d9756a93e843dda614ee', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607240000_incidents_auto_claim_fk.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

-- 202607250000_phase4_crossmodule_fks.sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('202607250000_phase4_crossmodule_fks.sql', '77600d6fd260c3e89464ce3e77ff84dc60e41e6e123e63ffc48a2229eb9d0358', now(), 'ceremony-backfill-2026-07-11', 0)
ON CONFLICT (filename) DO NOTHING;
INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('202607250000_phase4_crossmodule_fks.sql', now(), 'ceremony-backfill-2026-07-11')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- POST-FLIGHT (expect 0 rows = all 8 dual-ledgered):
-- SELECT v.fn,
--   EXISTS (SELECT 1 FROM _system._schema_migrations s WHERE s.filename=v.fn) AS in_system,
--   EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations a WHERE a.name=v.fn) AS in_app
-- FROM (VALUES
--   ('202607110230_vendor_qbo_parity.sql'),
--   ('202607110240_customer_qbo_parity.sql'),
--   ('202607200000_bill_lines_load_id.sql'),
--   ('202607210000_detention_requests_invoice_fk.sql'),
--   ('202607220000_bills_mdata_vendor_fk.sql'),
--   ('202607230000_work_orders_unit_driver_fk.sql'),
--   ('202607240000_incidents_auto_claim_fk.sql'),
--   ('202607250000_phase4_crossmodule_fks.sql')
-- ) v(fn) WHERE NOT (EXISTS (SELECT 1 FROM _system._schema_migrations s WHERE s.filename=v.fn)
--               AND EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations a WHERE a.name=v.fn));
