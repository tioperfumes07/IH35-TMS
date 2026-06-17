-- MANUAL-PROJECTIONS-V2 Part B — read-only snapshot ref columns on forecast.cash_entries.
-- Income rows carry Unit No / Load No / Customer (auto-filled from a picked load);
-- expense rows carry a Driver/Vendor party. These are DISPLAY SNAPSHOTS only: plain
-- text/uuid, NO foreign keys to any other schema, NO posting/GL. The forecast schema
-- firewall and the per-operating_company RLS policy are unchanged. Idempotent.
ALTER TABLE forecast.cash_entries
  ADD COLUMN IF NOT EXISTS load_ref_id text,
  ADD COLUMN IF NOT EXISTS load_ref_label text,
  ADD COLUMN IF NOT EXISTS unit_ref_label text,
  ADD COLUMN IF NOT EXISTS customer_ref_label text,
  ADD COLUMN IF NOT EXISTS party_ref_kind text,
  ADD COLUMN IF NOT EXISTS party_ref_id text,
  ADD COLUMN IF NOT EXISTS party_ref_label text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_entries_party_ref_kind_chk') THEN
    ALTER TABLE forecast.cash_entries
      ADD CONSTRAINT cash_entries_party_ref_kind_chk
      CHECK (party_ref_kind IS NULL OR party_ref_kind IN ('driver', 'vendor'));
  END IF;
END $$;
