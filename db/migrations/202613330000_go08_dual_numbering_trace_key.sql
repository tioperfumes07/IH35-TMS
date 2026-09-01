-- 202613330000_go08_dual_numbering_trace_key.sql
-- GO-08 DUAL NUMBERING -- immutable, per-(operating_company_id, doc_type) trace_no + trace_key on
-- every document table, carried into accounting.journal_entry_postings for ledger-side tracing.
--
-- Design notes (read before touching this pattern elsewhere):
--   - uuid PK stays the only true identity (owner law: "do NOT invent a third identifier"). trace_no
--     is a SHORT, per-type, human-tractable handle -- never a substitute for the FK-bearing uuid.
--   - Counter mechanism is a row-locked upsert counter table (lib.trace_counters), NOT MAX()+1 in
--     app code and NOT a bare CREATE SEQUENCE per (opco,type) -- entities are added over time
--     (USMCA activated mid-year), so a fixed set of pre-created sequences would need a follow-up
--     migration every time a new operating_company_id is onboarded. The counter table's PK IS
--     (operating_company_id, doc_type); `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` takes a
--     row lock for the duration of the caller's transaction, which is what makes concurrent INSERTs
--     into the same (opco,type) queue safely rather than race on a read-then-write MAX().
--   - trace_no is assigned by a BEFORE INSERT trigger (lib.assign_trace_no), never by application
--     code, so no future direct-SQL or backfill-script insert path can bypass it.
--   - A separate BEFORE UPDATE trigger (lib.block_trace_no_update) raises on any attempted change --
--     the database refuses, not "we agree not to change it" (owner's own DoD item 3).
--   - trace_key is a GENERATED ALWAYS ... STORED column (<PREFIX>-<trace_no zero-padded to 6>), so it
--     can never drift from trace_no and needs no separate write path.
--   - trace_key is unique per (operating_company_id, trace_key), NOT globally -- numbering restarts
--     per entity by design (matches the existing display_id per-entity pattern this repo already
--     uses; see docs/audit/wave-queue.json CLS-DISPLAYID-UNSCOPED for why that is correct and how
--     it must always be read with an operating_company_id predicate, never trace_key alone).
--
-- 10 document tables covered (owner's list): mdata.loads (LD), accounting.invoices (IN),
-- accounting.bills (BL), accounting.expenses (EX), accounting.payments (PM),
-- accounting.bill_payments (BP), accounting.credit_memos (CM), accounting.vendor_credits (VC),
-- driver_finance.driver_bills (DB), driver_finance.driver_settlements (ST).
--
-- Expense numbering ruling (owner, same-day GO packet): expense_number stays UNIQUE COMPANY-WIDE,
-- not per-vendor -- this migration does not touch that existing constraint at all; trace_no is an
-- independent, orthogonal handle regardless of the visible-number scoping question.
--
-- journal_entry_postings.source_trace_key is backfilled/trigger-populated ONLY for the 4
-- source_transaction_type values that live-map onto these 10 document tables today (invoice, bill,
-- bill_payment, customer_payment->payments). Every other observed type (fuel_event,
-- bank_categorization, fixed_asset_depreciation, loan_payment, journal_entry, prepaid_purchase,
-- transfer) is NOT one of the 10 GO-08 document tables and is deliberately left NULL here -- not
-- invented, not guessed.

-- ---------------------------------------------------------------------------------------------------
-- Counter table + assignment/immutability trigger functions (schema-generic, used by all 10 tables)
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lib.trace_counters (
  operating_company_id uuid NOT NULL,
  doc_type              text NOT NULL,
  last_trace_no         bigint NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, doc_type)
);

GRANT SELECT, INSERT, UPDATE ON lib.trace_counters TO ih35_app;

ALTER TABLE lib.trace_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib.trace_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trace_counters_entity_isolation ON lib.trace_counters;
CREATE POLICY trace_counters_entity_isolation ON lib.trace_counters FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
-- No role restriction (unlike driver_schedule's write policy): this table is pure counter
-- infrastructure written only as a side effect of an INSERT into one of the 10 document tables
-- above, inside lib.assign_trace_no()'s trigger context. That parent INSERT already enforced
-- whatever role gate the document table itself requires; gating the counter separately would
-- only risk breaking a legitimate document-create flow for no additional safety.

CREATE OR REPLACE FUNCTION lib.next_trace_no(p_opco uuid, p_doc_type text) RETURNS bigint AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  VALUES (p_opco, p_doc_type, 1, now())
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = lib.trace_counters.last_trace_no + 1, updated_at = now()
  RETURNING last_trace_no INTO v_next;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lib.assign_trace_no() RETURNS trigger AS $$
BEGIN
  IF NEW.trace_no IS NULL THEN
    NEW.trace_no := lib.next_trace_no(NEW.operating_company_id, TG_ARGV[0]);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lib.block_trace_no_update() RETURNS trigger AS $$
BEGIN
  IF NEW.trace_no IS DISTINCT FROM OLD.trace_no THEN
    RAISE EXCEPTION 'trace_no is immutable on %.%: % -> % refused (GO-08)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.trace_no, NEW.trace_no;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------------
-- Per-table: add column, backfill in (operating_company_id, created_at, id) order, seed the counter
-- from the backfilled max, lock NOT NULL, add the generated trace_key, unique index, triggers.
-- The DO block is one per table so a partial re-run (e.g. after an error on table N) is idempotent --
-- every statement inside checks IF NOT EXISTS / only touches trace_no IS NULL rows.
-- ---------------------------------------------------------------------------------------------------

-- mdata.loads (LD)
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM mdata.loads WHERE trace_no IS NULL
)
UPDATE mdata.loads t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'LD', max(trace_no), now() FROM mdata.loads GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE mdata.loads ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('LD-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS loads_opco_trace_no_key ON mdata.loads (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS loads_opco_trace_key_key ON mdata.loads (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON mdata.loads;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON mdata.loads FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('LD');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON mdata.loads;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON mdata.loads FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.invoices (IN)
ALTER TABLE accounting.invoices ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.invoices WHERE trace_no IS NULL
)
UPDATE accounting.invoices t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'IN', max(trace_no), now() FROM accounting.invoices GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.invoices ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.invoices ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('IN-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_opco_trace_no_key ON accounting.invoices (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_opco_trace_key_key ON accounting.invoices (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.invoices;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.invoices FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('IN');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.invoices;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.invoices FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.bills (BL)
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.bills WHERE trace_no IS NULL
)
UPDATE accounting.bills t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'BL', max(trace_no), now() FROM accounting.bills GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.bills ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('BL-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS bills_opco_trace_no_key ON accounting.bills (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS bills_opco_trace_key_key ON accounting.bills (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.bills;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.bills FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('BL');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.bills;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.bills FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.expenses (EX)
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.expenses WHERE trace_no IS NULL
)
UPDATE accounting.expenses t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'EX', max(trace_no), now() FROM accounting.expenses GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.expenses ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('EX-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_opco_trace_no_key ON accounting.expenses (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_opco_trace_key_key ON accounting.expenses (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.expenses;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.expenses FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('EX');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.expenses;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.expenses FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.payments (PM)
ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.payments WHERE trace_no IS NULL
)
UPDATE accounting.payments t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'PM', max(trace_no), now() FROM accounting.payments GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.payments ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('PM-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS payments_opco_trace_no_key ON accounting.payments (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS payments_opco_trace_key_key ON accounting.payments (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.payments;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.payments FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('PM');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.payments;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.payments FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.bill_payments (BP)
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.bill_payments WHERE trace_no IS NULL
)
UPDATE accounting.bill_payments t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'BP', max(trace_no), now() FROM accounting.bill_payments GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.bill_payments ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('BP-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS bill_payments_opco_trace_no_key ON accounting.bill_payments (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS bill_payments_opco_trace_key_key ON accounting.bill_payments (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.bill_payments;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.bill_payments FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('BP');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.bill_payments;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.bill_payments FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.credit_memos (CM)
ALTER TABLE accounting.credit_memos ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.credit_memos WHERE trace_no IS NULL
)
UPDATE accounting.credit_memos t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'CM', max(trace_no), now() FROM accounting.credit_memos GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.credit_memos ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.credit_memos ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('CM-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS credit_memos_opco_trace_no_key ON accounting.credit_memos (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS credit_memos_opco_trace_key_key ON accounting.credit_memos (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.credit_memos;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.credit_memos FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('CM');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.credit_memos;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.credit_memos FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- accounting.vendor_credits (VC)
ALTER TABLE accounting.vendor_credits ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM accounting.vendor_credits WHERE trace_no IS NULL
)
UPDATE accounting.vendor_credits t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'VC', max(trace_no), now() FROM accounting.vendor_credits GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE accounting.vendor_credits ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE accounting.vendor_credits ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('VC-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_credits_opco_trace_no_key ON accounting.vendor_credits (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_credits_opco_trace_key_key ON accounting.vendor_credits (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON accounting.vendor_credits;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON accounting.vendor_credits FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('VC');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON accounting.vendor_credits;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON accounting.vendor_credits FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- driver_finance.driver_bills (DB)
ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM driver_finance.driver_bills WHERE trace_no IS NULL
)
UPDATE driver_finance.driver_bills t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'DB', max(trace_no), now() FROM driver_finance.driver_bills GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE driver_finance.driver_bills ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE driver_finance.driver_bills ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('DB-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS driver_bills_opco_trace_no_key ON driver_finance.driver_bills (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS driver_bills_opco_trace_key_key ON driver_finance.driver_bills (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON driver_finance.driver_bills;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON driver_finance.driver_bills FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('DB');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON driver_finance.driver_bills;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON driver_finance.driver_bills FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- driver_finance.driver_settlements (ST)
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS trace_no bigint;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY operating_company_id ORDER BY created_at, id) AS rn
  FROM driver_finance.driver_settlements WHERE trace_no IS NULL
)
UPDATE driver_finance.driver_settlements t SET trace_no = ranked.rn FROM ranked WHERE t.id = ranked.id;
INSERT INTO lib.trace_counters (operating_company_id, doc_type, last_trace_no, updated_at)
  SELECT operating_company_id, 'ST', max(trace_no), now() FROM driver_finance.driver_settlements GROUP BY operating_company_id
  ON CONFLICT (operating_company_id, doc_type)
    DO UPDATE SET last_trace_no = GREATEST(lib.trace_counters.last_trace_no, EXCLUDED.last_trace_no), updated_at = now();
