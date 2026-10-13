-- 202615850910 — LEAD 443.121 #1 (owner law 2026-10-12: fix the engine, never patch): ONE fuel receipt identity.
--
-- WHY: a fuel receipt can post through three writers — the import / receipt poster and the bank match (posting batch
-- source 'fuel_event', keyed on the fill) and the Settlement Creator's fuel expense document (source 'expense', keyed on the
-- expense). Bank match looked only for a 'fuel_event' posting, so a Dreamline fill the Creator had already posted as an
-- expense could be posted AGAIN when its card bank line was matched. Measured on prod before this migration (read-only):
-- 0 receipts carry more than one live posting (USMCA 568 live fuel postings, TRANSP 1,556) — the risk was latent.
--
-- WHAT:
--   * fuel.fuel_receipt_key(company, source_type, source_id) — the receipt a posting source belongs to:
--       a Relay fill (or a fuel row linked to one)           -> 'relay:<Relay transaction id>'
--       a fuel row with a provider transaction id            -> 'provider:<vendor>:<base invoice>:<fuel type>'
--                                                              (base invoice = providerTransactionId: '<digits>' with an
--                                                               optional '-1NNNN' load suffix stripped; one product line
--                                                               per fuel type, as fuel-provider-reference.ts)
--       any other fuel row                                   -> 'fuel_txn:<id>'
--       an expense document made from a fuel row             -> that fuel row's key
--       anything else                                        -> NULL (not a fuel receipt)
--   * fuel.fuel_receipt_postings — one row per fuel posting batch; UNIQUE (company, receipt_key) among LIVE rows. The row is
--     written by a trigger on accounting.posting_batches INSERT, so EVERY writer registers — including a path that forgets —
--     and a second live posting for the same receipt is refused by the database (23505 fuel_receipt_already_posted).
--   * A receipt is released (may post again; released_at set — the audit trigger keeps the before/after) when its posting is
--     reversed or voided: JE-level (reverses_je_id inserted /
--     reversed_by_je_id or voided_at set) or line-level (reversed_by_line_id set), or when the batch ends not posted.
--   * Backfill: every live posted fuel batch today (derived, deterministic; refuses to run if any receipt is duplicated).
--
-- Idempotent: CREATE IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS; the backfill skips registered batches.

