-- ACCT-F11093 / register row 22 (R215) "Escrow register: all same date/source, no load numbers; escrow is per load".
--
-- WHAT WAS WRONG (measured 2026-11-03 on prod, USMCA): accounting.escrow_postings had no load and no document date.
-- The writer (recordEscrowPostingOnly / postEscrowTransactionOnClient) stamped posted_at = now(), so the 62 USMCA
-- postings showed 5 distinct dates (37 on 10-11-2026, the day the settlements were posted) while their own journal
-- entries carry 38 distinct document dates (2026-08-10 .. 2026-10-24). The register guessed the load at READ time from
-- the settlement's active escrow_contribution lines; 53 of those per-load lines had been voided as "SET-24 LINE-DUP"
-- (grouped without load_id, so per-load lines of the same $25 read as duplicates), so the register showed $1,600.00 of
-- the $3,325.00 deposited and folded the rest into the "Opening balance" row.
--
-- THE FIX (root): the WRITER records the facts. escrow_postings.document_date = the posting's document date (its
-- journal entry's entry_date), and accounting.escrow_posting_loads = the per-load split of each posting (load, source
-- settlement line, cents), written in the same transaction as the posting. escrow_postings stays append-only (its
-- BEFORE UPDATE trigger refuses any update), so existing postings are never edited: their loads land in
-- escrow_posting_loads (origin 'backfill', from the settlement lines they were posted from), and their document date
-- is read from their own journal entry.
--
-- No data in this file (USMCA backfill is run separately, audited per row; frozen entities are not touched).
-- Idempotent. Append-only. RLS forced, entity-scoped (0065 pattern).

ALTER TABLE accounting.escrow_postings ADD COLUMN IF NOT EXISTS document_date date NULL;
COMMENT ON COLUMN accounting.escrow_postings.document_date IS
  'ACCT-F11093: the escrow movement''s document date (its journal entry entry_date, the settlement period end for a settlement contribution). Set by the writer at insert. NULL only on rows written before 2026-11-03 (read their linked JE entry_date).';

CREATE TABLE IF NOT EXISTS accounting.escrow_posting_loads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  escrow_posting_id     uuid NOT NULL REFERENCES accounting.escrow_postings(id),
  load_id               uuid NOT NULL,
  settlement_line_id    uuid NULL REFERENCES driver_finance.settlement_lines(id),
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  document_date         date NOT NULL,
  origin                text NOT NULL CHECK (origin IN ('writer', 'backfill')),
  evidence              text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid NULL REFERENCES identity.users(id),
  CONSTRAINT escrow_posting_loads_load_fk FOREIGN KEY (operating_company_id, load_id)
    REFERENCES mdata.loads(operating_company_id, id),
  CONSTRAINT escrow_posting_loads_backfill_evidence CHECK (origin = 'writer' OR btrim(coalesce(evidence, '')) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS escrow_posting_loads_posting_load_key
  ON accounting.escrow_posting_loads (escrow_posting_id, load_id);
CREATE INDEX IF NOT EXISTS escrow_posting_loads_load ON accounting.escrow_posting_loads (operating_company_id, load_id);

COMMENT ON TABLE accounting.escrow_posting_loads IS
  'ACCT-F11093: per-load split of an accounting.escrow_postings row (escrow is per load). Written by recordEscrowPostingOnly in the posting''s own transaction. origin=backfill rows came from the source settlement lines. Append-only.';

-- The split never exceeds its posting, and the posting belongs to the same entity.
CREATE OR REPLACE FUNCTION accounting.check_escrow_posting_load_split()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_amount bigint;
  v_opco uuid;
  v_split bigint;
BEGIN
  SELECT amount_cents, operating_company_id INTO v_amount, v_opco
    FROM accounting.escrow_postings WHERE id = NEW.escrow_posting_id;
  IF v_opco IS DISTINCT FROM NEW.operating_company_id THEN
    RAISE EXCEPTION 'escrow_posting_loads: posting % is not in entity %', NEW.escrow_posting_id, NEW.operating_company_id;
  END IF;
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_split
    FROM accounting.escrow_posting_loads WHERE escrow_posting_id = NEW.escrow_posting_id;
  IF v_split > v_amount THEN
    RAISE EXCEPTION 'escrow_posting_loads: split % cents exceeds posting % amount % cents', v_split, NEW.escrow_posting_id, v_amount;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.prevent_escrow_posting_load_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'accounting.escrow_posting_loads is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_check_escrow_posting_load_split ON accounting.escrow_posting_loads;
CREATE TRIGGER trg_check_escrow_posting_load_split AFTER INSERT ON accounting.escrow_posting_loads
  FOR EACH ROW EXECUTE FUNCTION accounting.check_escrow_posting_load_split();
DROP TRIGGER IF EXISTS trg_no_update_escrow_posting_loads ON accounting.escrow_posting_loads;
CREATE TRIGGER trg_no_update_escrow_posting_loads BEFORE UPDATE OR DELETE ON accounting.escrow_posting_loads
  FOR EACH ROW EXECUTE FUNCTION accounting.prevent_escrow_posting_load_mutation();
DROP TRIGGER IF EXISTS tg_audit_row_escrow_posting_loads ON accounting.escrow_posting_loads;
CREATE TRIGGER tg_audit_row_escrow_posting_loads AFTER INSERT OR UPDATE OR DELETE ON accounting.escrow_posting_loads
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

ALTER TABLE accounting.escrow_posting_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.escrow_posting_loads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS escrow_posting_loads_company_scope ON accounting.escrow_posting_loads;
CREATE POLICY escrow_posting_loads_company_scope ON accounting.escrow_posting_loads FOR ALL
  USING ((operating_company_id)::text = current_setting('app.operating_company_id', true)
         OR current_setting('app.bypass_rls', true) = 'lucia')
  WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true)
         OR current_setting('app.bypass_rls', true) = 'lucia');

-- Same privileges as accounting.escrow_postings: append-only.
GRANT SELECT, INSERT ON accounting.escrow_posting_loads TO ih35_app;
REVOKE UPDATE, DELETE ON accounting.escrow_posting_loads FROM ih35_app;
