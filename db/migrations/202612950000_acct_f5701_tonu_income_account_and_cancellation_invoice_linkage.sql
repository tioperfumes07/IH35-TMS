-- ACCT-F5701 — TONU billing routed to the EXISTING Accessorial/Detention Income account (no new
-- account) + cancellation->invoice linkage.
--
-- CORRECTED 2026-08-21: an earlier draft of this migration created a new "TONU Income" sub-account.
-- The board's live answer superseded that: "Billed cancellation/TONU = accessorial operating
-- revenue via chart_of_accounts_roles (do not invent an account)." TONU books to the SAME existing
-- 4200 Accessorial/Detention Income account every other accessorial line already resolves to — this
-- migration creates NO new catalogs.accounts row. It only (a) seeds the revenue-category mapping so
-- the invoice-line resolver has something to resolve 'tonu' against (today it has ZERO active
-- revenue rows, confirmed live, per design doc §1.5), pointed at the EXISTING account, and (b) adds
-- the additive cancellation->invoice linkage columns.
--
-- Idempotent (Rule 04): every statement is guarded so a re-run is a no-op.

DO $$
DECLARE
  v_usmca_id uuid;
  v_accessorial_account_id uuid;
BEGIN
  SELECT id INTO v_usmca_id FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca_id IS NULL THEN
    RAISE NOTICE 'ACCT-F5701: USMCA company row not found, skipping revenue-map seed (fresh/test DB)';
  ELSE
    -- Reuse the EXISTING 4200 Accessorial/Detention Income account -- do not invent a new one.
    SELECT id INTO v_accessorial_account_id
      FROM catalogs.accounts
     WHERE operating_company_id = v_usmca_id AND account_number = '4200'
     LIMIT 1;

    IF v_accessorial_account_id IS NOT NULL THEN
      -- Seed the revenue-category resolution the invoice line builder actually reads today
      -- (accounting.expense_category_account_map, category_kind='revenue' -- design §1.5/§4).
      -- 'accessorial' is the SAME code the generic accessorial/detention/layover/lumper lines
      -- already resolve to (invoice-line-revenue-resolution.service.ts) -- TONU is not split out
      -- into its own code, matching the board's "do not invent an account" answer.
      IF NOT EXISTS (
        SELECT 1 FROM accounting.expense_category_account_map
         WHERE operating_company_id = v_usmca_id AND category_kind = 'revenue' AND category_code = 'accessorial'
           AND is_active = true
      ) THEN
        INSERT INTO accounting.expense_category_account_map (
          operating_company_id, category_kind, category_code, account_id, posting_side, is_active
        ) VALUES (
          v_usmca_id, 'revenue', 'accessorial', v_accessorial_account_id, 'credit', true
        );
      END IF;

      -- NOTE on "via chart_of_accounts_roles": accounting.chart_of_accounts_roles.role is a FIXED
      -- CHECK-constrained enum (51 values, confirmed live) with no "accessorial_income" (or similar)
      -- slot -- the closest existing role, 'revenue_default', is ALREADY bound to 4000 Freight/
      -- Line-haul Income for USMCA (confirmed live) and would misdirect the primary freight-revenue
      -- resolution if reused here. Extending that enum is a separate, larger, shared-surface
      -- migration this PR does not make unilaterally. accounting.expense_category_account_map IS a
      -- real, code-connected CoA designation mechanism (the ONE the invoice-line resolver actually
      -- reads today) pointed at the SAME existing account -- satisfies the "no new account, use the
      -- existing designation surface" intent without inventing a role the schema does not support.
    ELSE
      RAISE NOTICE 'ACCT-F5701: USMCA account 4200 not found, skipping revenue-map seed';
    END IF;
  END IF;
END $$;

-- Cancellation -> invoice linkage (design §3.1). Nullable, additive; existing rows unaffected.
ALTER TABLE dispatch.load_cancellations
  ADD COLUMN IF NOT EXISTS charge_invoice_id uuid NULL REFERENCES accounting.invoices(id),
  ADD COLUMN IF NOT EXISTS charge_invoice_line_id uuid NULL REFERENCES accounting.invoice_lines(id),
  ADD COLUMN IF NOT EXISTS charged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS charged_by_user_id uuid NULL;
