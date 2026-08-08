-- ACCT-F158 — a bill can name a vendor that does not belong to the bill's own entity, and the
-- database has nothing to say about it.
--
-- FOUND BY: live verification of ACCT-F142 (#4614) on prod br-fancy-credit-akjnd07a, 2026-08-07.
-- The ACCT-F142 duplicate-bill index landed and is live, but it is PARTIAL on
-- `mdata_vendor_id IS NOT NULL`, so it only binds bills whose vendor FK is populated. Checking which
-- write path leaves that column NULL led to `resolveBillVendorWriteColumns` in bills.service.ts,
-- which failed OPEN in two directions. The service half is fixed in the same PR; this migration is
-- the half that cannot be undone by a future writer.
--
-- ROOT CAUSE AT THE DB LAYER — verified on prod (pg_constraint), the only vendor FK on the table is:
--     bills_mdata_vendor_id_fkey  FOREIGN KEY (mdata_vendor_id) REFERENCES mdata.vendors(id)
-- Single-column, so it proves the vendor EXISTS and nothing about WHOSE it is. TRANSP can therefore
-- carry a USMCA vendor on a bill and every referential check in the system passes.
--
-- WHY A COMPOSITE FK AND NOT A GUARD: this is the permanent mechanism (PERMANENT LAW §4 — a DB
-- constraint beats a guard, a guard beats a convention). `mdata.vendors` already carries
-- `uq_vendors_company_id UNIQUE (operating_company_id, id)` (verified on prod), so the composite
-- target exists and no new index is needed. After this, a cross-entity vendor on a bill is not
-- "caught" — it is impossible, including from psql, a backfill, or a write path not yet written.
--
-- BLAST RADIUS — measured, not assumed. On prod, RLS-bypassed in-transaction with the completeness
-- discriminator on the same table (visible 16,258 == n_live_tup 16,258, current_user neondb_owner):
--     bills total .................................... 16,258
--     mdata_vendor_id set but vendor row missing .......... 0
--     mdata_vendor_id set but vendor in ANOTHER entity .... 0
-- So the hole is STRUCTURAL, not yet realised — the same honest framing ACCT-F142 §4 used for
-- bill_payments, and the same reason to close it now rather than after it happens. VALIDATE below
-- is therefore expected to be a clean no-op on prod; if it ever raises, that is a real cross-entity
-- bill and the migration correctly refuses to pretend otherwise.
--
-- The 4 legacy rows with `mdata_vendor_id IS NULL` (USMCA-RB-002, USMCA-TEST-BILL-05,
-- GL-PROOF-BILL-001, f8f8e5a4) are UNAFFECTED: a composite FK is MATCH SIMPLE, so a NULL in any
-- referencing column satisfies it. They are pre-ACCT-F603 TMS-native rows = TEST data under
-- PERMANENT LAW §2; they are left exactly as they are (WORM — never repaired by migration, never
-- deleted). The service fix stops NEW ones being created.
--
-- Idempotent: to_regclass + pg_constraint existence checks on both the ADD and the VALIDATE.

DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NULL OR to_regclass('mdata.vendors') IS NULL THEN
    RAISE NOTICE 'ACCT-F158: accounting.bills or mdata.vendors absent — skipping';
    RETURN;
  END IF;

  -- The composite target must exist before the FK can reference it. It does on prod; asserted here
  -- so a fresh CI database that builds mdata.vendors differently fails loudly instead of silently
  -- skipping the entity check and shipping a database weaker than prod.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.vendors'::regclass
       AND contype IN ('p', 'u')
       AND conkey @> ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'mdata.vendors'::regclass AND attname = 'id'),
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'mdata.vendors'::regclass AND attname = 'operating_company_id')
           ]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'ACCT-F158: mdata.vendors has no UNIQUE/PK over (operating_company_id, id) — cannot install the entity-consistent FK';
  END IF;

  -- §1 — the entity-consistent vendor FK.
  -- NOT VALID first: it binds every new and updated row immediately while taking only a brief lock,
  -- instead of holding the table against 16,258 rows during the ADD.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.bills'::regclass
       AND conname  = 'bills_mdata_vendor_entity_consistent_fkey'
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_mdata_vendor_entity_consistent_fkey
      FOREIGN KEY (operating_company_id, mdata_vendor_id)
      REFERENCES mdata.vendors (operating_company_id, id)
      NOT VALID;
  END IF;

  -- §2 — VALIDATE, so the guarantee covers existing rows too and the constraint is not a
  -- going-forward-only half-measure. Takes SHARE UPDATE EXCLUSIVE only (reads and writes continue).
  -- Measured to affect 0 rows on prod; a failure here is a genuine cross-entity bill, and stopping
  -- the migration is the correct outcome — it must be voided/corrected by a human, never by this file.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.bills'::regclass
       AND conname  = 'bills_mdata_vendor_entity_consistent_fkey'
       AND NOT convalidated
  ) THEN
    ALTER TABLE accounting.bills
      VALIDATE CONSTRAINT bills_mdata_vendor_entity_consistent_fkey;
  END IF;
END
$$;
