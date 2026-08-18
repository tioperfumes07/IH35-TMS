-- LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER — 55 tables in accounting/driver_finance/banking (a live
-- re-measurement 2026-08-18 against the same baseline methodology as commit 83cec4b45, which fixed
-- journal_entry_postings and brought coverage from 11/134 to 79/134; the "55 remain unaudited"
-- board figure matches exactly) still carry no audit trigger at all. This migration attaches the
-- SAME reused, schema-agnostic `audit.tg_audit_row()` function (no new audit logic written here) to
-- every one of them — accounting.line_category_load_required is the one new table added by
-- migration 0093 that this list also happens to include, since it was created after the original
-- 134-table baseline.
--
-- MEASURED ON PROD (Neon project tiny-field-89581227) 2026-08-18, RLS-bypassed
-- (SET LOCAL app.bypass_rls='lucia', own statement), from pg_trigger / pg_proc — identical
-- methodology to 83cec4b45: every base table in accounting/driver_finance/banking LEFT JOINed
-- against pg_trigger rows named ILIKE '%audit%', filtered to NULL (no audit trigger at all):
--
--   accounting (48): ap_import_preview_lines, ar_collection_contacts, ar_collection_tasks,
--     banking_rules, cash_forecast_settings, chart_of_accounts_roles, coa_account,
--     customer_classifications, depreciation_autopost_runs, expense_category_account_map,
--     factoring_lifecycle_posting_keys, fixed_asset_classes, fixed_asset_disposals, fixed_assets,
--     form_1042_s, form_1099_nec, lease_asset_line, lease_classification,
--     line_category_load_required, ob_register_staging_lines, ob_source_finality, outbox_events,
--     period_cash_basis_snapshot, periods, ps_category, ps_item, pse_posting_policy, qbo_accounts,
--     qbo_customers, qbo_remote_count_collection_state, qbo_remote_counts, qbo_vendors,
--     recon_exceptions, recon_runs, recurring_bill_generation_log, recurring_bill_templates,
--     recurring_templates, related_party_loan_entries, revenue_contracts, revenue_obligations,
--     sales_tax_agencies, sales_tax_returns, settlement_posting_config, tax_document,
--     tax_document_batch, vendor_classifications, vendor_credit_applications,
--     vendor_subtype_pse_map
--   banking (5): equipment_loans, intercompany_entity_pairs, intercompany_transfer_groups,
--     reconciliation_matches, transaction_categories
--   driver_finance (2): settlement_preview_costs, trip_link_queue
--
-- `audit.tg_audit_row()` is schema-agnostic (SECURITY DEFINER, derives tenant from whichever
-- scoping column the row has via to_jsonb — tenant_id/operating_company_id/owner_company_id/
-- default_company_id/company_id, or NULL when none apply — and falls back to md5(row) for a PK when
-- neither `id` nor `uuid` is present) — the same reused function 202612610000 and ACCT-F178's
-- money-column predicate migration (202612350000) already extend, no new audit logic here.
--
-- IDEMPOTENT: each trigger is created only when absent (NOT EXISTS against pg_trigger/pg_proc), so a
-- re-run is a no-op and this replays safely on a branch or a fresh CI database. Skips silently when
-- a listed table does not exist on a given DB (fresh/CI schemas that predate a later table addition).

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('accounting', 'ap_import_preview_lines'),
      ('accounting', 'ar_collection_contacts'),
      ('accounting', 'ar_collection_tasks'),
      ('accounting', 'banking_rules'),
      ('accounting', 'cash_forecast_settings'),
      ('accounting', 'chart_of_accounts_roles'),
      ('accounting', 'coa_account'),
      ('accounting', 'customer_classifications'),
      ('accounting', 'depreciation_autopost_runs'),
      ('accounting', 'expense_category_account_map'),
      ('accounting', 'factoring_lifecycle_posting_keys'),
      ('accounting', 'fixed_asset_classes'),
      ('accounting', 'fixed_asset_disposals'),
      ('accounting', 'fixed_assets'),
      ('accounting', 'form_1042_s'),
      ('accounting', 'form_1099_nec'),
      ('accounting', 'lease_asset_line'),
      ('accounting', 'lease_classification'),
      ('accounting', 'line_category_load_required'),
      ('accounting', 'ob_register_staging_lines'),
      ('accounting', 'ob_source_finality'),
      ('accounting', 'outbox_events'),
      ('accounting', 'period_cash_basis_snapshot'),
      ('accounting', 'periods'),
      ('accounting', 'ps_category'),
      ('accounting', 'ps_item'),
      ('accounting', 'pse_posting_policy'),
      ('accounting', 'qbo_accounts'),
      ('accounting', 'qbo_customers'),
      ('accounting', 'qbo_remote_count_collection_state'),
      ('accounting', 'qbo_remote_counts'),
      ('accounting', 'qbo_vendors'),
      ('accounting', 'recon_exceptions'),
      ('accounting', 'recon_runs'),
      ('accounting', 'recurring_bill_generation_log'),
      ('accounting', 'recurring_bill_templates'),
      ('accounting', 'recurring_templates'),
      ('accounting', 'related_party_loan_entries'),
      ('accounting', 'revenue_contracts'),
      ('accounting', 'revenue_obligations'),
      ('accounting', 'sales_tax_agencies'),
      ('accounting', 'sales_tax_returns'),
      ('accounting', 'settlement_posting_config'),
      ('accounting', 'tax_document'),
      ('accounting', 'tax_document_batch'),
      ('accounting', 'vendor_classifications'),
      ('accounting', 'vendor_credit_applications'),
      ('accounting', 'vendor_subtype_pse_map'),
      ('banking', 'equipment_loans'),
      ('banking', 'intercompany_entity_pairs'),
      ('banking', 'intercompany_transfer_groups'),
      ('banking', 'reconciliation_matches'),
      ('banking', 'transaction_categories'),
      ('driver_finance', 'settlement_preview_costs'),
      ('driver_finance', 'trip_link_queue')
    ) AS t(schema_name, table_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = r.schema_name AND c.relname = r.table_name AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = r.schema_name AND c.relname = r.table_name
         AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER tg_audit_row_%s AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()',
        r.table_name, r.schema_name, r.table_name
      );
      RAISE NOTICE 'LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER: audit trigger attached to %.%', r.schema_name, r.table_name;
    END IF;
  END LOOP;
END
$$;

COMMIT;
