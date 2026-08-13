-- ACCT-F5044 / LV-EXPENSE-NUMBER — repair TMS-native expenses that carry load_id but never
-- received expense_number / expense_load_links (pre-fix create asymmetry window).
--
-- LAW: expense_number is LOAD-SCOPED (L-<load>-N via expense_attribution.expense_seq_per_load).
-- Unattributed (no load) expenses correctly stay NULL — do NOT invent a company-wide series
-- (docs/specs/GAP-EXPENSES-MODULE-COMPLETION-DESIGN.md). QBO-origin rows are untouched.
--
-- Scope: accounting.expenses WHERE load_id IS NOT NULL AND expense_number IS NULL
--        AND qbo_purchase_id IS NULL (TMS-native only).
-- Idempotent: second apply finds 0 rows. REHEARSED: live census 2026-08-13 = 9 USMCA rows.
-- Dynamic org.companies only via FK on existing expense rows (no hardcoded UUID filter required).

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_seq integer;
  v_load_number text;
  v_number text;
  v_repaired integer := 0;
BEGIN
  FOR r IN
    SELECT e.id, e.operating_company_id, e.load_id
      FROM accounting.expenses e
     WHERE e.load_id IS NOT NULL
       AND e.expense_number IS NULL
       AND e.qbo_purchase_id IS NULL
     ORDER BY e.created_at ASC, e.id ASC
  LOOP
    SELECT load_number INTO v_load_number
      FROM mdata.loads
     WHERE id = r.load_id
       AND operating_company_id = r.operating_company_id
     LIMIT 1;

    IF v_load_number IS NULL OR btrim(v_load_number) = '' THEN
      RAISE NOTICE 'ACCT-F5044: skip expense % — load % missing load_number in opco', r.id, r.load_id;
      CONTINUE;
    END IF;

    INSERT INTO expense_attribution.expense_seq_per_load (load_id, last_seq)
    VALUES (r.load_id, 0)
    ON CONFLICT (load_id) DO NOTHING;

    UPDATE expense_attribution.expense_seq_per_load
       SET last_seq = last_seq + 1,
           updated_at = now()
     WHERE load_id = r.load_id
     RETURNING last_seq INTO v_seq;

    IF v_seq IS NULL OR v_seq <= 0 THEN
      RAISE EXCEPTION 'ACCT-F5044: expense_sequence_failed for load %', r.load_id;
    END IF;

    v_number := v_load_number || '-' || v_seq::text;

    UPDATE accounting.expenses
       SET expense_number = v_number,
           updated_at = now()
     WHERE id = r.id
       AND operating_company_id = r.operating_company_id
       AND expense_number IS NULL;

    INSERT INTO expense_attribution.expense_load_links (
      operating_company_id,
      expense_id,
      expense_source,
      load_id,
      load_number,
      expense_seq,
      expense_number,
      attribution_method,
      attribution_confidence,
      attribution_reason
    )
    VALUES (
      r.operating_company_id,
      r.id,
      'accounting',
      r.load_id,
      v_load_number,
      v_seq,
      v_number,
      'user_assigned',
      'high',
      'ACCT-F5044 repair: load_id was stamped without expense_number / link row'
    )
    ON CONFLICT (expense_source, expense_id) DO NOTHING;

    v_repaired := v_repaired + 1;
  END LOOP;

  RAISE NOTICE 'ACCT-F5044: repaired % TMS-native load-linked expense number(s)', v_repaired;
END
$$;

COMMIT;
