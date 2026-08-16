-- BANK-F5330 / P23-BANKING-RAW-UUID-BACKEND-GAPS — accounting.journal_entry_postings.entity_uuid
-- (0092_p5_d4_manual_journal_entries.sql) has always been an UNTYPED polymorphic uuid: plain
-- `uuid`, nullable, no CHECK, no FK, no sibling column recording WHAT KIND of entity it points to.
-- ManualJEModal.tsx's `entity_uuid` field is therefore a raw <input placeholder="Entity UUID">
-- (verify-picker-law-no-raw-uuid.mjs's own exemption on this field: "polymorphic (customer|vendor|
-- driver|unit) with NO sibling entity_type column to drive a picker kind") — an operator cannot
-- know a driver's uuid, and nothing validates the pasted value points at a real row of any kind, in
-- this company, of the kind the line actually means.
--
-- THE FIX: add the missing discriminator, mirroring the repo's own established polymorphic-pair
-- pattern (banking.reconciliation_matches.ledger_entry_kind + ledger_entry_id;
-- accounting.transaction_source_links.linked_object_type + linked_object_id;
-- search.universal_index.entity_type + entity_uuid) — never invented here, copied from precedent.
-- Candidate kinds are exactly what the exemption and the (never-implemented) blueprint's own
-- `entity_uuid (vendor/customer/employee/driver)` comments describe: customer | vendor | driver |
-- unit.
--
-- CONSTRAINT SHAPE: `entity_type` is nullable (a JE line legitimately has no sub-ledger entity —
-- most don't) but is CHECK-paired with `entity_uuid` so one can never be set without the other —
-- an entity_uuid with no declared kind is exactly the ambiguity this migration exists to remove.
--
-- LIVE-VERIFIED SAFE TO ADD THE PAIRED CHECK WITHOUT A BACKFILL: queried prod
-- (accounting.journal_entry_postings) 2026-08-16 — 3871 total rows, 0 with entity_uuid IS NOT NULL.
-- Every existing row already satisfies `(entity_uuid IS NULL) = (entity_type IS NULL)` trivially
-- (both NULL), so the CHECK is safe to add immediately, not just for future rows.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + a DO block that only adds the CHECK constraint when it
-- does not already exist (Postgres has no ADD CONSTRAINT IF NOT EXISTS). No DROP, no data change,
-- no grant change (column inherits the table's existing grants).

BEGIN;

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS entity_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'journal_entry_postings_entity_type_check'
       AND conrelid = 'accounting.journal_entry_postings'::regclass
  ) THEN
    ALTER TABLE accounting.journal_entry_postings
      ADD CONSTRAINT journal_entry_postings_entity_type_check
      CHECK (entity_type IS NULL OR entity_type IN ('customer', 'vendor', 'driver', 'unit'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'journal_entry_postings_entity_pair_check'
       AND conrelid = 'accounting.journal_entry_postings'::regclass
  ) THEN
    ALTER TABLE accounting.journal_entry_postings
      ADD CONSTRAINT journal_entry_postings_entity_pair_check
      CHECK ((entity_uuid IS NULL) = (entity_type IS NULL));
  END IF;
END $$;

COMMIT;
