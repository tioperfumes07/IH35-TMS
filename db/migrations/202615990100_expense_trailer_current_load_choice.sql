-- LEAD 443.161 G6 (Codex finding, Lead-authored: verify-migration-lane-band keeps Codex out of migrations).
-- accounting.expenses_trailer_from_load() copied the newest assignment-history row that NAMED a trailer, whatever the load's
-- CURRENT trailer choice was. A load changed to "no trailer" (trailer_source = 'none') or to a customer trailer
-- (trailer_source = 'customer') kept handing its old COMPANY trailer to every new expense — the recorded choice ignored.
-- Measured on prod 2026-10-16: 0 live expenses carry a company trailer on a none/customer load today (preventive; no backfill).
-- History rows with new_trailer_id NULL are driver-only reassignments (181 of 352), not "trailer cleared", so the company
-- path keeps reading the latest row that names a trailer.
-- Rule, in order: (1) the writer's own trailer wins; (2) the load's current choice decides — 'none' → no trailer,
-- 'customer' → the load's non-owned trailer, 'company' or legacy NULL → latest named company trailer; same company only.
-- Function body only (CREATE OR REPLACE); trigger trg_expenses_trailer_from_load unchanged. Idempotent.
SET LOCAL lock_timeout = '60s';

CREATE OR REPLACE FUNCTION accounting.expenses_trailer_from_load() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_source text;
  v_non_owned uuid;
BEGIN
  IF NEW.trailer_id IS NOT NULL OR NEW.load_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT c.enforce_line_categorization FROM org.companies c WHERE c.id = NEW.operating_company_id), false) THEN RETURN NEW; END IF;
  SELECT l.trailer_source, l.non_owned_trailer_id INTO v_source, v_non_owned
    FROM mdata.loads l
   WHERE l.id = NEW.load_id AND l.operating_company_id = NEW.operating_company_id;
  IF v_source = 'none' THEN
    RETURN NEW;
  END IF;
  IF v_source = 'customer' THEN
    IF NEW.non_owned_trailer_id IS NULL THEN NEW.non_owned_trailer_id := v_non_owned; END IF;
    RETURN NEW;
  END IF;
  NEW.trailer_id := (SELECT h.new_trailer_id FROM dispatch.load_assignment_history h
                      WHERE h.load_id = NEW.load_id AND h.operating_company_id = NEW.operating_company_id
                        AND h.new_trailer_id IS NOT NULL
                      ORDER BY h.created_at DESC LIMIT 1);
  RETURN NEW;
END $fn$;