CREATE TABLE IF NOT EXISTS fuel.fuel_receipt_postings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id    uuid NOT NULL REFERENCES org.companies(id),
  receipt_key             text NOT NULL,
  posting_batch_id        uuid NOT NULL REFERENCES accounting.posting_batches(id),
  released_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_receipt_postings_batch_uk UNIQUE (posting_batch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fuel_receipt_postings_one_live_uk
  ON fuel.fuel_receipt_postings (operating_company_id, receipt_key)
  WHERE released_at IS NULL;

COMMENT ON TABLE fuel.fuel_receipt_postings IS
  'LEAD 443.121 #1 — one live fuel posting per receipt (provider + base invoice), across import, Settlement Creator and bank match. Written by trigger on accounting.posting_batches; released when the posting is reversed / voided.';

ALTER TABLE fuel.fuel_receipt_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.fuel_receipt_postings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fuel_receipt_postings_entity_scope ON fuel.fuel_receipt_postings;
CREATE POLICY fuel_receipt_postings_entity_scope ON fuel.fuel_receipt_postings
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT USAGE ON SCHEMA fuel TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON fuel.fuel_receipt_postings TO ih35_app;

DO $audit$
BEGIN
  IF to_regprocedure('audit.tg_audit_row()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_fuel_receipt_postings ON fuel.fuel_receipt_postings';
    EXECUTE 'CREATE TRIGGER trg_audit_fuel_receipt_postings AFTER INSERT OR UPDATE OR DELETE ON fuel.fuel_receipt_postings
             FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()';
  END IF;
END
$audit$;

-- The receipt a fuel row belongs to (see header). SECURITY DEFINER-free, STABLE, same-company only.
CREATE OR REPLACE FUNCTION fuel.fuel_row_receipt_key(p_company uuid, p_fuel_transaction_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE
           WHEN ft.relay_fuel_transaction_id IS NOT NULL THEN
             'relay:' || (SELECT r.transaction_id FROM integrations.relay_fuel_transactions r
                           WHERE r.id = ft.relay_fuel_transaction_id AND r.operating_company_id = p_company)
           WHEN substring(btrim(ft.transaction_reference) FROM '^([0-9]+)(?:-1[0-9]{4})?$') IS NOT NULL THEN
             'provider:' || coalesce(ft.vendor_id::text, 'no-vendor') || ':'
               || substring(btrim(ft.transaction_reference) FROM '^([0-9]+)(?:-1[0-9]{4})?$') || ':'
               || coalesce(ft.fuel_type::text, '')
           ELSE 'fuel_txn:' || ft.id::text
         END
    FROM fuel.fuel_transactions ft
   WHERE ft.id = p_fuel_transaction_id AND ft.operating_company_id = p_company
$fn$;

CREATE OR REPLACE FUNCTION fuel.fuel_receipt_key(p_company uuid, p_source_type text, p_source_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_id uuid;
  v_key text;
BEGIN
  IF p_source_type NOT IN ('fuel_event', 'expense') OR p_source_id IS NULL
     OR p_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  v_id := p_source_id::uuid;
  IF p_source_type = 'fuel_event' THEN
    SELECT 'relay:' || r.transaction_id INTO v_key
      FROM integrations.relay_fuel_transactions r
     WHERE r.id = v_id AND r.operating_company_id = p_company;
    IF v_key IS NOT NULL THEN RETURN v_key; END IF;
    RETURN fuel.fuel_row_receipt_key(p_company, v_id);
  END IF;
  -- 'expense': only an expense document made from a fuel row is a fuel receipt.
  RETURN (SELECT fuel.fuel_row_receipt_key(p_company, e.source_fuel_transaction_id)
            FROM accounting.expenses e
           WHERE e.id = v_id AND e.operating_company_id = p_company AND e.source_fuel_transaction_id IS NOT NULL);
END
$fn$;

COMMENT ON FUNCTION fuel.fuel_receipt_key(uuid, text, text) IS
  'LEAD 443.121 #1 — the fuel receipt a posting source belongs to (relay:<txn> | provider:<vendor>:<base invoice>:<type> | fuel_txn:<id>), NULL when the source is not a fuel receipt.';

-- Register every fuel posting batch; a second live posting for the same receipt is refused here.
CREATE OR REPLACE FUNCTION fuel.tg_register_fuel_receipt_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_key text;
  v_existing uuid;
BEGIN
  v_key := fuel.fuel_receipt_key(NEW.operating_company_id, NEW.source_transaction_type::text, NEW.source_transaction_id::text);
  IF v_key IS NULL THEN RETURN NEW; END IF;
  SELECT posting_batch_id INTO v_existing
    FROM fuel.fuel_receipt_postings
   WHERE operating_company_id = NEW.operating_company_id AND receipt_key = v_key AND released_at IS NULL
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'fuel_receipt_already_posted: receipt % already has live posting batch % — match or adopt it, never post it again', v_key, v_existing
      USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO fuel.fuel_receipt_postings (operating_company_id, receipt_key, posting_batch_id)
  VALUES (NEW.operating_company_id, v_key, NEW.id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_register_fuel_receipt_posting ON accounting.posting_batches;
CREATE TRIGGER trg_register_fuel_receipt_posting
  AFTER INSERT ON accounting.posting_batches
  FOR EACH ROW
  WHEN (NEW.source_transaction_type::text IN ('fuel_event', 'expense'))
  EXECUTE FUNCTION fuel.tg_register_fuel_receipt_posting();

-- A batch that ends not posted frees its receipt.
CREATE OR REPLACE FUNCTION fuel.tg_release_fuel_receipt_on_batch_status()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.batch_status::text NOT IN ('in_progress', 'posted') THEN
    UPDATE fuel.fuel_receipt_postings
       SET released_at = now()
     WHERE posting_batch_id = NEW.id AND released_at IS NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_release_fuel_receipt_on_batch_status ON accounting.posting_batches;
CREATE TRIGGER trg_release_fuel_receipt_on_batch_status
  AFTER UPDATE OF batch_status ON accounting.posting_batches
  FOR EACH ROW
  WHEN (NEW.source_transaction_type::text IN ('fuel_event', 'expense') AND NEW.batch_status IS DISTINCT FROM OLD.batch_status)
  EXECUTE FUNCTION fuel.tg_release_fuel_receipt_on_batch_status();

-- A reversed / voided journal entry frees the receipts of the batches it carries.
CREATE OR REPLACE FUNCTION fuel.release_fuel_receipts_of_je(p_je uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  UPDATE fuel.fuel_receipt_postings rp
     SET released_at = now()
   WHERE rp.released_at IS NULL
     AND rp.posting_batch_id IN (SELECT DISTINCT p.posting_batch_id FROM accounting.journal_entry_postings p
                                  WHERE p.journal_entry_uuid = p_je AND p.posting_batch_id IS NOT NULL);
$fn$;

CREATE OR REPLACE FUNCTION fuel.tg_release_fuel_receipt_on_je()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reverses_je_id IS NOT NULL THEN PERFORM fuel.release_fuel_receipts_of_je(NEW.reverses_je_id); END IF;
  ELSE
    IF NEW.reversed_by_je_id IS NOT NULL AND OLD.reversed_by_je_id IS NULL THEN PERFORM fuel.release_fuel_receipts_of_je(NEW.id); END IF;
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN PERFORM fuel.release_fuel_receipts_of_je(NEW.id); END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_release_fuel_receipt_on_je_insert ON accounting.journal_entries;
CREATE TRIGGER trg_release_fuel_receipt_on_je_insert
  AFTER INSERT ON accounting.journal_entries
  FOR EACH ROW WHEN (NEW.reverses_je_id IS NOT NULL)
  EXECUTE FUNCTION fuel.tg_release_fuel_receipt_on_je();
DROP TRIGGER IF EXISTS trg_release_fuel_receipt_on_je_update ON accounting.journal_entries;
CREATE TRIGGER trg_release_fuel_receipt_on_je_update
  AFTER UPDATE OF reversed_by_je_id, voided_at ON accounting.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION fuel.tg_release_fuel_receipt_on_je();

-- Line-level reversal (the oldest reversal link) frees the batch too.
CREATE OR REPLACE FUNCTION fuel.tg_release_fuel_receipt_on_line_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.posting_batch_id IS NOT NULL THEN
    UPDATE fuel.fuel_receipt_postings
       SET released_at = now()
     WHERE posting_batch_id = NEW.posting_batch_id AND released_at IS NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_release_fuel_receipt_on_line_reversal ON accounting.journal_entry_postings;
CREATE TRIGGER trg_release_fuel_receipt_on_line_reversal
  AFTER UPDATE OF reversed_by_line_id ON accounting.journal_entry_postings
  FOR EACH ROW WHEN (NEW.reversed_by_line_id IS NOT NULL AND OLD.reversed_by_line_id IS NULL)
  EXECUTE FUNCTION fuel.tg_release_fuel_receipt_on_line_reversal();

-- Backfill: every LIVE posted fuel batch (JE not reversed / voided, no reversed line). Refuses if a receipt is duplicated.
DO $backfill$
DECLARE
  v_dups int;
BEGIN
  CREATE TEMP TABLE _fuel_receipt_live ON COMMIT DROP AS
  SELECT b.id AS batch_id, b.operating_company_id,
         fuel.fuel_receipt_key(b.operating_company_id, b.source_transaction_type::text, b.source_transaction_id::text) AS rk
    FROM accounting.posting_batches b
   WHERE b.source_transaction_type::text IN ('fuel_event', 'expense')
     AND b.batch_status::text = 'posted'
     AND NOT EXISTS (SELECT 1 FROM fuel.fuel_receipt_postings rp WHERE rp.posting_batch_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                       JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
                      WHERE p.posting_batch_id = b.id
                        AND (j.reversed_by_je_id IS NOT NULL OR j.voided_at IS NOT NULL OR p.reversed_by_line_id IS NOT NULL
                             OR EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.reverses_je_id = j.id)))
     AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.posting_batch_id = b.id);

  SELECT count(*) INTO v_dups FROM (
    SELECT l.operating_company_id, l.rk FROM _fuel_receipt_live l WHERE l.rk IS NOT NULL
     GROUP BY 1, 2
    HAVING count(*) + (SELECT count(*) FROM fuel.fuel_receipt_postings rp
                        WHERE rp.operating_company_id = l.operating_company_id AND rp.receipt_key = l.rk AND rp.released_at IS NULL) > 1
  ) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'fuel_receipt_backfill_refused: % receipt(s) carry more than one live posting — reverse the duplicates through the engine first (LEAD 443.121 #1)', v_dups;
  END IF;

  INSERT INTO fuel.fuel_receipt_postings (operating_company_id, receipt_key, posting_batch_id)
  SELECT l.operating_company_id, l.rk, l.batch_id FROM _fuel_receipt_live l WHERE l.rk IS NOT NULL;
END
$backfill$;
