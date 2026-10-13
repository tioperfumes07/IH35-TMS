-- 202615770700_expense_line_load_or_exemption_refused.sql
-- CC-2 · LEAD RULING 443.105 #2 (owner 2026-10-12 07:50 CT: "Every engine ... must record correctly with truck / driver /
-- load / trailer / vendor / item / account"). An expense line is either tied to its load or says why it is not.
--
-- Before this file the database asked for a load only when the line's category required one (accounting.
-- enforce_load_fk_invariant — the nine G18 over-the-road categories). Measured on prod (USMCA, live expenses):
-- 865 expense lines, 860 carry a load_id and exactly 5 carry neither a load_id nor a load_exemption_reason
-- (EXP-2026-00001..00005, bank-fee / overhead lines written by bank-line categorization on 2026-10-07).
--
-- The rule: for a company that enforces line categorization (org.companies.enforce_line_categorization — USMCA; TRANSP /
-- TRK are frozen QBO mirrors and are never touched), a line of a live (not voided) expense must carry load_id OR a
-- load_exemption_reason. Checked at COMMIT (constraint trigger, deferred) so a writer that inserts the line and links the
-- load later in the same transaction is judged on the finished row. The >= 20-char floor on the reason stays where it is
-- (enforce_load_fk_invariant). Refusal = check_violation with the stable code word expense_line_load_or_reason_required.
--
-- Existing rows: the trigger fires on INSERT / UPDATE only, so the 5 historical lines are not rewritten by this file;
-- they are stamped through the engine under an owner AUTH (scripts/ops/2026-10-12-cc2-443-105-expense-exemption-reasons.mts)
-- and verify-expense-lines-load-or-reason.mjs measures 0 live afterwards. Idempotent; lock_timeout 60s.
BEGIN;
SET LOCAL lock_timeout = '60s';

CREATE OR REPLACE FUNCTION accounting.refuse_expense_line_without_load_or_reason() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_enforce boolean;
  v_row accounting.expense_lines%ROWTYPE;
  v_voided boolean;
  v_number text;
BEGIN
  -- Deferred: judge the row as it stands at commit (a later statement in the transaction may have linked the load).
  SELECT * INTO v_row FROM accounting.expense_lines WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT c.enforce_line_categorization INTO v_enforce FROM org.companies c WHERE c.id = v_row.operating_company_id;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NULL; END IF;

  SELECT (e.voided_at IS NOT NULL), e.expense_number INTO v_voided, v_number
    FROM accounting.expenses e WHERE e.id = v_row.expense_id;
  IF COALESCE(v_voided, false) THEN RETURN NULL; END IF;

  IF v_row.load_id IS NULL AND NULLIF(btrim(COALESCE(v_row.load_exemption_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'expense_line_load_or_reason_required: expense % line % has no load and no load_exemption_reason — link the load, or say why this cost is not a load cost',
      COALESCE(v_number, v_row.expense_id::text), v_row.line_sequence
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_expense_line_load_or_reason ON accounting.expense_lines;
CREATE CONSTRAINT TRIGGER trg_expense_line_load_or_reason
  AFTER INSERT OR UPDATE OF load_id, load_exemption_reason, expense_id ON accounting.expense_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_expense_line_without_load_or_reason();

COMMENT ON FUNCTION accounting.refuse_expense_line_without_load_or_reason() IS
  'LEAD 443.105 #2: a line of a live expense of an enforcing company carries load_id or load_exemption_reason (checked at commit).';

COMMIT;
