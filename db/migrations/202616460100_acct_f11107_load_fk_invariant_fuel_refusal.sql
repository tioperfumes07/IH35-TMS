-- 202616460100 — ACCT-F11107: accounting.enforce_load_fk_invariant() raises its REAL refusal on fuel.fuel_transactions.
--
-- WHY (measured on prod 2026-11-10, USMCA): the function is the BEFORE INSERT/UPDATE trigger on accounting.expense_lines,
-- accounting.bill_lines and fuel.fuel_transactions (trg_fuel_txn_load_fk). Its refusal was
--   RAISE EXCEPTION 'E_LOAD_FK_REQUIRED: %.% category=% …', TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(NEW.line_category, 'n/a')
-- fuel.fuel_transactions has no line_category column, so on a fuel row with no load and no exemption plpgsql failed while
-- building the message: `record "new" has no field "line_category"` (42703). The writer saw a schema error; the real reason
-- (E_LOAD_FK_REQUIRED — a fuel row needs load_id or a >=20-char load_exemption_reason) never showed.
--
-- RULE: NEW.line_category is read only on the two accounting line tables; the fuel branch names the fuel row instead
-- (fuel_type and transaction_reference). Same decisions, same SQLSTATE (P0001), same E_LOAD_FK_REQUIRED prefix the writers
-- match on (fuel-transaction-import.ts, expense-line-load-exemption.ts). Nothing else changes.
--
-- Idempotent: CREATE OR REPLACE FUNCTION only; the three triggers are unchanged.

CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_required boolean := false;
  v_what text := 'n/a';
BEGIN
  IF NEW.load_exemption_reason IS NOT NULL THEN
    IF length(trim(NEW.load_exemption_reason)) < 20 THEN
      RAISE EXCEPTION
        'E_LOAD_EXEMPTION_REASON_TOO_SHORT: load_exemption_reason must be >=20 chars';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME IN ('expense_lines', 'bill_lines') THEN
    v_required := COALESCE(NEW.load_required, false);
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM accounting.line_category_load_required r
        WHERE r.line_category = NEW.line_category
      ) INTO v_required;
    END IF;
    v_what := 'category=' || COALESCE(NEW.line_category, 'n/a');
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
    v_what := 'fuel_type=' || COALESCE(NEW.fuel_type, 'n/a') || ' reference=' || COALESCE(NEW.transaction_reference, 'n/a');
  END IF;

  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_LOAD_FK_REQUIRED: %.% % requires load_id (G18 invariant). Provide load_id OR load_exemption_reason >=20 chars.',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      v_what;
  END IF;

  RETURN NEW;
END;
$function$;
