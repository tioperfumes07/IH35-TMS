-- [HOLD-FOR-JORGE — TIER 1] P2 DB-audit — driver_finance.escrow_ledger FKs point into the RETIRED
-- settlement.settlement family instead of the canonical driver_finance settlement tables.
--
-- *** DO NOT MERGE-AND-RUN. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill so prod db:migrate skips it. Schema change (FK swap) — never self-merge per
--     constitution §1.3/§1.4. ***
--
-- VERIFIED (db/migrations/ + apps/backend/src, read-only) + LIVE PROD DATA-AUDIT (read-only, done by
-- the coordinator under Jorge's supervision, §1.5 — reported back, not run by this agent):
--   * driver_finance.escrow_ledger (202606120600_d1_settlement_approval.sql:139-146) declares:
--         settlement_id      UUID REFERENCES settlement.settlement(id),
--         settlement_line_id UUID REFERENCES settlement.settlement_line(id),
--     Both point into the RETIRED `settlement.*` family (settlement.settlement created
--     202606120100_c1_pre_settlements.sql). Canonical settlement headers/lines are
--     `driver_finance.driver_settlements` (0124_p6_active_drift_reconciliation.sql:68 — PK `id uuid`)
--     and `driver_finance.settlement_lines` (0191_driver_finance_settlement_lines.sql:6-7 — PK `id uuid`;
--     itself already FKs settlement_id → driver_finance.driver_settlements(id)). Both target PKs are
--     `uuid PRIMARY KEY` — type-compatible with escrow_ledger's `uuid` columns. Confirmed the two canonical
--     tables are the real ones (schema-canonicalization-verdicts memory: "settlement headers =
--     driver_finance canonical; deprecate-not-drop settlement.* (dead)").
--   * LIVE PROD DATA-AUDIT (2026-07-05): settlement.settlement = 0 rows; driver_finance.escrow_ledger =
--     0 rows; 0 escrow rows carry a settlement_id. BOTH tables EMPTY → the untangle is SCHEMA-ONLY, no
--     data to move, low risk. A straight DROP-then-ADD FK is safe (nothing to orphan, nothing to fail a
--     NOT-NULL/FK check against — the columns are nullable anyway).
--
-- WHAT THIS MIGRATION DOES (idempotent, no data touched — both tables are empty):
--   Discovers the two existing FK constraints on driver_finance.escrow_ledger by their referenced table
--   (settlement.settlement / settlement.settlement_line) via pg_constraint — NOT by a guessed name, since
--   the inline `REFERENCES` FKs were auto-named at CREATE time. Drops each if present, then adds a
--   named FK to the canonical driver_finance target. Re-runnable: skips the ADD if a FK to the canonical
--   target already exists.
--
-- NOTE (flagged, NOT fixed here — separate follow-up block): the mounted read path
--   apps/backend/src/settlements/pre-settlements.routes.ts (registered in index.ts:124,820) still SELECTs
--   from settlement.settlement / settlement.settlement_line / settlement.settlement_deduction. It reads
--   0 rows today (the tables are empty), so it is not user-visible-broken, but it should be repointed to
--   the canonical driver_finance.driver_settlements / settlement_lines in the SAME follow-up that dispositions
--   the retired settlement.* family. That is a route/code change, out of scope for this schema migration.
--
-- Fresh-DB safe: guarded by to_regclass('driver_finance.escrow_ledger') IS NOT NULL. Never RAISEs.

BEGIN;

DO $$
DECLARE
  v_conname text;
BEGIN
  IF to_regclass('driver_finance.escrow_ledger') IS NOT NULL THEN

    -- ── settlement_id: drop FK(s) into retired settlement.settlement, repoint to canonical ──────────
    FOR v_conname IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel        ON rel.oid = con.conrelid
      JOIN pg_namespace nsp    ON nsp.oid = rel.relnamespace
      JOIN pg_class frel       ON frel.oid = con.confrelid
      JOIN pg_namespace fnsp   ON fnsp.oid = frel.relnamespace
      WHERE nsp.nspname = 'driver_finance'
        AND rel.relname = 'escrow_ledger'
        AND con.contype = 'f'
        AND fnsp.nspname = 'settlement'
        AND frel.relname = 'settlement'
    LOOP
      EXECUTE format('ALTER TABLE driver_finance.escrow_ledger DROP CONSTRAINT %I', v_conname);
    END LOOP;

    IF to_regclass('driver_finance.driver_settlements') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint con
         JOIN pg_class rel      ON rel.oid = con.conrelid
         JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
         JOIN pg_class frel     ON frel.oid = con.confrelid
         JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
         WHERE nsp.nspname = 'driver_finance'
           AND rel.relname = 'escrow_ledger'
           AND con.contype = 'f'
           AND fnsp.nspname = 'driver_finance'
           AND frel.relname = 'driver_settlements'
       ) THEN
      ALTER TABLE driver_finance.escrow_ledger
        ADD CONSTRAINT fk_escrow_ledger_settlement
        FOREIGN KEY (settlement_id)
        REFERENCES driver_finance.driver_settlements(id);
    END IF;

    -- ── settlement_line_id: drop FK(s) into retired settlement.settlement_line, repoint to canonical ─
    FOR v_conname IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel        ON rel.oid = con.conrelid
      JOIN pg_namespace nsp    ON nsp.oid = rel.relnamespace
      JOIN pg_class frel       ON frel.oid = con.confrelid
      JOIN pg_namespace fnsp   ON fnsp.oid = frel.relnamespace
      WHERE nsp.nspname = 'driver_finance'
        AND rel.relname = 'escrow_ledger'
        AND con.contype = 'f'
        AND fnsp.nspname = 'settlement'
        AND frel.relname = 'settlement_line'
    LOOP
      EXECUTE format('ALTER TABLE driver_finance.escrow_ledger DROP CONSTRAINT %I', v_conname);
    END LOOP;

    IF to_regclass('driver_finance.settlement_lines') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint con
         JOIN pg_class rel      ON rel.oid = con.conrelid
         JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
         JOIN pg_class frel     ON frel.oid = con.confrelid
         JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
         WHERE nsp.nspname = 'driver_finance'
           AND rel.relname = 'escrow_ledger'
           AND con.contype = 'f'
           AND fnsp.nspname = 'driver_finance'
           AND frel.relname = 'settlement_lines'
       ) THEN
      ALTER TABLE driver_finance.escrow_ledger
        ADD CONSTRAINT fk_escrow_ledger_settlement_line
        FOREIGN KEY (settlement_line_id)
        REFERENCES driver_finance.settlement_lines(id);
    END IF;

  END IF;
END
$$;

COMMIT;
