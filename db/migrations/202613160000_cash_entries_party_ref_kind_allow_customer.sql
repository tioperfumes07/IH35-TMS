-- CASH-ENTRIES-CUSTOMER-PARTY-REF-KIND-CHECK-CONSTRAINT-GAP
--
-- forecast.cash_entries.party_ref_kind was constrained (202606170100) to
-- IS NULL OR IN ('driver', 'vendor') — but the application layer was already built one
-- level ahead of the schema: apps/backend/src/forecast/cash-forecast-manual.routes.ts's own
-- Zod validator already declares party_ref_kind: z.enum(["customer", "driver", "vendor"])
-- with a working customer-lookup branch, and
-- apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx unconditionally sets
-- party_ref_kind: "customer" whenever a pulled invoice has a customer_id — true for
-- essentially every real invoice. Every invoice-income row the "Pull invoices" action tries
-- to create therefore hits `new row for relation "cash_entries" violates check constraint
-- "cash_entries_party_ref_kind_chk"`, 100% of the time, with the raw Postgres error surfaced
-- to the operator (live-verified /cash-flow -> Manual Daily Projections -> Pull invoices, 500).
--
-- forecast.cash_entries's snapshot ref columns are DISPLAY SNAPSHOTS only (plain text/uuid,
-- NO foreign keys, NO posting/GL — see 202606170100's own header) — widening this CHECK is a
-- schema correction matching an already-shipped, already-tested application contract, not a
-- new financial-posting concept. Idempotent: DROP CONSTRAINT IF EXISTS + re-ADD, no data risk,
-- no historical backfill (existing driver/vendor/NULL rows remain valid under the wider set).
DO $$
BEGIN
  ALTER TABLE forecast.cash_entries DROP CONSTRAINT IF EXISTS cash_entries_party_ref_kind_chk;
  ALTER TABLE forecast.cash_entries
    ADD CONSTRAINT cash_entries_party_ref_kind_chk
    CHECK (party_ref_kind IS NULL OR party_ref_kind IN ('driver', 'vendor', 'customer'));
END $$;