ALTER TABLE driver_finance.driver_settlements ALTER COLUMN trace_no SET NOT NULL;
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS trace_key text GENERATED ALWAYS AS ('ST-' || lpad(trace_no::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS driver_settlements_opco_trace_no_key ON driver_finance.driver_settlements (operating_company_id, trace_no);
CREATE UNIQUE INDEX IF NOT EXISTS driver_settlements_opco_trace_key_key ON driver_finance.driver_settlements (operating_company_id, trace_key);
DROP TRIGGER IF EXISTS trg_assign_trace_no ON driver_finance.driver_settlements;
CREATE TRIGGER trg_assign_trace_no BEFORE INSERT ON driver_finance.driver_settlements FOR EACH ROW EXECUTE FUNCTION lib.assign_trace_no('ST');
DROP TRIGGER IF EXISTS trg_block_trace_no_update ON driver_finance.driver_settlements;
CREATE TRIGGER trg_block_trace_no_update BEFORE UPDATE ON driver_finance.driver_settlements FOR EACH ROW EXECUTE FUNCTION lib.block_trace_no_update();

-- ---------------------------------------------------------------------------------------------------
-- Carry trace_key into the ledger: accounting.journal_entry_postings.source_trace_key.
-- Only 4 of the observed source_transaction_type values map onto GO-08's 10 document tables today
-- (invoice/bill/bill_payment/customer_payment->payments); every other type (fuel_event,
-- bank_categorization, fixed_asset_depreciation, loan_payment, journal_entry, prepaid_purchase,
-- transfer) is out of GO-08's scope and is left NULL, not guessed.
-- ---------------------------------------------------------------------------------------------------
ALTER TABLE accounting.journal_entry_postings ADD COLUMN IF NOT EXISTS source_trace_key text;

UPDATE accounting.journal_entry_postings jep
   SET source_trace_key = src.trace_key
  FROM accounting.invoices src
 WHERE jep.source_transaction_type = 'invoice'
   AND jep.source_trace_key IS NULL
   AND jep.source_transaction_id ~ '^[0-9a-fA-F-]{36}$'
   AND jep.source_transaction_id::uuid = src.id;

UPDATE accounting.journal_entry_postings jep
   SET source_trace_key = src.trace_key
  FROM accounting.bills src
 WHERE jep.source_transaction_type = 'bill'
   AND jep.source_trace_key IS NULL
   AND jep.source_transaction_id ~ '^[0-9a-fA-F-]{36}$'
   AND jep.source_transaction_id::uuid = src.id;

UPDATE accounting.journal_entry_postings jep
   SET source_trace_key = src.trace_key
  FROM accounting.bill_payments src
 WHERE jep.source_transaction_type = 'bill_payment'
   AND jep.source_trace_key IS NULL
   AND jep.source_transaction_id ~ '^[0-9a-fA-F-]{36}$'
   AND jep.source_transaction_id::uuid = src.id;

UPDATE accounting.journal_entry_postings jep
   SET source_trace_key = src.trace_key
  FROM accounting.payments src
 WHERE jep.source_transaction_type = 'customer_payment'
   AND jep.source_trace_key IS NULL
   AND jep.source_transaction_id ~ '^[0-9a-fA-F-]{36}$'
   AND jep.source_transaction_id::uuid = src.id;

CREATE OR REPLACE FUNCTION accounting.set_journal_posting_source_trace_key() RETURNS trigger AS $$
BEGIN
  IF NEW.source_trace_key IS NULL AND NEW.source_transaction_id IS NOT NULL
     AND NEW.source_transaction_id ~ '^[0-9a-fA-F-]{36}$' THEN
    NEW.source_trace_key := CASE NEW.source_transaction_type
      WHEN 'invoice' THEN (SELECT trace_key FROM accounting.invoices WHERE id = NEW.source_transaction_id::uuid)
      WHEN 'bill' THEN (SELECT trace_key FROM accounting.bills WHERE id = NEW.source_transaction_id::uuid)
      WHEN 'bill_payment' THEN (SELECT trace_key FROM accounting.bill_payments WHERE id = NEW.source_transaction_id::uuid)
      WHEN 'customer_payment' THEN (SELECT trace_key FROM accounting.payments WHERE id = NEW.source_transaction_id::uuid)
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_journal_posting_source_trace_key ON accounting.journal_entry_postings;
CREATE TRIGGER trg_set_journal_posting_source_trace_key
  BEFORE INSERT ON accounting.journal_entry_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.set_journal_posting_source_trace_key();
