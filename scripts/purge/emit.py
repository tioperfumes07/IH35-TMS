import json
import os
import tempfile

# WHERE THE GENERATED SQL GOES -- AND WHY IT IS NEVER THE REPO.
#
# verify-no-hard-delete-document-number-tables scans scripts/** ON DISK for DELETE FROM against
# any document-number table (bills, credit_memos, expenses, factoring_advances, invoices,
# payments, vendor_credits), because deleting one of those rows lets MAX+1 numbering re-issue a
# number that was already used. That guard is CORRECT and it stays.
#
# I already fixed this for build-usmca-purge.mjs (#22359) and left THIS script still writing
# into scripts/purge/. Running it put the file back on disk and the guard failed again -- which
# is how it was caught: by running the guard after my own change instead of assuming it passed.
# gitignore does not help, because the guard reads the working tree, not the index.
OUT_DIR = os.environ.get("USMCA_PURGE_OUT") or tempfile.mkdtemp(prefix="usmca-purge-")
if os.path.abspath(OUT_DIR).startswith(os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))):
    raise SystemExit(
        "REFUSED: USMCA_PURGE_OUT is inside the repository. The generated SQL contains DELETE "
        "FROM on document-number tables and would fail "
        "verify-no-hard-delete-document-number-tables for every seat. Point it outside the tree."
    )
CO = "5c854333-6ea5-4faa-af31-67cb272fef80"
ORDER = ["accounting.transaction_source_links","accounting.journal_entry_postings","accounting.escrow_postings","accounting.expense_lines","banking.bank_transaction_splits","driver_finance.settlement_contract_lines","fuel.fuel_transactions","driver_finance.driver_settlement_deductions","accounting.expenses","accounting.factoring_default_interest_accruals","accounting.factoring_lifecycle_posting_keys","accounting.factoring_reserve_movements","accounting.load_revenue_recognition_postings","banking.reconciliation_drift_alerts","driver_finance.driver_advances","driver_finance.driver_settlement_gl_bills","driver_finance.driver_reimbursements","driver_finance.escrow_ledger","driver_finance.settlement_lines","driver_finance.driver_bills","driver_finance.deduction_schedule","driver_finance.driver_liabilities","driver_finance.driver_settlement_gl_runs","driver_finance.payrun_gl_runs","accounting.journal_entries","accounting.posting_batches","accounting.invoice_disputes","dispatch.load_cancellations","accounting.invoice_lines","accounting.payment_applications","accounting.invoices","accounting.bill_lines","accounting.bills","accounting.factoring_advances","accounting.company_settlements","accounting.outbox_events","accounting.ob_register_audit_events","accounting.period_cash_basis_snapshot","driver_finance.escrow_balances","driver_finance.presettlement_link_suggestions","driver_finance.driver_settlements","driver_finance.settlement_payment_events","dispatch.load_assignment_history","dispatch.load_charge_lines","dispatch.load_id_reservations","dispatch.driver_layovers","dispatch.manual_delivery_authorizations","dispatch.intransit_issues","dispatch.stop_arrivals","dispatch.pod_documents","expense_attribution.expense_load_links","expense_attribution.expense_seq_per_load","mdata.load_stop_legs","mdata.load_stops","mdata.loads","banking.reconciliation_matches"]
LOADS = "load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '%s')" % CO

# ---------------------------------------------------------------------------------------------
# LIVE-ROW PREDICATES — measured live, never assumed.
#
# After the mass void, a guard that counts rows counts VOIDED rows too and reports a table as
# non-empty when every row in it is dead. Cursor hit exactly this: three of his eight
# purge-window arms count every row, voided included. So the generated file now carries, per
# table, the predicate that means "this row is still alive" -- read off the columns each table
# ACTUALLY has (information_schema, production, 2026-09-23), not a pattern assumed to be uniform.
#
# A table with NO void column gets live_predicate = null, ON PURPOSE. That is the honest answer,
# not an oversight: those rows carry no flag, so "is it live" cannot be answered from the row
# itself -- it is answered by the parent document or, for a document-correction reversal, only
# by the account netting to zero. A guard that defaulted such a table to "all rows live" would
# report a clean void as dirty forever; one that defaulted to "all dead" would hide real rows.
# Null forces the guard to say which, out loud.
# ---------------------------------------------------------------------------------------------
LIVE = {
    # The five-column liveness test, in its home table.
    "accounting.journal_entries":
        "voided_at IS NULL AND reversed_by_je_id IS NULL AND reverses_je_id IS NULL",
    # The line-level half of the same test.
    "accounting.journal_entry_postings": "reversed_by_line_id IS NULL",
    # Documents that carry their own void stamp.
    "accounting.expenses": "voided_at IS NULL",
    "accounting.bills": "voided_at IS NULL",
    "accounting.bill_lines": "voided_at IS NULL",
    "accounting.invoices": "voided_at IS NULL",
    "accounting.company_settlements": "voided_at IS NULL",
    "accounting.load_revenue_recognition_postings": "voided_at IS NULL",
    "driver_finance.driver_settlements": "voided_at IS NULL",
    "driver_finance.driver_settlement_deductions": "voided_at IS NULL",
    "driver_finance.driver_bills": "voided_at IS NULL",
    "driver_finance.driver_advances": "voided_at IS NULL",
    "driver_finance.driver_liabilities": "voided_at IS NULL",
    "driver_finance.settlement_lines": "voided_at IS NULL",
    # Not voided -- soft deleted. Different column, same question.
    "accounting.invoice_lines": "soft_deleted_at IS NULL",
    "mdata.loads": "soft_deleted_at IS NULL",
    # Not voided -- archived.
    "fuel.fuel_transactions": "archived_at IS NULL",
    # Status-only, no timestamp. Named separately so nobody mistakes it for a void stamp.
    "accounting.factoring_advances": "status <> 'voided'",
    "accounting.invoice_disputes": "status <> 'voided'",
    "driver_finance.escrow_balances": "status <> 'voided'",
}
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
_sql_path = os.path.join(OUT_DIR, "usmca-transaction-purge.generated.sql")
open(_sql_path, "w").write("\n".join(L) + "\n")
json.dump({
  "_generated": "2026-09-23",
  "_source": "scripts/purge/emit.py - the same run that emitted the SQL, so the two cannot drift",
  "_law": "verify-purge must read THIS list. A verifier with its own hand-typed table list is how a bad purge reported green.",
  "company_id": CO,
  "_live_predicate_law": (
    "A guard that counts rows after a mass void counts VOIDED rows too. Use live_predicate to "
    "count only live rows. live_predicate = null means the table carries NO void flag at all -- "
    "that is measured, not missing. Such a table's liveness is answered by its parent document, "
    "or for a document-correction reversal only by the account netting to zero. A guard MUST say "
    "so out loud rather than defaulting either way."
  ),
  "must_be_zero_after_purge": [
    {
      "table": t,
      "where": CHILD.get(t, "operating_company_id = '%s'" % CO),
      "live_predicate": LIVE.get(t),
    }
    for t in ORDER
  ],
  "must_be_unchanged": KEEP["KEEP"] + KEEP["KEEP_BANKING"],
}, open("scripts/purge/usmca-purge-expected-zero.generated.json", "w"), indent=2)
print("%d deletes, %d kept tables" % (len(ORDER), len(KEEP["KEEP"]) + len(KEEP["KEEP_BANKING"])))
print("SQL written to %s  (outside the repo on purpose)" % _sql_path)
