import json
CO = "5c854333-6ea5-4faa-af31-67cb272fef80"
ORDER = ["accounting.transaction_source_links","accounting.journal_entry_postings","accounting.escrow_postings","accounting.expense_lines","banking.bank_transaction_splits","driver_finance.settlement_contract_lines","fuel.fuel_transactions","driver_finance.driver_settlement_deductions","accounting.expenses","accounting.factoring_default_interest_accruals","accounting.factoring_lifecycle_posting_keys","accounting.factoring_reserve_movements","accounting.load_revenue_recognition_postings","banking.reconciliation_drift_alerts","driver_finance.driver_advances","driver_finance.driver_settlement_gl_bills","driver_finance.driver_reimbursements","driver_finance.escrow_ledger","driver_finance.settlement_lines","driver_finance.driver_bills","driver_finance.deduction_schedule","driver_finance.driver_liabilities","driver_finance.driver_settlement_gl_runs","driver_finance.payrun_gl_runs","accounting.journal_entries","accounting.posting_batches","accounting.invoice_disputes","dispatch.load_cancellations","accounting.invoice_lines","accounting.payment_applications","accounting.invoices","accounting.bill_lines","accounting.bills","accounting.factoring_advances","accounting.company_settlements","accounting.outbox_events","accounting.ob_register_audit_events","accounting.period_cash_basis_snapshot","driver_finance.escrow_balances","driver_finance.presettlement_link_suggestions","driver_finance.driver_settlements","driver_finance.settlement_payment_events","dispatch.load_assignment_history","dispatch.load_charge_lines","dispatch.load_id_reservations","dispatch.driver_layovers","dispatch.manual_delivery_authorizations","dispatch.intransit_issues","dispatch.stop_arrivals","dispatch.pod_documents","expense_attribution.expense_load_links","expense_attribution.expense_seq_per_load","mdata.load_stop_legs","mdata.load_stops","mdata.loads","banking.reconciliation_matches"]
LOADS = "load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '%s')" % CO
CHILD = {
  "mdata.load_stops": LOADS,
  "mdata.load_stop_legs": LOADS,
  "expense_attribution.expense_seq_per_load": LOADS,
  "accounting.payment_applications": "invoice_id IN (SELECT id FROM accounting.invoices WHERE operating_company_id = '%s')" % CO,
  "banking.bank_transaction_splits": "result_journal_entry_id IN (SELECT id FROM accounting.journal_entries WHERE operating_company_id = '%s')\n    OR %s" % (CO, LOADS),
}
KEEP = json.load(open("scripts/purge/usmca-purge-classification.json"))
L = []
a = L.append
a("-- USMCA TRANSACTION PURGE - GENERATED 2026-09-23 from the live schema.")
a("-- Source of truth: scripts/purge/usmca-purge-classification.json + live pg_constraint.")
a("-- DO NOT HAND-EDIT. Change the classification and regenerate.")
a("-- Company %s (USMCA). Banking is EXCLUDED: bank transactions," % CO)
a("-- accounts and categories are KEPT. Only match/split/alert rows pointing at purged")
a("-- documents go, and the bank transactions they pointed at are simply left unmatched.")
a("-- Order below is reverse foreign-key order, computed from live pg_constraint.")
a("-- THIS FILE DOES NOT COMMIT. It ends in ROLLBACK. The owner uncomments COMMIT, once,")
a("-- at the moment he says \"run the purge\", and never before a fresh pre-purge snapshot exists.")
a("")
a("BEGIN;")
a("SET LOCAL app.bypass_rls = 'lucia';")
a("SET LOCAL app.operating_company_id = '%s';" % CO)
a("SET LOCAL app.current_operating_company_id = '%s';" % CO)
a("")
a("-- ---------------------------------------------------------------------------")
a("-- STEP 0. BREAK THE FOREIGN-KEY CYCLES. All four columns verified nullable live.")
a("--   accounting.expenses -> fuel.fuel_transactions -> driver_settlement_deductions -> expenses")
a("--   driver_settlement_deductions <-> fuel.fuel_transactions")
a("-- ---------------------------------------------------------------------------")
a("UPDATE accounting.expenses SET source_fuel_transaction_id = NULL")
a(" WHERE operating_company_id = '%s';" % CO)
a("UPDATE driver_finance.driver_settlement_deductions")
a("   SET source_fuel_transaction_id = NULL, source_expense_id = NULL")
a(" WHERE operating_company_id = '%s';" % CO)
a("UPDATE fuel.fuel_transactions SET overage_deduction_id = NULL")
a(" WHERE operating_company_id = '%s';" % CO)
a("")
a("-- Break the self-referencing reversal links on journal entries.")
a("UPDATE accounting.journal_entries SET reversed_by_je_id = NULL, reverses_je_id = NULL")
a(" WHERE operating_company_id = '%s';" % CO)
a("")
a("-- ---------------------------------------------------------------------------")
a("-- STEP 1. DELETE, CHILDREN FIRST. %d tables." % len(ORDER))
a("-- ---------------------------------------------------------------------------")
for i, t in enumerate(ORDER, 1):
    a("")
    a("-- %2d/%d" % (i, len(ORDER)))
    a("DELETE FROM %s" % t)
    a(" WHERE %s;" % CHILD.get(t, "operating_company_id = '%s'" % CO))
a("")
a("-- ---------------------------------------------------------------------------")
a("-- NOT HERE ON PURPOSE")
a("--   docs.files / docs.file_links - the 2026-09-22 SQL deleted all 475 USMCA rows.")
a("--   Owner-uploaded source documents are evidence and are KEPT. Only app-generated")
a("--   artifacts of purged documents may go, in their own reviewed step.")
a("--   banking.bank_transactions / bank_accounts / transaction_categories - banking is")
a("--   excluded from the purge by the owner's own scope.")
a("--   All master data - customers, vendors, drivers, locations, chart of accounts, pay")
a("--   rates, escrow settings, periods - is KEPT. The classification file names every one.")
a("-- ---------------------------------------------------------------------------")
a("")
a("-- COMMIT;   -- owner only, at the moment of the purge")
a("ROLLBACK;")
open("scripts/purge/usmca-transaction-purge.generated.sql", "w").write("\n".join(L) + "\n")
json.dump({
  "_generated": "2026-09-23",
  "_source": "scripts/purge/emit.py - the same run that emitted the SQL, so the two cannot drift",
  "_law": "verify-purge must read THIS list. A verifier with its own hand-typed table list is how a bad purge reported green.",
  "company_id": CO,
  "must_be_zero_after_purge": [{"table": t, "where": CHILD.get(t, "operating_company_id = '%s'" % CO)} for t in ORDER],
  "must_be_unchanged": KEEP["KEEP"] + KEEP["KEEP_BANKING"],
}, open("scripts/purge/usmca-purge-expected-zero.generated.json", "w"), indent=2)
print("%d deletes, %d kept tables" % (len(ORDER), len(KEEP["KEEP"]) + len(KEEP["KEEP_BANKING"])))
