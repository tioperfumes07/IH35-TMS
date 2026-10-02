-- 202615310100_no_posting_to_dead_account.sql
-- CC-1 · Lead ROUND 339 order 1 — NOTHING POSTS TO A DEAD ACCOUNT. Owner: "FIX NOTHING SHOULD POST WERE IT SHOULD NOT".
--
-- The account a posting lands on is SELECTED through config — chart_of_accounts_roles, catalogs.items defaults,
-- posting templates, provider maps — none of which carried a guard. So a deactivated or non-postable (header) account
-- kept receiving money. Re-measured on prod 2026-10-02 (bypass), all companies:
--   postings on a dead account ........ USMCA 5010 DEF (deactivated 2026-09-23) 223 lines, last 2026-10-01;
--                                        TRK 2000 A/P (non-postable) 2 lines, 2026-07-29
--   active roles on a dead account ..... USMCA expense_default -> OFFICEEXPENS815299 Office Expense (deactivated);
--                                        TRANSP related_party_interest_expense -> 6810 (header, 2 children);
--                                        TRK uncategorized_expense -> TRK-6999 (header)
--   item defaults on a dead account .... USMCA 2 DEF items -> 5010 (deactivated); 4 trailer-repair items -> 5450
--                                        (non-postable, yet a LEAF: no children, 0 lines)
--   posting templates on a dead account  USMCA 7 active templates debit OFFICEEXPENS815299
--
-- SELECTION FIXES (before arming — the companions would otherwise refuse at migration time):
--   * 5010 DEF reactivated. The item master and expense_category_account_map both target it and the ROUND 291
--     reclass proved it is the DEF account: the deactivation was the error. (Lead ruling; one UPDATE to reverse.)
--   * 5450 Trailer Repairs & Maintenance made postable: a leaf with no children that the item master targets — the
--     non-postable flag was the error, the same shape as 5010.
--   * expense_default (USMCA) and the 7 templates' debit repointed from the dead Office Expense to 6210 Office &
--     Administrative Expense, the live account of the same meaning.
--   * TRANSP related_party_interest_expense and TRK uncategorized_expense DEACTIVATED (0 postings each): their targets
--     are header accounts with no single correct child, so no live target exists without an owner ruling. A caller
--     now gets CoaRoleResolutionError naming the role — fail closed — instead of posting into a header.
-- ARMED:
--   (1) trg_refuse_posting_to_dead_account — BEFORE INSERT OR UPDATE OF account_id ON journal_entry_postings: refused
--       when the account is deactivated or non-postable, naming number and name. EXCEPTION: a line of a REVERSING
--       entry (journal_entries.reverses_je_id IS NOT NULL) may land on the account it reverses — a void must net the
--       original to zero on the same account, or the books can never be corrected. No backfill; history untouched.
--   (2) trg_refuse_active_role_on_dead_account — an ACTIVE role may not point at a dead account.
--   (3) trg_refuse_item_default_on_dead_account — an item's default income / expense account may not be dead.
--   (4) trg_refuse_killing_a_referenced_account — deactivating an account, or making it non-postable, is refused
--       while an active role or an item default still targets it (otherwise (2)/(3) are bypassed from the other side).
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('app.bypass_rls', 'lucia', true);

-- ── shared predicate ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogs.account_is_dead(p_account uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
  SELECT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.id = p_account AND (a.deactivated_at IS NOT NULL OR a.is_postable IS NOT TRUE));
$fn$;

CREATE OR REPLACE FUNCTION catalogs.account_label(p_account uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
  SELECT a.account_number || ' ' || a.account_name
         || CASE WHEN a.deactivated_at IS NOT NULL THEN ' (deactivated ' || a.deactivated_at::date || ')' ELSE ' (non-postable)' END
    FROM catalogs.accounts a WHERE a.id = p_account;
$fn$;

-- ── selection fixes ──────────────────────────────────────────────────────────────────────────────────────────────
UPDATE catalogs.accounts a SET deactivated_at = NULL
  FROM org.companies c
 WHERE c.id = a.operating_company_id AND c.code = 'USMCA' AND a.account_number = '5010' AND a.deactivated_at IS NOT NULL;

UPDATE catalogs.accounts a SET is_postable = true
  FROM org.companies c
 WHERE c.id = a.operating_company_id AND c.code = 'USMCA' AND a.account_number = '5450' AND a.is_postable IS NOT TRUE
   AND a.deactivated_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM catalogs.accounts ch WHERE ch.parent_account_id = a.id);

UPDATE accounting.chart_of_accounts_roles r
   SET account_id = live.id, updated_at = now()
  FROM org.companies c, catalogs.accounts dead, catalogs.accounts live
 WHERE c.id = r.operating_company_id AND c.code = 'USMCA'
   AND r.role = 'expense_default' AND r.is_active
   AND dead.id = r.account_id AND dead.account_number = 'OFFICEEXPENS815299'
   AND live.operating_company_id = c.id AND live.account_number = '6210' AND live.deactivated_at IS NULL AND live.is_postable;

UPDATE catalogs.posting_templates t
   SET debit_account_id = live.id, updated_at = now()
  FROM catalogs.accounts dead, catalogs.accounts live, org.companies c
 WHERE dead.id = t.debit_account_id AND dead.account_number = 'OFFICEEXPENS815299'
   AND c.id = dead.operating_company_id AND c.code = 'USMCA'
   AND live.operating_company_id = c.id AND live.account_number = '6210' AND live.deactivated_at IS NULL AND live.is_postable;

