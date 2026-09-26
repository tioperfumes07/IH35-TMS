--
-- 202614290000 — THE DEDUCTION CHAIN, CUSTOMER TO DRIVER (Round 88 owner law)
--
-- Owner, verbatim: "MOST OF THE DIFFERENCES IN INVOICES AND FARO PAYMENTS OR DEDUCTIONS OR
-- LESSER PAYMENT FROM CUSTOMER FROM FARO IS BECAUSE WE ARRIVED LATE, OR DID NOT SEND LUMPER,
-- ETC." and "WE NEED TO CREATE THE DRIVER DEDUCTIONS... IF WE ARE LATE DUE TO DRIVER FAULT,
-- WE WILL DEDUCT."
--
-- WHAT WAS MISSING. Both ends already exist and have never been connected:
--   accounting.invoice_disputes   — why the customer paid less (reason_code, disputed amount)
--   driver_finance.driver_settlement_deductions — what we took back from the driver
-- Nothing recorded that THIS short-pay caused THAT deduction, or that a human decided the
-- driver was at fault. Without the link the two subledgers cannot be reconciled, the driver
-- cannot see why he was docked, and a recovery can silently be taken twice.
--
-- DESIGN, and why each piece is the way it is:
--
--   §1  A FAULT DECISION IS A NAMED HUMAN ACT. `fault_party` is never inferred from lateness.
--       A load can be late for weather, a broker's dock, a border queue or the driver. Only a
--       person decides, and the row records who and when. 'unassigned' is the honest default
--       and it is what a new short-pay starts as — not 'driver'.
--
--   §2  THE LINK IS ITS OWN ROW, not a column on either side. One short-pay can produce more
--       than one deduction (two drivers on a team load), and one deduction can recover against
--       more than one short-pay. A column on either table would force a lie in both directions.
--
--   §3  RECOVERY IS CAPPED AND THE DATABASE ENFORCES IT. You cannot recover more from the
--       driver than the customer actually withheld. `recovered_amount_cents` is CHECKed
--       positive and the sum is constrained per dispute by a trigger, because a cap that lives
--       only in application code is not a cap.
--
--   §4  REVERSAL IS A CORRECTING ROW, NEVER A DELETE. This database is WORM (see
--       202612220000) and an already-collected driver deduction is NEVER reversed — it is real
--       money already taken. `voided_at`/`void_reason`/`voided_by_user_id` match the shape
--       every other financial table already uses, with the same CHECK that a void must say why.
--
-- NO GL MATH HERE. This migration creates linkage and decision records only. The posting of a
-- recovery is done by the existing deduction and reimbursement engines; if a posting path does
-- not exist for a case, that is reported, not invented.
--
-- Idempotent throughout: to_regclass guards, ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
-- EXISTS, DROP TRIGGER IF EXISTS before CREATE.
--

