# Orphan guard owner handoff — 2026-08-15

Authoritative source: `classifyGuards().unaccounted` from `scripts/verify-guard-wired.mjs` on `origin/main` after #7208.

Codex-safe guard enforcement is drained. The remaining 91 files are itemized below so no prose counter can hide or duplicate them. Each owner must enroll exact passing guards through claimed verify-steps, fix any red guard at root cause in its owning lane, and reduce the orphan census in the same PR. Registry work supplies no Built credit.

## CC-1 — money/accounting/banking/factoring/settlements (76)

- `scripts/verify-accounting-existing-query-reverse-drills.mjs`
- `scripts/verify-accounting-required-linkage-honest.mjs`
- `scripts/verify-accounting-reverse-link-list-surfaces.mjs`
- `scripts/verify-accounting-unit-wiring.mjs`
- `scripts/verify-accounting-vendor-bills-expenses.mjs`
- `scripts/verify-accounting-vendor-reverse-link-wired.mjs`
- `scripts/verify-acct-ap-bill-surface-wiring.mjs`
- `scripts/verify-aging-report-reverse-leaves.mjs`
- `scripts/verify-ap-bill-inline-surface-linkage.mjs`
- `scripts/verify-bank-inline-surface-applicability.mjs`
- `scripts/verify-bank-linkage-gl-je-reverse.mjs`
- `scripts/verify-banking-factoring-liability-built.mjs`
- `scripts/verify-banking-matched-bill-drill.mjs`
- `scripts/verify-banking-reverse-link-list-surfaces.mjs`
- `scripts/verify-cash-forecast-profile-reverse.mjs`
- `scripts/verify-coa-asymmetry-account-entitylink.mjs`
- `scripts/verify-driver-finance-reverse-leaves.mjs`
- `scripts/verify-expense-built-tags-strict.mjs`
- `scripts/verify-expense-nonidentity-surfaces-honest.mjs`
- `scripts/verify-expense-p10-navigation-honesty.mjs`
- `scripts/verify-factor-entitylink-drill.mjs`
- `scripts/verify-factoring-customer-invoice-scoped.mjs`
- `scripts/verify-factoring-list-gl-je-built.mjs`
- `scripts/verify-factoring-required-liability-honest.mjs`
- `scripts/verify-factoring-reverse-link-remainder.mjs`
- `scripts/verify-financial-document-reverse-leaves.mjs`
- `scripts/verify-fleet-expense-reverse-leaves.mjs`
- `scripts/verify-fleet-gl-je-required-honest.mjs`
- `scripts/verify-fuel-card-overage-profile-reverse.mjs`
- `scripts/verify-fuel-expense-identity-honesty.mjs`
- `scripts/verify-gl-je-honest-built.mjs`
- `scripts/verify-invoice-inline-surface-applicability.mjs`
- `scripts/verify-liability-built-tags-strict.mjs`
- `scripts/verify-liability-navigation-honesty.mjs`
- `scripts/verify-liability-surfaces-built.mjs`
- `scripts/verify-lists-required-liability-honest.mjs`
- `scripts/verify-lists-required-money-honest.mjs`
- `scripts/verify-load-factoring-invoice-entitylink.mjs`
- `scripts/verify-load-liability-scenario-dispatch-honest.mjs`
- `scripts/verify-maint-bill-factoring-liab-built.mjs`
- `scripts/verify-maintenance-wo-create-bill.mjs`
- `scripts/verify-report-management-ap-aging.mjs`
- `scripts/verify-reports-analytics-gl-je-honest.mjs`
- `scripts/verify-reports-gl-je-final-leaves.mjs`
- `scripts/verify-reports-gl-je-required-honest.mjs`
- `scripts/verify-reverse-link-inline-surface-linkage.mjs`
- `scripts/verify-safety-required-money-honest.mjs`
- `scripts/verify-scenario-ap-insurance-honest.mjs`
- `scripts/verify-settlement-inline-surface-linkage.mjs`
- `scripts/verify-settlements-driver-wiring.mjs`
- `scripts/verify-settlements-gl-ap-honest.mjs`
- `scripts/verify-unit-finance-gl-je-reverse.mjs`
- `scripts/verify-unit-finance-linkage-ap-bill.mjs`
- `scripts/verify-wave-c-ap-bill-fe-all-modules.mjs`
- `scripts/verify-wave-c-bank-cross-module.mjs`
- `scripts/verify-wave-c-gl-je-accounting-core-leaves.mjs`
- `scripts/verify-wave-c-gl-je-accounting-modals.mjs`
- `scripts/verify-wave-c-gl-je-banking-driver-escrow.mjs`
- `scripts/verify-wave-c-gl-je-cashflow-reports.mjs`
- `scripts/verify-wave-c-gl-je-finance-hop.mjs`
- `scripts/verify-wave-c-gl-je-form425c.mjs`
- `scripts/verify-wave-c-gl-je-fuel-expense-mapping.mjs`
- `scripts/verify-wave-c-gl-je-invoices-payments.mjs`
- `scripts/verify-wave-c-gl-je-maintenance-work-orders.mjs`
- `scripts/verify-wave-c-gl-je-parts-purchase-banking-hop.mjs`
- `scripts/verify-wave-c-gl-je-reports.mjs`
- `scripts/verify-wave-c-invoice-bank-batch5.mjs`
- `scripts/verify-wave-c-invoice-bank-columns.mjs`
- `scripts/verify-wave-c-invoice-batch4.mjs`
- `scripts/verify-wave-c-invoice-cross-module.mjs`
- `scripts/verify-wave-c-liability-factoring-leaves.mjs`
- `scripts/verify-wave-c-liability-fe-all-modules.mjs`
- `scripts/verify-wave-c-liability-fleet-insurance.mjs`
- `scripts/verify-wave-c-liability-gl-je-cash-flow.mjs`
- `scripts/verify-wave-c-liability-gl-je-finance-statements.mjs`
- `scripts/verify-wave-c-liability-insurance-legal.mjs`

## Cursor — picker/chrome/surface bar (14)

- `scripts/verify-collapsed-list-filters-apply.mjs`
- `scripts/verify-dispatch-picker-law-queues.mjs`
- `scripts/verify-factoring-qbo-chrome-surfaces.mjs`
- `scripts/verify-fleet-picker-law-edit.mjs`
- `scripts/verify-liability-chrome-honest-2.mjs`
- `scripts/verify-maintenance-picker-law-queues.mjs`
- `scripts/verify-picker-law-built-match-cap.mjs`
- `scripts/verify-picker-law-remainder-batch.mjs`
- `scripts/verify-pm-alert-work-order-picker.mjs`
- `scripts/verify-safety-picker-law-lists.mjs`
- `scripts/verify-secondary-picker-law-batch.mjs`
- `scripts/verify-surface-bar-create-drawer-inventory.mjs`
- `scripts/verify-surface-bar-toolbar-leaf-inventory.mjs`
- `scripts/verify-surface-bar-wizard-inventory.mjs`

## N/A — USMCA sprint QBO-sync exclusion (1)

- `scripts/verify-wave-c-gl-je-system-qbo-recon.mjs`

This final file is not authorization to alter QBO sync or TRANSP behavior. It remains explicitly out of scope under the owner ruling and must not be counted as USMCA Built work.
