-- ROUND 155.18 -- 14 tables in accounting/banking/driver_finance carried no audit trigger at all
-- (confirmed live via pg_trigger sweep, 2026-09-28): a DELETE, UPDATE, or INSERT on any of them left
-- no row_changes record. This is the owner's own stated condition, ahead of anything else in scope:
-- "audit triggers added to tables that lack them FIRST."
--
-- Uses the existing, already-proven audit.ensure_row_trigger(schema, table) helper (0276_audit_
-- triggers.sql) -- the SAME function that installs every other trg_audit_*/tg_audit_row_* trigger
-- in this codebase. No new trigger logic, no new function: this migration only calls that existing
-- helper for the 14 gap tables. Idempotent (ensure_row_trigger does DROP TRIGGER IF EXISTS + CREATE).
--
-- None of these 14 tables currently intersect ROUND 155.18's active voided-row purge scope (checked
-- live: zero of them appear in the 25-table nonzero-voided-rows list) -- this is a standalone
-- hardening fix, not a purge prerequisite for what's actually being deleted today, but is applied
-- first regardless, per the owner's condition, in case that changes.

SELECT audit.ensure_row_trigger('accounting', 'broker_advances');
SELECT audit.ensure_row_trigger('accounting', 'cash_flow_row_adjustments');
SELECT audit.ensure_row_trigger('accounting', 'company_settlement_driver_settlements');
SELECT audit.ensure_row_trigger('accounting', 'company_settlements');
SELECT audit.ensure_row_trigger('accounting', 'invoice_disputes');
SELECT audit.ensure_row_trigger('banking', 'check_number_registry');
SELECT audit.ensure_row_trigger('banking', 'check_print_batch_items');
SELECT audit.ensure_row_trigger('banking', 'check_print_batches');
SELECT audit.ensure_row_trigger('banking', 'check_stock_settings');
SELECT audit.ensure_row_trigger('banking', 'reconciliation_drift_alerts');
SELECT audit.ensure_row_trigger('driver_finance', 'deduction_recovery_links');
SELECT audit.ensure_row_trigger('driver_finance', 'historical_settlement_attribution_items');
SELECT audit.ensure_row_trigger('driver_finance', 'historical_settlement_attributions');
SELECT audit.ensure_row_trigger('driver_finance', 'presettlement_link_suggestions');
