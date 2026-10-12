-- 202615620900_line_categorization_refused_at_db.sql
-- CC-3 · RULING 443.67 #1 a-c (owner 2026-10-11 15:30 CT: "FIX ALL THESE ISSUES PERMANENTLY"). The database refuses the badly
-- categorized row for EVERY writer, not only the Settlement Creator path. Scoped to the companies that opt in
-- (org.companies.enforce_line_categorization, set for USMCA by code — TRANSP / TRK are QBO mirrors, frozen, and carry
-- 210k historic item-less lines that this rule must never touch).
--
--   a. accounting.bill_lines / expense_lines / invoice_lines: a live line needs an item. When the writer gave none, the ONE
--      resolver below takes it from the line's account if exactly one active item of the company defaults to that account
--      (expense side for bill / expense lines, income side for invoice lines) — else the line is refused, naming the account.
--      When the writer gave an item and no account, the account is the item's default ("account from the item").
--   b. a line whose account differs from its item's default account is refused unless it carries
--      item_account_override_reason (who / why, >= 10 chars). catalogs.items: an active item of an enforcing company with no
--      category, or with neither a default expense nor income account, is refused on write.
--   c. accounting.expenses: posting_status 'posted' reads status 'posted' — written by the DB for every writer (trigger),
--      existing rows normalized (status word only), then CHECK NOT VALID -> VALIDATE.
-- Every refusal is a check_violation with a stable code word in the message. Idempotent; lock_timeout 5s.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE org.companies ADD COLUMN IF NOT EXISTS enforce_line_categorization boolean NOT NULL DEFAULT false;
UPDATE org.companies SET enforce_line_categorization = true WHERE code = 'USMCA' AND NOT enforce_line_categorization;

-- 443.80 #1: a trailer printed on the signed settlement document that is NOT in the equipment master is kept as document text;
-- trailer_id stays NULL (its ownership is on no document — creating equipment would be a guess).
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS document_trailer_number text;
ALTER TABLE accounting.bill_lines    ADD COLUMN IF NOT EXISTS item_account_override_reason text;
ALTER TABLE accounting.expense_lines ADD COLUMN IF NOT EXISTS item_account_override_reason text;
ALTER TABLE accounting.invoice_lines ADD COLUMN IF NOT EXISTS item_account_override_reason text;

