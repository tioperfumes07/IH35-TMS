-- 202615170800_factoring_advance_source_load_and_invoice_autolink.sql
-- CC-2 (band HH 06-08), factoring lane — Lead 2026-10-01 06:50Z ("verify advance -> invoice -> load ... build the missing
-- advance through the factoring engine").
--
-- Measured 2026-10-01: a Faro purchase can happen BEFORE the TMS may invoice (the owner's rule: no invoice on an
-- undelivered load). FAC-2026-00139 (Faro 103, load 13625) and FAC-2026-00140 (Faro 104, load 13626) are real Faro
-- money whose invoices were voided under AUTH-176 for exactly that rule — since then they reach their loads ONLY
-- through notes text. accounting.factoring_advances had no load column at all; the only advance->load path was
-- an invoice. Faro 102 (load 13638) could not be created for the same reason.
--
--   1. factoring_advances.source_load_id — the load a pre-invoice purchase was made against (FK, same company).
--   2. accounting.invoices BEFORE INSERT/UPDATE trigger — when an invoice for that load becomes 'sent' with no advance,
--      it is linked to the load's ONE open pre-invoice advance (factoring_status mirrors the advance's status). Two
--      open candidates -> nothing linked (never a guess). Disputed / voided advances never link.
-- ADDITIVE + IDEMPOTENT. No data written.

BEGIN;

-- Hot tables (accounting.invoices): fail fast instead of queueing behind a long query and blocking every reader
-- behind this DDL (measured 2026-10-01: a queued rehearsal blocked live reads ~2.5 min). A timeout fails the
-- pre-deploy step and the current release stays live; re-run the deploy.
SET LOCAL lock_timeout = '10s';

ALTER TABLE accounting.factoring_advances
  ADD COLUMN IF NOT EXISTS source_load_id uuid NULL REFERENCES mdata.loads(id);

CREATE INDEX IF NOT EXISTS idx_factoring_advances_source_load
  ON accounting.factoring_advances (operating_company_id, source_load_id)
  WHERE source_load_id IS NOT NULL AND voided_at IS NULL;

CREATE OR REPLACE FUNCTION accounting.tg_factoring_advance_load_same_company() RETURNS trigger AS $$
BEGIN
  IF NEW.source_load_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mdata.loads l WHERE l.id = NEW.source_load_id AND l.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'accounting.factoring_advances: load % does not belong to company %', NEW.source_load_id, NEW.operating_company_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factoring_advance_load_same_company ON accounting.factoring_advances;
CREATE TRIGGER trg_factoring_advance_load_same_company
  BEFORE INSERT OR UPDATE OF source_load_id, operating_company_id ON accounting.factoring_advances
  FOR EACH ROW EXECUTE FUNCTION accounting.tg_factoring_advance_load_same_company();

CREATE OR REPLACE FUNCTION accounting.tg_invoice_link_pre_invoice_advance() RETURNS trigger AS $$
DECLARE
  v_count int;
  v_id uuid;
  v_status text;
BEGIN
  IF NEW.status = 'sent' AND NEW.voided_at IS NULL AND NEW.factoring_advance_id IS NULL AND NEW.source_load_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    SELECT count(*), max(a.id::text)::uuid, max(a.status)
      INTO v_count, v_id, v_status
      FROM accounting.factoring_advances a
     WHERE a.operating_company_id = NEW.operating_company_id
       AND a.source_load_id = NEW.source_load_id
       AND a.voided_at IS NULL
       AND a.status NOT IN ('disputed', 'voided')
       AND NOT EXISTS (
         SELECT 1 FROM accounting.invoices i
          WHERE i.factoring_advance_id = a.id AND i.voided_at IS NULL AND i.id <> NEW.id);
    IF v_count = 1 THEN
      NEW.factoring_advance_id := v_id;
      NEW.factoring_status := v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_link_pre_invoice_advance ON accounting.invoices;
CREATE TRIGGER trg_invoice_link_pre_invoice_advance
  BEFORE INSERT OR UPDATE OF status ON accounting.invoices
  FOR EACH ROW EXECUTE FUNCTION accounting.tg_invoice_link_pre_invoice_advance();

COMMIT;