-- =========================================================================================
-- §1 — the fault decision, on the dispute that already exists
-- =========================================================================================
DO $$
BEGIN
  IF to_regclass('accounting.invoice_disputes') IS NULL THEN
    RAISE NOTICE '202614290000: accounting.invoice_disputes absent — §1 skipped';
    RETURN;
  END IF;

  ALTER TABLE accounting.invoice_disputes
    ADD COLUMN IF NOT EXISTS fault_party            text NOT NULL DEFAULT 'unassigned',
    ADD COLUMN IF NOT EXISTS fault_reason           text,
    ADD COLUMN IF NOT EXISTS fault_decided_at       timestamptz,
    ADD COLUMN IF NOT EXISTS fault_decided_by_user_id uuid REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS driver_id              uuid REFERENCES mdata.drivers(id),
    ADD COLUMN IF NOT EXISTS load_id                uuid REFERENCES mdata.loads(id),
    ADD COLUMN IF NOT EXISTS invoice_line_id        uuid REFERENCES accounting.invoice_lines(id);

  -- The vocabulary is closed on purpose. A free-text fault column becomes twelve spellings of
  -- "driver" inside a month and nothing can be grouped or reported on.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.invoice_disputes'::regclass
       AND conname  = 'invoice_disputes_fault_party_check'
  ) THEN
    ALTER TABLE accounting.invoice_disputes
      ADD CONSTRAINT invoice_disputes_fault_party_check
      CHECK (fault_party = ANY (ARRAY[
        'unassigned',   -- nobody has decided yet. The honest default.
        'driver',       -- the only value that may produce a driver deduction
        'carrier',      -- our dispatch, our paperwork, our equipment
        'customer',     -- shipper or receiver caused it
        'broker',       -- the broker's dock, appointment or instructions
        'force_majeure' -- weather, border, accident ahead — nobody's fault
      ])) NOT VALID;
  END IF;

  -- A fault decision that names no decider and no time is not a decision, it is a guess that
  -- got typed into a column.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.invoice_disputes'::regclass
       AND conname  = 'invoice_disputes_fault_decision_complete'
  ) THEN
    ALTER TABLE accounting.invoice_disputes
      ADD CONSTRAINT invoice_disputes_fault_decision_complete
      CHECK (
        fault_party = 'unassigned'
        OR (fault_decided_at IS NOT NULL AND fault_decided_by_user_id IS NOT NULL
            AND btrim(coalesce(fault_reason, '')) <> '')
      ) NOT VALID;
  END IF;

  -- Only a driver-fault dispute may name a driver. Naming a driver on a weather delay is how a
  -- deduction gets built against the wrong person.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'accounting.invoice_disputes'::regclass
       AND conname  = 'invoice_disputes_driver_only_when_driver_fault'
  ) THEN
    ALTER TABLE accounting.invoice_disputes
      ADD CONSTRAINT invoice_disputes_driver_only_when_driver_fault
      CHECK (driver_id IS NULL OR fault_party = 'driver') NOT VALID;
  END IF;
END
$$;

