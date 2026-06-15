-- GAP-EXPENSES Phase 1.5 — expense_lines cents reconciliation + hard total=sum invariant.
-- Lands the "balances or fails hard" gate BEFORE Phase 2 GL posting.
-- Mirrors the proven double-entry deferred constraint trigger
--   (accounting.ensure_journal_entry_balanced / trg_check_journal_entry_balanced, 0092 + 202606080020).
--
-- GATE CORRECTION (verified, flagged for GUARD): the invariant gates on
--   posting_status='posted' (GL state), NOT status='posted'. The Phase-1 route writes
--   status='posted' (= finalized) on EVERY expense, so gating on status would fire on
--   every insert and reject line-less/split-tx expenses — not inert. posting_status
--   defaults 'unposted' and is only set 'posted' by Phase-2 GL posting → the trigger is
--   genuinely INERT in 1.5 and bites exactly when GL posting turns on (GUARD's intent).
-- No carve-out: posting_status='posted' => total_amount_cents = sum(expense_lines.amount_cents).
-- Idempotent. Forward-only. See docs/specs/GAP-EXPENSES-PHASE-1.5-UNIT-RECONCILIATION-DESIGN.md.

BEGIN;

-- 1. Cents column on the child + idempotent backfill (prod expense_lines is empty -> no-op).
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0;
UPDATE accounting.expense_lines
  SET amount_cents = round(amount * 100)::bigint
  WHERE amount_cents = 0 AND amount <> 0;

-- 2. Invariant function — mirrors accounting.ensure_journal_entry_balanced exactly.
--    Works from either trigger source via TG_TABLE_NAME. Unconditional (no "if lines exist"
--    carve-out): a GL-posted expense's stored total MUST equal the sum of its line cents.
CREATE OR REPLACE FUNCTION accounting.ensure_expense_total_matches_lines()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id uuid;
  v_posting_status text;
  v_total bigint;
  v_sum bigint;
BEGIN
  IF TG_TABLE_NAME = 'expense_lines' THEN
    target_id := COALESCE(NEW.expense_id, OLD.expense_id);
  ELSE
    target_id := COALESCE(NEW.id, OLD.id);
  END IF;
  IF target_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.posting_status, e.total_amount_cents
    INTO v_posting_status, v_total
    FROM accounting.expenses e
    WHERE e.id = target_id;

  -- Only GL-posted expenses are gated. unposted/reversed (and any missing parent) are exempt.
  -- Inert in Phase 1.5 because nothing sets posting_status='posted' until Phase 2.
  IF v_posting_status IS DISTINCT FROM 'posted' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)::bigint
    INTO v_sum
    FROM accounting.expense_lines
    WHERE expense_id = target_id;

  IF v_total <> v_sum THEN
    RAISE EXCEPTION
      'expense % is GL-posted but total_amount_cents=% != sum(expense_lines.amount_cents)=%',
      target_id, v_total, v_sum
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

-- 3. Deferred constraint triggers (fire at COMMIT) — mirrors trg_check_journal_entry_balanced.
--    Line side: any line I/U/D re-checks the parent (symmetric to the JE postings trigger).
DROP TRIGGER IF EXISTS trg_expense_total_matches_lines ON accounting.expense_lines;
CREATE CONSTRAINT TRIGGER trg_expense_total_matches_lines
  AFTER INSERT OR UPDATE OR DELETE ON accounting.expense_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.ensure_expense_total_matches_lines();

--    Header side (expense-specific, since the header carries an independent stored total):
--    re-check when the gate (posting_status) or the stored total changes — blocks post-then-mutate.
DROP TRIGGER IF EXISTS trg_expense_header_total_matches_lines ON accounting.expenses;
CREATE CONSTRAINT TRIGGER trg_expense_header_total_matches_lines
  AFTER INSERT OR UPDATE OF total_amount_cents, posting_status ON accounting.expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.ensure_expense_total_matches_lines();

COMMIT;
