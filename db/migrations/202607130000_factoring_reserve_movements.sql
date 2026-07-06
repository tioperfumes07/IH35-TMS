-- [HOLD-FOR-JORGE — TIER 1] CONN-2 — Faro Factoring Reserves per-advance movement ledger.
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" — runs on a Neon branch first, then
-- ledger-backfilled (§1.4). FACTORING_GL_POSTING_ENABLED stays OFF at merge. ***
--
-- WHY: CODER-34 (PR #1770, migration 202607013000, merged) built the secured-borrowing GL poster —
-- funding DEBITS `factor_reserve_held` (asset) and release CREDITS it — but there was no dedicated
-- per-advance reserve LEDGER, only the GL role-account balance (memo-string parsing required to see
-- which advance a reserve dollar belongs to). This mirrors the exact pattern already shipped for
-- default-interest (accounting.factoring_default_interest_accruals, migration 202607060000): one
-- append-only ledger row per reserve movement, linked forward to the advance and the posted JE, so the
-- Faro Reserve Tracker (per-advance + aggregate) can read a structural ledger instead of parsing memos —
-- TOTAL CONNECTIVITY forward+reverse (Law of the Land §10a).
--
-- SCOPE: storage only. No new GL math — the JE these rows describe is the SAME funding/release JE
-- poster.service.ts already builds via createJournalEntry (reused verbatim); this table just RECORDS
-- that a reserve amount moved, keyed to (advance, movement_type), for reporting/reconciliation.
--
-- Idempotent, CREATE-only, entity-scoped FORCED RLS, void-not-delete (is_active + no DELETE grant, same
-- REVOKE pattern as 202607060000). Never self-merge — show full SQL, wait for Jorge's "OK to merge".

BEGIN;

CREATE SCHEMA IF NOT EXISTS accounting;

-- ── factoring_reserve_movements — one row per reserve HELD (at funding) / RELEASED (at release) /
--    ADJUSTED (a rare manual correction, Owner/Admin only at the route layer) event ────────────────────
CREATE TABLE IF NOT EXISTS accounting.factoring_reserve_movements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  factoring_advance_id  uuid NOT NULL REFERENCES accounting.factoring_advances(id),
  movement_type         text NOT NULL CHECK (movement_type IN ('held', 'released', 'adjusted')),
  amount_cents          bigint NOT NULL CHECK (amount_cents >= 0),
  movement_date         date NOT NULL,
  journal_entry_id      uuid,                          -- link to the posted accounting.journal_entries row
  notes                 text,
  is_active             boolean NOT NULL DEFAULT true, -- void-not-delete
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),
  -- idempotency spine: at most ONE 'held' and ONE 'released' movement per advance (a re-run finds it and
  -- no-ops); 'adjusted' rows are intentionally unconstrained (each correction is its own row, audited).
  CONSTRAINT factoring_reserve_movements_advance_type_uk
    UNIQUE (operating_company_id, factoring_advance_id, movement_type)
);

CREATE INDEX IF NOT EXISTS factoring_reserve_movements_advance_idx
  ON accounting.factoring_reserve_movements (factoring_advance_id, movement_date)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS factoring_reserve_movements_je_idx
  ON accounting.factoring_reserve_movements (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS factoring_reserve_movements_company_idx
  ON accounting.factoring_reserve_movements (operating_company_id, movement_date DESC)
  WHERE is_active;

-- ── Entity-scoped FORCED RLS (canonical predicate; bypass for the is_lucia_bypass() poster path) ─────
ALTER TABLE accounting.factoring_reserve_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_reserve_movements FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_reserve_movements_entity_all
  ON accounting.factoring_reserve_movements;
CREATE POLICY factoring_reserve_movements_entity_all
  ON accounting.factoring_reserve_movements FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- ── Grants: SELECT/INSERT/UPDATE only — NO DELETE (append-only / void-not-delete). accounting.* default
--    privileges may auto-grant DELETE, so REVOKE it explicitly. REVOKE trips the hold-merge-gate → correct:
--    this is a HOLD migration. ─────────────────────────────────────────────────────────────────────────
GRANT  USAGE ON SCHEMA accounting TO ih35_app;
GRANT  SELECT, INSERT, UPDATE ON accounting.factoring_reserve_movements TO ih35_app;
REVOKE DELETE ON accounting.factoring_reserve_movements FROM ih35_app;

-- ── views.factoring_reserve_balances — per-advance reserve balance (held − released), reconciling the
--    ledger above to the GL's factor_reserve_held role-account balance. security_invoker=true.
CREATE OR REPLACE VIEW views.factoring_reserve_balances
WITH (security_invoker = true)
AS
SELECT
  fa.id AS factoring_advance_id,
  fa.operating_company_id,
  fa.display_id,
  fa.status,
  COALESCE((
    SELECT SUM(m.amount_cents) FROM accounting.factoring_reserve_movements m
    WHERE m.factoring_advance_id = fa.id AND m.movement_type = 'held' AND m.is_active
  ), 0)::bigint AS reserve_held_cents,
  COALESCE((
    SELECT SUM(m.amount_cents) FROM accounting.factoring_reserve_movements m
    WHERE m.factoring_advance_id = fa.id AND m.movement_type = 'released' AND m.is_active
  ), 0)::bigint AS reserve_released_cents,
  (
    COALESCE((
      SELECT SUM(m.amount_cents) FROM accounting.factoring_reserve_movements m
      WHERE m.factoring_advance_id = fa.id AND m.movement_type = 'held' AND m.is_active
    ), 0)
    - COALESCE((
      SELECT SUM(m.amount_cents) FROM accounting.factoring_reserve_movements m
      WHERE m.factoring_advance_id = fa.id AND m.movement_type = 'released' AND m.is_active
    ), 0)
  )::bigint AS reserve_outstanding_cents
FROM accounting.factoring_advances fa;

GRANT SELECT ON views.factoring_reserve_balances TO ih35_app;

COMMIT;
