-- ENG-03 (CC-1 443.322) — driver_finance.escrow_ledger rows missing load_id
--
-- Root cause: recordEscrowContribution (settlement-payrun-close.service.ts) wrote the
-- escrow 'hold' ledger row without the settlement_id or load_id even though both were
-- available at the call site. Same gap in settlement-payrun-subledger-unwind.service.ts
-- (escrow 'release' on unwind — settlement_id was written but not load_id).
--
-- Code fix (same PR): both INSERTs now include settlement_id + load_id.
--
-- Backfill strategy:
--   hold rows (56): no settlement_id on existing rows, matched via exact posted_at=created_at
--     timestamp (verified: 54/56 exact, 2 matched via nearest-posted-settlement-for-driver).
--   release rows (2): have settlement_id, backfilled via settlement.first_load_id.
--
-- Guard: scripts/verify-steps/18773-verify-escrow-ledger-row-has-load.mjs (step 18773, live, 0)

-- ── Backfill: hold rows without load_id ──────────────────────────────────────────────
-- Match each hold row to the driver_settlement whose posted_at is closest in time.
-- Uses DISTINCT ON to pick the single nearest settlement per ledger row.
-- MATERIALIZED forces Postgres to evaluate the CTE before the UPDATE so the source
-- scan of escrow_ledger (el2) does not conflict with the UPDATE target (el).
WITH nearest AS MATERIALIZED (
  SELECT DISTINCT ON (el2.id)
    el2.id        AS ledger_id,
    ds.id         AS settlement_id,
    ds.first_load_id
  FROM driver_finance.escrow_ledger el2
  JOIN driver_finance.driver_settlements ds
    ON ds.driver_id               = el2.driver_id
   AND ds.operating_company_id    = el2.operating_company_id
   AND ds.posted_at               IS NOT NULL
   AND ds.first_load_id           IS NOT NULL
  WHERE el2.transaction_type = 'hold'
    AND el2.load_id IS NULL
  ORDER BY el2.id, abs(extract(epoch FROM (el2.created_at - ds.posted_at)))
)
UPDATE driver_finance.escrow_ledger el
SET
  load_id       = nearest.first_load_id,
  settlement_id = nearest.settlement_id
FROM nearest
WHERE el.id = nearest.ledger_id;

-- ── Backfill: release rows with settlement_id but missing load_id ─────────────────────
UPDATE driver_finance.escrow_ledger el
SET load_id = ds.first_load_id
FROM driver_finance.driver_settlements ds
WHERE el.settlement_id = ds.id
  AND el.operating_company_id = ds.operating_company_id
  AND el.load_id IS NULL
  AND ds.first_load_id IS NOT NULL;
