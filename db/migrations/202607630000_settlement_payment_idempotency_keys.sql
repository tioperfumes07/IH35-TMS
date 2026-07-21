-- Settlement payment idempotency keys (FOUNDATION-FIRST Priority 2 / Phase 1)
--
-- Additive schema for the double-pay fix (Phase 2 code PR). Prod-verified 2026-07-21 on
-- br-fancy-credit-akjnd07a: driver_finance.settlement_payment_events has NO unique key beyond the
-- PK (a re-run/loser can write a duplicate transition event), and driver_finance.driver_settlements
-- has NO rail-boundary idempotency key (a retry after partial failure in markSentToBank can release
-- a duplicate ACH instruction). Both tables are 0 rows on prod (window open) — pure additive DDL,
-- no backfill.
--
-- Design notes (vs the Phase 0 doc's sketch of a bare (settlement_id, event_type) unique key):
-- the payment state machine legally CYCLES — bounced -> queued -> sent_to_bank can repeat — so
-- 'queued'/'sent'/'bounced'/'retried' events are legitimately repeatable per settlement and a bare
-- two-column unique key would reject legal re-queues. Therefore:
--   (a) TERMINAL events ('cleared', 'marked_paid_manually') get a bare partial unique key — a
--       settlement can clear or be marked manually paid exactly once, ever.
--   (b) REPEATABLE events get a nullable idempotency_key column + partial unique index; the Phase 2
--       code PR derives one deterministic key per logical transition attempt and inserts with
--       ON CONFLICT DO NOTHING, so a CAS loser / re-run writes NO second event row.
--   (c) The rail boundary gets payment_release_idempotency_key on the settlement header — generated
--       once per release attempt, REUSED on retry, so the bank sees one instruction per release.
--
-- POSTS NOTHING, changes no behavior: columns are nullable, indexes are partial on NOT NULL /
-- terminal values, and current code writes NULL (no conflict possible) until the Phase 2 code PR
-- (build-and-HOLD, separate) starts populating the keys.
--
-- RLS: both tables already carry FORCE ROW LEVEL SECURITY (prod-verified relforcerowsecurity=true);
-- ADD COLUMN / CREATE INDEX preserve it. Grants: columns inherit existing table grants to ih35_app;
-- no new table, no new schema, no grant change.
--
-- Idempotent: IF NOT EXISTS on every statement; safe to apply twice (second run is a clean no-op).
--
-- FINANCIAL CLUSTER (db/migrations, driver_finance.*) — BUILD-AND-HOLD. OWNER APPROVES THE MERGE.
-- DO NOT SELF-MERGE. §1.4.

BEGIN;

-- (b) Per-transition idempotency key for repeatable payment events.
ALTER TABLE driver_finance.settlement_payment_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN driver_finance.settlement_payment_events.idempotency_key IS
  'Deterministic key for one logical payment-state transition attempt (set by settlement-payment.service, Phase 2). Unique per settlement+event_type when present, so a concurrent loser or re-run inserts nothing (ON CONFLICT DO NOTHING). NULL for legacy/untracked events.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payment_events_idem_key
  ON driver_finance.settlement_payment_events (settlement_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- (a) Terminal transitions are once-per-settlement, ever: 'cleared' and 'marked_paid_manually'
-- (validateTransition: cleared -> [], manual_paid -> []). Enforced unconditionally at the DB even
-- if application code regresses.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payment_events_terminal
  ON driver_finance.settlement_payment_events (settlement_id, event_type)
  WHERE event_type IN ('cleared', 'marked_paid_manually');

-- (c) External ACH idempotency key at the rail boundary (markSentToBank).
ALTER TABLE driver_finance.driver_settlements
  ADD COLUMN IF NOT EXISTS payment_release_idempotency_key text;

COMMENT ON COLUMN driver_finance.driver_settlements.payment_release_idempotency_key IS
  'Rail-boundary idempotency key, generated once per payment release attempt (queued -> sent_to_bank) and reused on retry-after-partial-failure so the bank receives exactly one instruction per release. Set by settlement-payment.service (Phase 2). NULL until a release is attempted.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlements_payment_release_key
  ON driver_finance.driver_settlements (payment_release_idempotency_key)
  WHERE payment_release_idempotency_key IS NOT NULL;

COMMIT;