-- ONE resolver for every line table. TG_ARGV[0] = 'expense' | 'income' (which item default the line's account must equal).
CREATE OR REPLACE FUNCTION accounting.enforce_line_categorization() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_enforce boolean;
  v_side text := TG_ARGV[0];
  v_account uuid;
  v_item uuid;
  v_item_account uuid;
  v_live boolean;
  v_cents bigint;
  v_count int;
BEGIN
  SELECT c.enforce_line_categorization INTO v_enforce FROM org.companies c WHERE c.id = NEW.operating_company_id;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'bill_lines' THEN
    v_live := NEW.voided_at IS NULL; v_account := NEW.account_id; v_cents := round(COALESCE(NEW.amount, 0) * 100);
  ELSIF TG_TABLE_NAME = 'expense_lines' THEN
    v_live := true; v_account := NEW.expense_account_uuid; v_cents := COALESCE(NEW.amount_cents, round(COALESCE(NEW.amount, 0) * 100));
  ELSE
    v_live := NEW.soft_deleted_at IS NULL; v_account := NEW.account_id; v_cents := COALESCE(NEW.line_total_cents, 0);
  END IF;
  IF NOT v_live THEN RETURN NEW; END IF;

  -- a. no item: the one item whose default is this account, else refused.
  IF NEW.item_id IS NULL THEN
    IF v_account IS NULL THEN
      RAISE EXCEPTION 'line_item_required: % line has neither an item nor an account', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*), min(i.id::text)::uuid INTO v_count, v_item
      FROM catalogs.items i
     WHERE i.operating_company_id = NEW.operating_company_id AND i.deactivated_at IS NULL
       AND (CASE WHEN v_side = 'income' THEN i.default_income_account_id ELSE i.default_expense_account_id END) = v_account;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'line_item_required: % line on account % names no item and % active items default to that account — the writer must pick the item',
        TG_TABLE_NAME, (SELECT a.account_number FROM catalogs.accounts a WHERE a.id = v_account), v_count USING ERRCODE = 'check_violation';
    END IF;
    NEW.item_id := v_item;
    IF TG_TABLE_NAME IN ('bill_lines', 'expense_lines') AND NEW.quantity IS NULL THEN
      NEW.quantity := 1; NEW.rate_cents := v_cents; NEW.unit_of_measure := 'each';
    ELSIF TG_TABLE_NAME = 'invoice_lines' AND NEW.unit_of_measure IS NULL THEN
      NEW.unit_of_measure := 'each';
    END IF;
  END IF;

  SELECT CASE WHEN v_side = 'income' THEN i.default_income_account_id ELSE i.default_expense_account_id END
    INTO v_item_account FROM catalogs.items i WHERE i.id = NEW.item_id AND i.operating_company_id = NEW.operating_company_id;

  -- account from the item when the writer named none.
  IF v_account IS NULL AND v_item_account IS NOT NULL THEN
    IF TG_TABLE_NAME = 'expense_lines' THEN NEW.expense_account_uuid := v_item_account; ELSE NEW.account_id := v_item_account; END IF;
    v_account := v_item_account;
  END IF;

  -- b. the line's account is its item's default account, or the line says who / why it is not.
  IF v_item_account IS DISTINCT FROM v_account AND length(trim(COALESCE(NEW.item_account_override_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'line_account_differs_from_item: % line posts to % but its item defaults to % — fix the item or give item_account_override_reason',
      TG_TABLE_NAME,
      (SELECT a.account_number FROM catalogs.accounts a WHERE a.id = v_account),
      COALESCE((SELECT a.account_number FROM catalogs.accounts a WHERE a.id = v_item_account), 'no account')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_bill_lines_enforce_categorization ON accounting.bill_lines;
CREATE TRIGGER trg_bill_lines_enforce_categorization BEFORE INSERT OR UPDATE ON accounting.bill_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_line_categorization('expense');
DROP TRIGGER IF EXISTS trg_expense_lines_enforce_categorization ON accounting.expense_lines;
CREATE TRIGGER trg_expense_lines_enforce_categorization BEFORE INSERT OR UPDATE ON accounting.expense_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_line_categorization('expense');
DROP TRIGGER IF EXISTS trg_invoice_lines_enforce_categorization ON accounting.invoice_lines;
CREATE TRIGGER trg_invoice_lines_enforce_categorization BEFORE INSERT OR UPDATE ON accounting.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.enforce_line_categorization('income');

-- b (catalog). An active item of an enforcing company needs a category and an account.
CREATE OR REPLACE FUNCTION catalogs.enforce_item_category_and_account() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.deactivated_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT c.enforce_line_categorization FROM org.companies c WHERE c.id = NEW.operating_company_id), false) THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'item_category_required: active item "%" has no category', NEW.item_name USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.default_expense_account_id IS NULL AND NEW.default_income_account_id IS NULL THEN
    RAISE EXCEPTION 'item_account_required: active item "%" has no default account', NEW.item_name USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_items_enforce_category_and_account ON catalogs.items;
CREATE TRIGGER trg_items_enforce_category_and_account BEFORE INSERT OR UPDATE ON catalogs.items
  FOR EACH ROW EXECUTE FUNCTION catalogs.enforce_item_category_and_account();

-- d. (443.73 #5) driver / unit / trailer, for EVERY writer, in an enforcing company. The physical trailer of a load is the
--    one its dispatch assignment names (dispatch.load_assignment_history.new_trailer_id, mdata.equipment — the same hub
--    accounting.expenses.trailer_id / expense_lines.trailer_id already reference; mdata.loads.load_trailer_equipment_id is
--    the trailer TYPE catalog, not a trailer). An expense header with a load and no trailer takes the load's latest assigned
--    trailer; an expense line takes the header's driver / unit / trailer where it names none. Nothing is copied into a
--    company-scoped trailer row; the cross-company triggers still check every value.
CREATE OR REPLACE FUNCTION accounting.expenses_trailer_from_load() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.trailer_id IS NOT NULL OR NEW.load_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT c.enforce_line_categorization FROM org.companies c WHERE c.id = NEW.operating_company_id), false) THEN RETURN NEW; END IF;
  NEW.trailer_id := (SELECT h.new_trailer_id FROM dispatch.load_assignment_history h
                      WHERE h.load_id = NEW.load_id AND h.new_trailer_id IS NOT NULL ORDER BY h.created_at DESC LIMIT 1);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_expenses_trailer_from_load ON accounting.expenses;