-- =========================================================================================
-- §2 — the link itself: which short-pay produced which driver deduction, and for how much
-- =========================================================================================
-- CANONICAL-CHECK: driver_finance.deduction_recovery_links is a LINK/decision record, not a ledger. It holds no
-- balance and posts nothing (header "NO GL MATH HERE"). It does not duplicate accounting.invoice_disputes (the
-- customer short-pay, referenced by FK) or driver_finance.driver_settlement_deductions (the driver deduction,
-- referenced by FK); it records which short-pay caused which deduction, capped per dispute by trigger (§2/§3).
CREATE TABLE IF NOT EXISTS driver_finance.deduction_recovery_links (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id    uuid NOT NULL REFERENCES org.companies(id),

  -- the customer end
  invoice_dispute_id      uuid NOT NULL REFERENCES accounting.invoice_disputes(id),
  invoice_id              uuid REFERENCES accounting.invoices(id),
  invoice_line_id         uuid REFERENCES accounting.invoice_lines(id),

  -- the driver end
  driver_settlement_deduction_id uuid NOT NULL
                          REFERENCES driver_finance.driver_settlement_deductions(id),
  driver_id               uuid NOT NULL REFERENCES mdata.drivers(id),
  load_id                 uuid REFERENCES mdata.loads(id),

  -- how much of that short-pay this deduction recovers. Cents, positive, capped in §3.
  recovered_amount_cents  bigint NOT NULL CHECK (recovered_amount_cents > 0),

  -- why, in words a driver can read on his settlement
  recovery_reason         text NOT NULL CHECK (btrim(recovery_reason) <> ''),

  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by_user_id      uuid REFERENCES identity.users(id),

  -- void, never delete (202612220000)
  voided_at               timestamptz,
  void_reason             text,
  voided_by_user_id       uuid REFERENCES identity.users(id),

  CONSTRAINT deduction_recovery_links_void_reason_required
    CHECK (voided_at IS NULL OR btrim(coalesce(void_reason, '')) <> ''),

  -- the same dispute may not be linked to the same deduction twice
  CONSTRAINT deduction_recovery_links_unique_pair
    UNIQUE (invoice_dispute_id, driver_settlement_deduction_id),

  -- entity scoping, the shape every other table here uses
  CONSTRAINT uq_deduction_recovery_links_company_id
    UNIQUE (operating_company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_deduction_recovery_links_dispute
  ON driver_finance.deduction_recovery_links (invoice_dispute_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deduction_recovery_links_deduction
  ON driver_finance.deduction_recovery_links (driver_settlement_deduction_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deduction_recovery_links_driver
  ON driver_finance.deduction_recovery_links (operating_company_id, driver_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deduction_recovery_links_load
  ON driver_finance.deduction_recovery_links (load_id) WHERE voided_at IS NULL;

COMMENT ON TABLE driver_finance.deduction_recovery_links IS
  'Round 88: links a customer short-pay (accounting.invoice_disputes) to the driver deduction '
  'that recovers it. One short-pay may produce several deductions (team load) and one deduction '
  'may recover against several short-pays, so the link is its own row. Recovery is capped at the '
  'disputed amount by trigger. Void, never delete.';

-- =========================================================================================
-- §3 — the cap, enforced by the database, not by hope
-- =========================================================================================
CREATE OR REPLACE FUNCTION driver_finance.enforce_recovery_not_over_disputed()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  disputed bigint;
  already  bigint;
  fault    text;
BEGIN
  SELECT d.disputed_amount_cents, d.fault_party
    INTO disputed, fault
    FROM accounting.invoice_disputes d
   WHERE d.id = NEW.invoice_dispute_id;

  IF disputed IS NULL THEN
    RAISE EXCEPTION 'invoice_dispute % not found', NEW.invoice_dispute_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- A recovery from a driver is only defensible when a human decided the driver was at fault.
  IF fault <> 'driver' THEN
    RAISE EXCEPTION
      'invoice_dispute % is fault_party=%, not driver — a driver may not be charged for it',
      NEW.invoice_dispute_id, fault
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT coalesce(sum(l.recovered_amount_cents), 0)
    INTO already
    FROM driver_finance.deduction_recovery_links l
   WHERE l.invoice_dispute_id = NEW.invoice_dispute_id
     AND l.voided_at IS NULL
     AND l.id <> NEW.id;

  IF already + NEW.recovered_amount_cents > disputed THEN
    RAISE EXCEPTION
      'recovery would exceed the short-pay: dispute % withheld % cents, % already linked, % more requested',
      NEW.invoice_dispute_id, disputed, already, NEW.recovered_amount_cents
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_recovery_not_over_disputed
  ON driver_finance.deduction_recovery_links;
CREATE TRIGGER trg_recovery_not_over_disputed
  BEFORE INSERT OR UPDATE ON driver_finance.deduction_recovery_links
  FOR EACH ROW EXECUTE FUNCTION driver_finance.enforce_recovery_not_over_disputed();

-- =========================================================================================
-- §4 — row level security, same shape as its neighbours
-- =========================================================================================
ALTER TABLE driver_finance.deduction_recovery_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.deduction_recovery_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deduction_recovery_links_company_isolation
  ON driver_finance.deduction_recovery_links;
CREATE POLICY deduction_recovery_links_company_isolation
  ON driver_finance.deduction_recovery_links
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

-- =========================================================================================
-- §5 — WORM: a recovery link is financial linkage and is never deleted by the application
-- =========================================================================================
DO $$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE '202614290000: database is % (not production) — DELETE-blocking not installed', current_database();
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON driver_finance.deduction_recovery_links';
  EXECUTE 'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON driver_finance.deduction_recovery_links '
          'FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()';
  EXECUTE 'REVOKE DELETE ON driver_finance.deduction_recovery_links FROM ih35_app';
  RAISE NOTICE '202614290000: deduction_recovery_links is now WORM';
END
$$;
