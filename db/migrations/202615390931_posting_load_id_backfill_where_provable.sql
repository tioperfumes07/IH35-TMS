-- 202615390931_posting_load_id_backfill_where_provable.sql  (CLAIM-RESERVE #24931, CC-3)
-- 363-CC3-A — the provable backfill of accounting.journal_entry_postings.load_id that 202615350500's header assigns to
-- CC-3. CC-2 measured it was never done (docs/bus/10-03-2026-CC-2-FINDING-POSTING-LOAD-ID-NEVER-BACKFILLED.md): 0 of
-- 3,523 USMCA expense / COGS postings carried a load, so the Dispatch load-cost board (U3) and the register's load
-- filter (U23) had to resolve every line through accounting.posting_source_load_id() at read time.
--
-- WHAT IS STAMPED: only what the one resolver PROVES — accounting.posting_source_load_id(source type, id, line,
-- reversal_of_line), the same function every poster stamps with since 202615350500. A posting whose source document is
-- gone (the purge population) resolves NULL and is left alone; nothing is inferred. Measured 2026-10-03 on USMCA:
-- 2,198 provable (expense 1,330 · load 381 · fuel_event 260 · invoice 107 · bill 68 · driver_settlement 28 ·
-- driver_cash_advance 24), every one in an open period (closed_period_cutoff is NULL).
--
-- SAFE AGAINST THE REFUSALS: refuse_posting_fact_update lets load_id be FILLED ONCE from NULL (never repointed or
-- cleared); trg_load_born_posting_carries_its_load passes a posting whose load_id is set. Lineage only — no amount,
-- account or side moves. USMCA only (TRANSPORTATION / TRUCKING are frozen). Idempotent: WHERE load_id IS NULL.
-- Fresh-DB safe: no USMCA -> the UPDATE matches nothing.

-- PASSES: a reversal line resolves its load from the line it reverses (posting_source_load_id's reversal branch), which
-- is itself being stamped here; each pass sees the previous pass's stamps, so it repeats until a pass stamps nothing
-- (originals, then their reversals, then reversals of reversals). Bounded at 6 passes.

BEGIN;

DO $$
DECLARE
  v_pass int := 0;
  v_rows int;
  v_total int := 0;
BEGIN
  LOOP
    v_pass := v_pass + 1;
    WITH provable AS (
      SELECT p.id,
             accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id::text,
                                               p.source_transaction_line_id::text, p.reversal_of_line_id) AS load_id
        FROM accounting.journal_entry_postings p
       WHERE p.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
         AND p.load_id IS NULL
    )
    UPDATE accounting.journal_entry_postings p
       SET load_id = v.load_id
      FROM provable v
     WHERE p.id = v.id
       AND v.load_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = v.load_id AND l.operating_company_id = p.operating_company_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    RAISE NOTICE '202615390931: pass % stamped % posting(s)', v_pass, v_rows;
    EXIT WHEN v_rows = 0 OR v_pass >= 6;
  END LOOP;
  RAISE NOTICE '202615390931: % posting(s) stamped with their proven load', v_total;
END $$;

COMMIT;