CREATE TRIGGER trg_expenses_trailer_from_load BEFORE INSERT OR UPDATE OF load_id, trailer_id ON accounting.expenses
  FOR EACH ROW EXECUTE FUNCTION accounting.expenses_trailer_from_load();

CREATE OR REPLACE FUNCTION accounting.expense_lines_attribution_from_header() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE h record;
BEGIN
  IF NEW.driver_id IS NOT NULL AND NEW.unit_id IS NOT NULL AND NEW.trailer_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT c.enforce_line_categorization FROM org.companies c WHERE c.id = NEW.operating_company_id), false) THEN RETURN NEW; END IF;
  SELECT e.driver_uuid, e.unit_id, e.trailer_id INTO h FROM accounting.expenses e WHERE e.id = NEW.expense_id;
  NEW.driver_id := COALESCE(NEW.driver_id, h.driver_uuid);
  NEW.unit_id := COALESCE(NEW.unit_id, h.unit_id);
  NEW.trailer_id := COALESCE(NEW.trailer_id, h.trailer_id);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_expense_lines_attribution_from_header ON accounting.expense_lines;
CREATE TRIGGER trg_expense_lines_attribution_from_header BEFORE INSERT ON accounting.expense_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.expense_lines_attribution_from_header();

-- c. one status vocabulary on expenses, for EVERY writer: an expense whose posting_status is 'posted' reads status 'posted'.
-- Not only the Creator's stamp left 'draft' behind — a fuel document re-created by the fuel engine (13557-3, 13550-5 on the
-- rehearsal fork) did too — so the database writes the word itself, and the CHECK is the backstop. The rows already in
-- that state are brought to the one vocabulary here (status word only; no amount, account, journal entry or posting).
CREATE OR REPLACE FUNCTION accounting.expenses_posted_reads_posted() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.posting_status = 'posted' AND NEW.status = 'draft' THEN NEW.status := 'posted'; END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_expenses_posted_reads_posted ON accounting.expenses;
CREATE TRIGGER trg_expenses_posted_reads_posted BEFORE INSERT OR UPDATE OF posting_status, status ON accounting.expenses
  FOR EACH ROW EXECUTE FUNCTION accounting.expenses_posted_reads_posted();
UPDATE accounting.expenses SET status = 'posted', updated_at = now()
 WHERE posting_status = 'posted' AND status = 'draft' AND voided_at IS NULL;

ALTER TABLE accounting.expenses DROP CONSTRAINT IF EXISTS expenses_posted_is_not_draft;
ALTER TABLE accounting.expenses ADD CONSTRAINT expenses_posted_is_not_draft
  CHECK (NOT (posting_status = 'posted' AND status = 'draft')) NOT VALID;
ALTER TABLE accounting.expenses VALIDATE CONSTRAINT expenses_posted_is_not_draft;

COMMIT;