UPDATE accounting.chart_of_accounts_roles r
   SET is_active = false, updated_at = now()
  FROM org.companies c, catalogs.accounts a
 WHERE c.id = r.operating_company_id AND a.id = r.account_id AND r.is_active
   AND ((c.code = 'TRANSP' AND r.role = 'related_party_interest_expense' AND a.account_number = '6810')
     OR (c.code = 'TRK' AND r.role = 'uncategorized_expense' AND a.account_number = 'TRK-6999'))
   AND (a.deactivated_at IS NOT NULL OR a.is_postable IS NOT TRUE);

-- Pre-arm check: nothing the companions would refuse remains.
DO $$
DECLARE n_role bigint; n_item bigint; n_tmpl bigint;
BEGIN
  SELECT count(*) INTO n_role FROM accounting.chart_of_accounts_roles r WHERE r.is_active AND catalogs.account_is_dead(r.account_id);
  SELECT count(*) INTO n_item FROM catalogs.items i WHERE catalogs.account_is_dead(i.default_expense_account_id) OR catalogs.account_is_dead(i.default_income_account_id);
  SELECT count(*) INTO n_tmpl FROM catalogs.posting_templates t WHERE t.is_active AND (catalogs.account_is_dead(t.debit_account_id) OR catalogs.account_is_dead(t.credit_account_id));
  RAISE NOTICE '202615310100 pre-arm: active roles on dead accounts %, item defaults on dead accounts %, active templates on dead accounts %', n_role, n_item, n_tmpl;
  IF n_role <> 0 OR n_item <> 0 THEN
    RAISE EXCEPTION '202615310100: % active role(s) / % item default(s) still target a dead account — resolve before arming', n_role, n_item;
  END IF;
END $$;

-- ── (1) postings ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting.refuse_posting_to_dead_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF catalogs.account_is_dead(NEW.account_id) THEN
    -- A reversing entry nets the original on the account it was booked to; that is the only way back.
    IF EXISTS (SELECT 1 FROM accounting.journal_entries j WHERE j.id = NEW.journal_entry_uuid AND j.reverses_je_id IS NOT NULL) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'posting refused: account % is not postable. Nothing posts to a deactivated or header account — fix the role / item / template that selected it.', catalogs.account_label(NEW.account_id)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_posting_to_dead_account ON accounting.journal_entry_postings;
CREATE TRIGGER trg_refuse_posting_to_dead_account
  BEFORE INSERT OR UPDATE OF account_id ON accounting.journal_entry_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_posting_to_dead_account();

-- ── (2) roles ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting.refuse_active_role_on_dead_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF NEW.is_active AND catalogs.account_is_dead(NEW.account_id) THEN
    RAISE EXCEPTION 'role % refused: it would be active on %. An active role must select a live, postable account.', NEW.role, catalogs.account_label(NEW.account_id)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_active_role_on_dead_account ON accounting.chart_of_accounts_roles;
CREATE TRIGGER trg_refuse_active_role_on_dead_account
  BEFORE INSERT OR UPDATE OF account_id, is_active ON accounting.chart_of_accounts_roles
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_active_role_on_dead_account();

-- ── (3) item defaults ────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogs.refuse_item_default_on_dead_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF catalogs.account_is_dead(NEW.default_expense_account_id) THEN
    RAISE EXCEPTION 'item % refused: default expense account %. An item must default to a live, postable account.', NEW.id, catalogs.account_label(NEW.default_expense_account_id)
      USING ERRCODE = 'check_violation';
  END IF;
  IF catalogs.account_is_dead(NEW.default_income_account_id) THEN
    RAISE EXCEPTION 'item % refused: default income account %. An item must default to a live, postable account.', NEW.id, catalogs.account_label(NEW.default_income_account_id)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_item_default_on_dead_account ON catalogs.items;
CREATE TRIGGER trg_refuse_item_default_on_dead_account
  BEFORE INSERT OR UPDATE OF default_expense_account_id, default_income_account_id ON catalogs.items
  FOR EACH ROW EXECUTE FUNCTION catalogs.refuse_item_default_on_dead_account();

-- ── (4) the other side: killing an account that is still selected ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogs.refuse_killing_a_referenced_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE v_roles text; v_items bigint;
BEGIN
  IF (NEW.deactivated_at IS NOT NULL OR NEW.is_postable IS NOT TRUE)
     AND NOT (OLD.deactivated_at IS NOT NULL OR OLD.is_postable IS NOT TRUE) THEN
    SELECT string_agg(r.role, ', ') INTO v_roles FROM accounting.chart_of_accounts_roles r WHERE r.account_id = NEW.id AND r.is_active;
    SELECT count(*) INTO v_items FROM catalogs.items i WHERE NEW.id IN (i.default_expense_account_id, i.default_income_account_id);
    IF v_roles IS NOT NULL OR v_items > 0 THEN
      RAISE EXCEPTION 'account % % cannot be deactivated / made non-postable: still selected by active role(s) [%] and % item default(s). Repoint them first.', NEW.account_number, NEW.account_name, COALESCE(v_roles, ''), v_items
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_killing_a_referenced_account ON catalogs.accounts;
CREATE TRIGGER trg_refuse_killing_a_referenced_account
  BEFORE UPDATE OF deactivated_at, is_postable ON catalogs.accounts
  FOR EACH ROW EXECUTE FUNCTION catalogs.refuse_killing_a_referenced_account();
COMMIT;
