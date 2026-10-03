-- 202615330931 · CC-3 · ROUND 363-CC3-A (ruling 00-LEAD-RULING-2026-10-03-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID:
-- "CC-3 owns the refusals, the provable backfill, the guard and the finish test"). LAW 363.2: the load a GL line
-- belongs to is stamped on the posting by the poster; a load-born row written with a NULL load is REFUSED in the
-- database.
--
-- Measured on prod 2026-10-03 (direct endpoint, unscoped): every one of the 11 `INSERT INTO
-- accounting.journal_entry_postings` sites names load_id (8 through accounting.posting_source_load_id, 3 NULL by design
-- — bank-reconciliation variance, retained-earnings close, recurring template — whose source types resolve to no load
-- on all 6 + 775 + 46 existing rows). Load-born documents today: from_load invoices 113 (1 USMCA + 2 frozen with no
-- load, written by a script on 2026-09-30, never by the app), driver_finance.driver_bills 140 / 0 null,
-- load_revenue_recognition_postings 253 / 0 null, dispatch.load_charge_lines 284 / 0 null.
--
-- The refusals are NARROW on purpose and refuse only what is provably wrong:
--   POSTING  — at COMMIT (deferred): a posting INSERTed (or whose load / source columns are UPDATEd) whose resolver
--              names a load while its load_id is NULL. A load that merely differs is not refused (a poster may write
--              its postings before the document line that decides the load, in the same transaction) — the guard
--              reports that. A reversal of a pre-stamp line resolves to NULL (its original carries none), so voiding
--              an old document can never fail here. Rows deleted before COMMIT (the governed purge) are skipped.
--   DOCUMENT — a from_load invoice, a driver bill, a revenue-recognition posting or a load charge line INSERTed with no
--              load, or UPDATEd from a load to none. Existing rows are never re-judged: a void, a payment or a status
--              change on one of the 3 pre-existing load-less invoices still commits.
-- All load FKs are NO ACTION / RESTRICT (measured), so no cascade can clear a load behind these triggers.
-- Idempotent.

SET LOCAL search_path TO pg_catalog, public;

CREATE OR REPLACE FUNCTION accounting.refuse_load_born_posting_without_load()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  p accounting.journal_entry_postings%ROWTYPE;
  want uuid;
BEGIN
  SELECT * INTO p FROM accounting.journal_entry_postings WHERE id = NEW.id;
  IF NOT FOUND OR p.load_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  want := accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id::text,
                                            p.source_transaction_line_id::text, p.reversal_of_line_id);
  IF want IS NOT NULL THEN
    RAISE EXCEPTION 'posting % (% %) belongs to load % but was written with load_id NULL — stamp it with accounting.posting_source_load_id() in the INSERT (LAW 363.2)',
      p.id, p.source_transaction_type, p.source_transaction_id, want
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_load_born_posting_carries_its_load ON accounting.journal_entry_postings;
CREATE CONSTRAINT TRIGGER trg_load_born_posting_carries_its_load
  AFTER INSERT OR UPDATE OF load_id, source_transaction_type, source_transaction_id, source_transaction_line_id, reversal_of_line_id
  ON accounting.journal_entry_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_load_born_posting_without_load();

-- One function for the four load-born documents; TG_ARGV[0] names the load column, TG_ARGV[1] the condition (if any)
-- that makes the row load-born.
CREATE OR REPLACE FUNCTION accounting.refuse_load_born_document_without_load()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  col text := TG_ARGV[0];
  newj jsonb := to_jsonb(NEW);
  oldj jsonb;
  load_born boolean;
BEGIN
  load_born := CASE TG_ARGV[1] WHEN 'from_load' THEN newj ->> 'invoice_type' = 'from_load' ELSE true END;
  IF NOT load_born OR newj ->> col IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    oldj := to_jsonb(OLD);
    -- Only a change that TAKES the load away (or makes a load-less row load-born) is refused; a row that was already
    -- load-less before this statement is never re-judged.
    IF oldj ->> col IS NULL
       AND (TG_ARGV[1] IS DISTINCT FROM 'from_load' OR oldj ->> 'invoice_type' = 'from_load') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% % is load-born but has no % — a load-born document is written with its load (LAW 363.2 / ROUND 363-CC3-A)',
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, newj ->> 'id', col
    USING ERRCODE = '23514';
END
$$;

DROP TRIGGER IF EXISTS trg_from_load_invoice_carries_its_load ON accounting.invoices;
CREATE TRIGGER trg_from_load_invoice_carries_its_load
  BEFORE INSERT OR UPDATE OF source_load_id, invoice_type ON accounting.invoices
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_load_born_document_without_load('source_load_id', 'from_load');

DROP TRIGGER IF EXISTS trg_driver_bill_carries_its_load ON driver_finance.driver_bills;
CREATE TRIGGER trg_driver_bill_carries_its_load
  BEFORE INSERT OR UPDATE OF load_id ON driver_finance.driver_bills
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_load_born_document_without_load('load_id', 'always');

DROP TRIGGER IF EXISTS trg_revrec_posting_carries_its_load ON accounting.load_revenue_recognition_postings;
CREATE TRIGGER trg_revrec_posting_carries_its_load
  BEFORE INSERT OR UPDATE OF load_id ON accounting.load_revenue_recognition_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_load_born_document_without_load('load_id', 'always');

DROP TRIGGER IF EXISTS trg_load_charge_line_carries_its_load ON dispatch.load_charge_lines;
CREATE TRIGGER trg_load_charge_line_carries_its_load
  BEFORE INSERT OR UPDATE OF load_id ON dispatch.load_charge_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_load_born_document_without_load('load_id', 'always');
