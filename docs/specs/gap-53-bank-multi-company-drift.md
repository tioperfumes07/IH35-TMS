# GAP-53 — Bank Account Multi-Company Drift Fix

Infrastructure for detecting and correcting `banking.bank_accounts.operating_company_id` mismatches.
Known issue: Wells Fargo 6103/6129/6137 (TRANSP) appearing under TRK shadow rows.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
DEEP-VERIFY 2026-06-26: BUILT on main:
  - scripts/verify-bank-account-company-assignment.mjs
