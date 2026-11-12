# USMCA EXHAUSTIVE TRANSACTION BATTERY — surface → created → registered → gap

> **GENERATED — do not hand-edit.** Produced by `scripts/gen-usmca-battery-doc.mjs` from
> `scripts/usmca-create-surface-inventory.mjs`, which reads the route files themselves. The list
> therefore cannot drift from what the server actually serves.

**Entity: USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`** (`USMCA Freight Solutions Inc`, operating_carrier, active — verified on the prod branch).

## Scope and counts

| bucket | n | meaning |
|---|---:|---|
| **create** (collection POST) | 370 | `POST /api/v1/mdata/customers` — creates a top-level record |
| **nested create** (child POST) | 291 | `POST /…/loads/:id/stops` — needs its parent to exist first, so it is ordered after it |
| action (NOT a create) | 257 | `/:id/approve`, `/scan` — operates on an existing row |
| infra (NOT a surface) | 73 | auth, webhooks, feature flags, integrations plumbing |
| **TOTAL POST endpoints** | 991 | |
| **create** (collection POST) | 368 | `POST /api/v1/mdata/customers` — creates a top-level record |
| **nested create** (child POST) | 290 | `POST /…/loads/:id/stops` — needs its parent to exist first, so it is ordered after it |
| action (NOT a create) | 255 | `/:id/approve`, `/scan` — operates on an existing row |
| infra (NOT a surface) | 73 | auth, webhooks, feature flags, integrations plumbing |
| **TOTAL POST endpoints** | 986 | |
| UI files with `+ Create`/`+ Book` | 198 | product vocabulary is locked to those two labels, which is what makes the UI side greppable |

Counting the 200 actions as create-surfaces would inflate the denominator and make the coverage
report a lie, so every endpoint lands in exactly one bucket and nothing is silently dropped.

## ⚠ TEST-DATA TAGGING — the requested mechanism does not exist

The directive says to tag every created row `is_test_data=true` / `is_sample`. **Verified against the
prod branch: `is_test_data` exists on exactly THREE objects — `audit.scenario_status`,
`audit.v_scenario_status_current`, `driver_finance.driver_pay_rates` — and `is_sample` does not exist
anywhere.** No transaction table (loads, invoices, bills, work_orders, claims, settlements…) has
either column, so the tag cannot be written as specified without a migration across dozens of tables.

**Substitute, matching existing precedent on prod** (`USMCA-TEST-BILL-05`, `CC3-VOIDTEST-20260807-01`,
`TEST-BILL-0806-A` are all real rows created this way):

1. every row created by this battery carries the marker **`CC2-BATTERY-20260807`** in its
   human-readable identifier (bill_number / load_number / reference / name), and
2. every created row's **UUID is recorded in the manifest below**, so the whole set is isolatable and
   voidable by id, not by guessing at a naming convention.

That satisfies the stated intent — *isolatable and voidable before Monday* — which the literal
column cannot. Flagged rather than silently substituted.

## Dependency order (creation follows this, not the table order)

1. **masters / catalogs** — customer, vendor, account, item, catalog rows
2. **operational** — load → assign USMCA driver + USMCA-leased unit → dispatch → deliver → POD/BOL
3. **money** — invoice/AR, bill/AP, expense, fuel, settlement, advance, deduction, escrow, WO, factoring, claim, fine, bank txn + match, transfer, lease

A missing account is CREATED (additive, entity-scoped, sensible default, `qbo_map` null) rather than
blocking the wire — per the owner's standing instruction.

## Coverage matrix

`created` / `registered` are filled by the battery run. `registered` means the record produced its
expected downstream effect (balanced JE, both-way link) — that is CC-3's verification, handed over
after creation; a GL/posting failure goes to CC-1.

### accounting — 79 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/accounting/1099-corrections` | `apps/backend/src/accounting/p7-wave2.routes.ts` | — | — | — |
| create | `/api/v1/accounting/account-register/inline-save` | `apps/backend/src/accounting/account-register.routes.ts` | — | — | — |
| create | `/api/v1/accounting/account-register/toggle-cleared` | `apps/backend/src/accounting/account-register.routes.ts` | — | — | — |
| create | `/api/v1/accounting/bank-deposits` | `apps/backend/src/accounting/bank-deposits.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/bill-payments/:id/post-gl` | `apps/backend/src/accounting/bill-payment-gl.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/bill-payments/:id/unvoid` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| create | `/api/v1/accounting/bills` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/allocate` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/pay` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/post-gl` | `apps/backend/src/accounting/bill-gl-draft.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/unvoid` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| create | `/api/v1/accounting/bills/draft-je-preview` | `apps/backend/src/accounting/bill-gl-draft.routes.ts` | — | — | — |
| create | `/api/v1/accounting/bills/stamp-trailers-from-loads` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| create | `/api/v1/accounting/bills/stamp-units-from-loads` | `apps/backend/src/accounting/bills.routes.ts` | — | — | — |
| create | `/api/v1/accounting/broker-advances` | `apps/backend/src/accounting/broker-advances.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/broker-advances/:id/disburse-to-driver-bill` | `apps/backend/src/accounting/broker-advances.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/collections/:taskId/contact` | `apps/backend/src/accounting/collections.routes.ts` | — | — | — |
| create | `/api/v1/accounting/company-settlements/open` | `apps/backend/src/accounting/company-settlement-open-close.routes.ts` | — | — | — |
| create | `/api/v1/accounting/credit-memos` | `apps/backend/src/accounting/credit-memos.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/credit-memos/:id/unvoid` | `apps/backend/src/accounting/credit-memos.routes.ts` | — | — | — |
| create | `/api/v1/accounting/escrow/deposit` | `apps/backend/src/accounting/escrow/routes.ts` | — | — | — |
| create | `/api/v1/accounting/escrow/open` | `apps/backend/src/accounting/escrow/routes.ts` | — | — | — |
| create | `/api/v1/accounting/expense-category-map` | `apps/backend/src/accounting/expense-category-map/routes.ts` | — | — | — |
| create | `/api/v1/accounting/expense-families/align-repair` | `apps/backend/src/accounting/owner-data-repair.routes.ts` | — | — | — |
| create | `/api/v1/accounting/expense-load-confirmations/confirm` | `apps/backend/src/accounting/expense-load-confirmation.routes.ts` | — | — | — |
| create | `/api/v1/accounting/expenses/link-loads` | `apps/backend/src/accounting/expenses.routes.ts` | — | — | — |
| create | `/api/v1/accounting/factoring-advances` | `apps/backend/src/accounting/factoring-advances.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/factoring-advances/:id/advance` | `apps/backend/src/accounting/factoring-advances.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/factoring-advances/:id/recourse-return` | `apps/backend/src/accounting/factoring-advances.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/factoring-advances/:id/reserve-held` | `apps/backend/src/accounting/factoring-advances.routes.ts` | — | — | — |
| create | `/api/v1/accounting/fixed-assets/dispose` | `apps/backend/src/accounting/amortization-posting/amortization-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/fixed-assets/register-trk-units` | `apps/backend/src/accounting/fixed-assets.routes.ts` | — | — | — |
| create | `/api/v1/accounting/fixed-assets/register-unit` | `apps/backend/src/accounting/fixed-assets.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/invoice-disputes/:id/fault` | `apps/backend/src/accounting/invoice-disputes.routes.ts` | — | — | — |
| create | `/api/v1/accounting/invoices` | `apps/backend/src/accounting/invoices.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/invoices/:id/disputes` | `apps/backend/src/accounting/invoice-disputes.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/invoices/:id/lines` | `apps/backend/src/accounting/invoice-lines.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/invoices/:id/unvoid` | `apps/backend/src/accounting/invoices.routes.ts` | — | — | — |
| create | `/api/v1/accounting/invoices/from-load` | `apps/backend/src/accounting/invoices.routes.ts` | — | — | — |
| create | `/api/v1/accounting/journal-entries` | `apps/backend/src/accounting/journal-entries.routes.ts` | — | — | — |
| create | `/api/v1/accounting/lease-posting/leases` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/lease-posting/leases/:lease_id/assets` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/lease-posting/leases/:lease_id/schedule` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/lease-posting/operating/end-of-term-sale` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/lease-posting/operating/rental` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/lease-posting/sales-type/commencement` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/lease-posting/sales-type/interest` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/month-close` | `apps/backend/src/accounting/month-close.routes.ts` | — | — | — |
| create | `/api/v1/accounting/month-close-acknowledge` | `apps/backend/src/accounting/month-close.routes.ts` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/clone-as-is-commit` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/finality` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/import-from-fixture` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/import-from-qbo` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts` | — | — | — |
| create | `/api/v1/accounting/payments` | `apps/backend/src/accounting/payments.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/payments/:id/unvoid` | `apps/backend/src/accounting/payments.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/payments/:paymentId/applications` | `apps/backend/src/accounting/payment-applications.routes.ts` | — | — | — |
| create | `/api/v1/accounting/periods` | `apps/backend/src/accounting/p7-wave2.routes.ts` | — | — | — |
| create | `/api/v1/accounting/posting-engine-mvp/remediate-bank-ledger-repoint` | `apps/backend/src/accounting/posting-engine.routes.ts` | — | — | — |
| create | `/api/v1/accounting/prepaid-expenses` | `apps/backend/src/accounting/prepaid-expenses.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/prepaid-expenses/:id/unvoid` | `apps/backend/src/accounting/prepaid-expenses.routes.ts` | — | — | — |
| create | `/api/v1/accounting/pse-mirror/enforce` | `apps/backend/src/accounting/pse-mirror.routes.ts` | — | — | — |
| create | `/api/v1/accounting/pse-mirror/sync-now` | `apps/backend/src/accounting/pse-mirror.routes.ts` | — | — | — |
| nested | `/api/v1/accounting/reclassify/batches/:batchId/undo` | `apps/backend/src/accounting/reclassify/reclassify.routes.ts` | — | — | — |
| create | `/api/v1/accounting/recurring-bill-templates` | `apps/backend/src/accounting/bills/recurring/routes.ts` | — | — | — |
| nested | `/api/v1/accounting/recurring-bill-templates/:uuid/generate-now` | `apps/backend/src/accounting/bills/recurring/routes.ts` | — | — | — |
| create | `/api/v1/accounting/recurring-templates` | `apps/backend/src/accounting/recurring-template-detail.routes.ts` | — | — | — |
| create | `/api/v1/accounting/related-parties/accounts/ensure` | `apps/backend/src/accounting/related-party-loan-posting/routes.ts` | — | — | — |
| create | `/api/v1/accounting/related-party-loans` | `apps/backend/src/accounting/related-party-loan-posting/routes.ts` | — | — | — |
| nested | `/api/v1/accounting/related-party-loans/:id/pair` | `apps/backend/src/accounting/related-party-loan-posting/routes.ts` | — | — | — |
| nested | `/api/v1/accounting/reports/reefer-fuel-credit/lines/:id/gallons` | `apps/backend/src/accounting/reefer-fuel-credit.routes.ts` | — | — | — |
| create | `/api/v1/accounting/reports/reefer-fuel-credit/trailer` | `apps/backend/src/accounting/reefer-fuel-credit.routes.ts` | — | — | — |
| create | `/api/v1/accounting/sales-tax/agencies` | `apps/backend/src/accounting/sales-tax/routes.ts` | — | — | — |
| nested | `/api/v1/accounting/sales-tax/returns/:id/file` | `apps/backend/src/accounting/sales-tax/routes.ts` | — | — | — |
| nested | `/api/v1/accounting/sales-tax/returns/:id/mark-paid` | `apps/backend/src/accounting/sales-tax/routes.ts` | — | — | — |
| create | `/api/v1/accounting/sales-tax/returns/prepare` | `apps/backend/src/accounting/sales-tax/routes.ts` | — | — | — |
| create | `/api/v1/accounting/settlement-posting/bill-payment-post` | `apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/settlement-posting/recover-from-driver` | `apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts` | — | — | — |
| create | `/api/v1/accounting/vendor-credits` | `apps/backend/src/accounting/vendor-credits.routes.ts` | — | — | — |
| create | `/api/v1/accounting/vendors/batch-categorize` | `apps/backend/src/accounting/vendor-category.routes.ts` | — | — | — |

### safety — 68 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/safety/anomaly/evaluate` | `apps/backend/src/safety/anomaly/routes.ts` | — | — | — |
| create | `/api/safety/anomaly/rules` | `apps/backend/src/safety/anomaly/routes.ts` | — | — | — |
| create | `/api/safety/anomaly/seed-defaults` | `apps/backend/src/safety/anomaly/routes.ts` | — | — | — |
| nested | `/api/safety/damage-reports/:uuid/photos` | `apps/backend/src/safety/damage-reports/photo-evidence.routes.ts` | — | — | — |
| create | `/api/safety/drug-alcohol/enrollments` | `apps/backend/src/safety/drug-alcohol/routes.ts` | — | — | — |
| create | `/api/safety/drug-alcohol/enrollments/bulk-active` | `apps/backend/src/safety/drug-alcohol/routes.ts` | — | — | — |
| create | `/api/safety/drug-alcohol/random-pool/draw` | `apps/backend/src/safety/drug-alcohol/routes.ts` | — | — | — |
| create | `/api/safety/drug-alcohol/tests` | `apps/backend/src/safety/drug-alcohol/routes.ts` | — | — | — |
| nested | `/api/safety/drug-alcohol/tests/:uuid/flag-positive` | `apps/backend/src/safety/drug-alcohol/routes.ts` | — | — | — |
| nested | `/api/safety/photo-comparison/:session_uuid/post-trip` | `apps/backend/src/safety/photo-comparison/routes.ts` | — | — | — |
| create | `/api/safety/photo-comparison/evidence` | `apps/backend/src/safety/photo-comparison/routes.ts` | — | — | — |
| create | `/api/safety/photo-comparison/pre-trip` | `apps/backend/src/safety/photo-comparison/routes.ts` | — | — | — |
| nested | `/api/v1/safety/accident-liabilities/:id/decide` | `apps/backend/src/safety/accident-liabilities.routes.ts` | — | — | — |
| create | `/api/v1/safety/accidents` | `apps/backend/src/safety/safety.routes.ts` | — | — | — |
| nested | `/api/v1/safety/accidents/:id/photos` | `apps/backend/src/safety/safety.routes.ts` | — | — | — |
| nested | `/api/v1/safety/accidents/:id/spawn-liability` | `apps/backend/src/safety/safety.routes.ts` | — | — | — |
| nested | `/api/v1/safety/accidents/:id/spawn-wo` | `apps/backend/src/safety/safety.routes.ts` | — | — | — |
| create | `/api/v1/safety/background-checks` | `apps/backend/src/safety/background-checks.routes.ts` | — | — | — |
| create | `/api/v1/safety/company-violations` | `apps/backend/src/safety/company-violations.routes.ts` | — | — | — |
| nested | `/api/v1/safety/company-violations/:id/complete-corrective-action` | `apps/backend/src/safety/company-violations.routes.ts` | — | — | — |
| nested | `/api/v1/safety/company-violations/:id/generate-audit-export` | `apps/backend/src/safety/company-violations.routes.ts` | — | — | — |
| create | `/api/v1/safety/complaints` | `apps/backend/src/routes/safety/complaints.ts` | — | — | — |
| nested | `/api/v1/safety/complaints/:id/chargeback` | `apps/backend/src/routes/safety/complaints.ts` | — | — | — |
| create | `/api/v1/safety/csa-scores/compute` | `apps/backend/src/routes/safety/csa-scores.ts` | — | — | — |
| create | `/api/v1/safety/csa-scores/pull-from-safer` | `apps/backend/src/routes/safety/csa-scores.ts` | — | — | — |
| nested | `/api/v1/safety/dot-inspection-events/:id/follow-up` | `apps/backend/src/safety/dot-inspection-events.routes.ts` | — | — | — |
| create | `/api/v1/safety/dot-inspections` | `apps/backend/src/routes/safety/dot-inspections.ts` | — | — | — |
| nested | `/api/v1/safety/dot-inspections/:id/upload-pdf` | `apps/backend/src/routes/safety/dot-inspections.ts` | — | — | — |
| create | `/api/v1/safety/driver-documents` | `apps/backend/src/safety/driver-documents.routes.ts` | — | — | — |
| create | `/api/v1/safety/driver-qualification/items` | `apps/backend/src/safety/driver-qualification.routes.ts` | — | — | — |
| create | `/api/v1/safety/drug-pool/selections` | `apps/backend/src/safety/drug-pool.routes.ts` | — | — | — |
| create | `/api/v1/safety/drug-program/clearinghouse-queries` | `apps/backend/src/safety/drug-program.routes.ts` | — | — | — |
| create | `/api/v1/safety/drug-program/random-pools` | `apps/backend/src/safety/drug-program.routes.ts` | — | — | — |
| create | `/api/v1/safety/drug-program/tests` | `apps/backend/src/safety/drug-program.routes.ts` | — | — | — |
| create | `/api/v1/safety/dvir` | `apps/backend/src/safety/dvir.routes.ts` | — | — | — |
| create | `/api/v1/safety/events-log` | `apps/backend/src/safety/events/safety-events.routes.ts` | — | — | — |
| create | `/api/v1/safety/fines` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| nested | `/api/v1/safety/fines/:id/clear-missing-liability-link` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| nested | `/api/v1/safety/fines/:id/contest` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| nested | `/api/v1/safety/fines/:id/convert-to-liability` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| nested | `/api/v1/safety/fines/:id/dismiss` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| nested | `/api/v1/safety/fines/:id/link-payment` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| nested | `/api/v1/safety/fines/:id/reduce` | `apps/backend/src/safety/fines.routes.ts` | — | — | — |
| create | `/api/v1/safety/hos-violations` | `apps/backend/src/routes/safety/hos-violations.ts` | — | — | — |
| create | `/api/v1/safety/hos/exceptions` | `apps/backend/src/safety/hos.routes.ts` | — | — | — |
| create | `/api/v1/safety/incidents` | `apps/backend/src/safety/incidents.routes.ts` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/auto-create-claim` | `apps/backend/src/safety/damage-continuity/continuity.routes.ts` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/photos` | `apps/backend/src/safety/incidents.routes.ts` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/start-continuity` | `apps/backend/src/safety/damage-continuity/continuity.routes.ts` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/status` | `apps/backend/src/safety/incidents.routes.ts` | — | — | — |
| create | `/api/v1/safety/incidents/full-report` | `apps/backend/src/safety/incidents/full-report.routes.ts` | — | — | — |
| create | `/api/v1/safety/integrity-alert-rules` | `apps/backend/src/safety/integrity-alerts.routes.ts` | — | — | — |
| create | `/api/v1/safety/integrity-alerts` | `apps/backend/src/safety/integrity-alerts.routes.ts` | — | — | — |
| nested | `/api/v1/safety/integrity-alerts/:id/snooze` | `apps/backend/src/safety/integrity-alerts.routes.ts` | — | — | — |
| create | `/api/v1/safety/integrity-alerts/evaluate` | `apps/backend/src/safety/integrity-alerts.routes.ts` | — | — | — |
| create | `/api/v1/safety/internal-fines` | `apps/backend/src/safety/safety-v5.routes.ts` | — | — | — |
| create | `/api/v1/safety/medical-cards` | `apps/backend/src/safety/medical-cards.routes.ts` | — | — | — |
| create | `/api/v1/safety/onboarding/sessions` | `apps/backend/src/safety/onboarding.routes.ts` | — | — | — |
| nested | `/api/v1/safety/onboarding/sessions/:session_id/admin-override` | `apps/backend/src/safety/onboarding.routes.ts` | — | — | — |
| create | `/api/v1/safety/permits` | `apps/backend/src/safety/permits.routes.ts` | — | — | — |
| create | `/api/v1/safety/rtd/cases` | `apps/backend/src/safety/rtd.routes.ts` | — | — | — |
| nested | `/api/v1/safety/rtd/cases/:id/advance` | `apps/backend/src/safety/rtd.routes.ts` | — | — | — |
| nested | `/api/v1/safety/scheduler/requests/:id/assign-cover` | `apps/backend/src/safety/driver-scheduler.routes.ts` | — | — | — |
| create | `/api/v1/safety/scheduler/temp-assignments` | `apps/backend/src/safety/driver-scheduler.routes.ts` | — | — | — |
| create | `/api/v1/safety/training-programs` | `apps/backend/src/safety/training-programs.routes.ts` | — | — | — |
| create | `/api/v1/safety/training-records` | `apps/backend/src/safety/training-records.routes.ts` | — | — | — |
| create | `/api/v1/safety/v5/complaints` | `apps/backend/src/safety/safety-v5.routes.ts` | — | — | — |
| create | `/api/v1/safety/v5/dot-inspections` | `apps/backend/src/safety/safety-v5.routes.ts` | — | — | — |

### mdata — 56 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/mdata/canonical/:kind/merge-all` | `apps/backend/src/mdata/canonical/canonical-entities.routes.ts` | — | — | — |
| create | `/api/v1/mdata/customers` | `apps/backend/src/mdata/customers.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/customers/:customer_id/lanes` | `apps/backend/src/mdata/customer-lanes.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/customers/:customer_id/quality-events` | `apps/backend/src/mdata/customer-quality-events.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/customers/:id/fmcsa-link` | `apps/backend/src/catalogs/fmcsa.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/customers/:id/verify-fmcsa` | `apps/backend/src/mdata/customers.routes.ts` | — | — | — |
| create | `/api/v1/mdata/driver-tags` | `apps/backend/src/mdata/driver-tags.routes.ts` | — | — | — |
| create | `/api/v1/mdata/driver-teams` | `apps/backend/src/mdata/driver-teams.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/driver-teams/:id/replace-driver` | `apps/backend/src/mdata/driver-teams.routes.ts` | — | — | — |
| create | `/api/v1/mdata/drivers` | `apps/backend/src/mdata/drivers.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:driver_id/safety-events` | `apps/backend/src/mdata/driver-safety-events.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:driver_id/suspend` | `apps/backend/src/mdata/driver-safety-events.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/clear-default-truck` | `apps/backend/src/mdata/driver-default-truck.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/default-truck` | `apps/backend/src/mdata/driver-default-truck.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/disable-phone-login` | `apps/backend/src/mdata/drivers.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/enable-phone-login` | `apps/backend/src/mdata/drivers.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/messages` | `apps/backend/src/mdata/driver-messages.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/photo` | `apps/backend/src/mdata/driver-photos.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/reactivate` | `apps/backend/src/mdata/drivers.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/resend-invite` | `apps/backend/src/mdata/drivers.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/training` | `apps/backend/src/mdata/driver-training.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/w8ben` | `apps/backend/src/mdata/driver-w8ben.routes.ts` | — | — | — |
| create | `/api/v1/mdata/drivers/bulk-invite` | `apps/backend/src/mdata/drivers.routes.ts` | — | — | — |
| create | `/api/v1/mdata/drivers/bulk-tag` | `apps/backend/src/mdata/driver-tags.routes.ts` | — | — | — |
| create | `/api/v1/mdata/drivers/check-returning` | `apps/backend/src/mdata/driver-returning-detection.routes.ts` | — | — | — |
| create | `/api/v1/mdata/equipment` | `apps/backend/src/mdata/equipment.routes.ts` | — | — | — |
| create | `/api/v1/mdata/equipment-log` | `apps/backend/src/mdata/equipment-log.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/equipment/:id/plates` | `apps/backend/src/mdata/equipment-plates.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/equipment/:id/status-change` | `apps/backend/src/mdata/equipment.routes.ts` | — | — | — |
| create | `/api/v1/mdata/loads` | `apps/backend/src/mdata/loads.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/loads/:id/miles-choice` | `apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/loads/:id/remint-driver-bill` | `apps/backend/src/mdata/loads.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/loads/:id/stops` | `apps/backend/src/mdata/loads.routes.ts` | — | — | — |
| create | `/api/v1/mdata/loads/deadhead-fill` | `apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts` | — | — | — |
| create | `/api/v1/mdata/loads/printed-trailer-decide` | `apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts` | — | — | — |
| create | `/api/v1/mdata/loads/remint-driver-bill/apply-all` | `apps/backend/src/mdata/loads.routes.ts` | — | — | — |
| create | `/api/v1/mdata/locations` | `apps/backend/src/mdata/locations.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/locations/:id/contacts` | `apps/backend/src/mdata/locations.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/locations/:id/contacts/:contactId/set-primary` | `apps/backend/src/mdata/locations.routes.ts` | — | — | — |
| create | `/api/v1/mdata/miles-recommendations` | `apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts` | — | — | — |
| create | `/api/v1/mdata/qbo/accounts` | `apps/backend/src/mdata/qbo-master-write.routes.ts` | — | — | — |
| create | `/api/v1/mdata/qbo/customers` | `apps/backend/src/mdata/qbo-master-write.routes.ts` | — | — | — |
| create | `/api/v1/mdata/qbo/items` | `apps/backend/src/mdata/qbo-master-write.routes.ts` | — | — | — |
| create | `/api/v1/mdata/qbo/vendors` | `apps/backend/src/mdata/qbo-master-write.routes.ts` | — | — | — |
| create | `/api/v1/mdata/units` | `apps/backend/src/mdata/units.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/units/:id/drivers/clear-default` | `apps/backend/src/mdata/unit-default-driver.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/units/:id/drivers/default` | `apps/backend/src/mdata/unit-default-driver.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/units/:id/photos` | `apps/backend/src/mdata/unit-photos.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/units/:id/plates` | `apps/backend/src/mdata/unit-plates.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/units/:id/quick-availability` | `apps/backend/src/mdata/units.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/units/:id/trip-cost` | `apps/backend/src/mdata/unit-trip-cost.routes.ts` | — | — | — |
| create | `/api/v1/mdata/vendors` | `apps/backend/src/mdata/vendors.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/vendors/:id/payment-methods` | `apps/backend/src/mdata/vendor-payment-methods.routes.ts` | — | — | — |
| nested | `/api/v1/mdata/vendors/:id/reactivate` | `apps/backend/src/mdata/vendors.routes.ts` | — | — | — |
| create | `/api/v1/mdata/vendors/ensure-drivers` | `apps/backend/src/mdata/vendors.routes.ts` | — | — | — |
| create | `/api/v1/mdata/workflow-requests` | `apps/backend/src/mdata/workflow-routes.ts` | — | — | — |

### banking — 45 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/banking/accounts/:id/hide` | `apps/backend/src/banking/banking.routes.ts` | — | — | — |
| nested | `/api/v1/banking/accounts/:id/unhide` | `apps/backend/src/banking/banking.routes.ts` | — | — | — |
| create | `/api/v1/banking/accounts/faro-reserve` | `apps/backend/src/banking/banking.routes.ts` | — | — | — |
| create | `/api/v1/banking/accounts/petty-cash` | `apps/backend/src/banking/banking.routes.ts` | — | — | — |
| create | `/api/v1/banking/accounts/visibility` | `apps/backend/src/banking/banking.routes.ts` | — | — | — |
| create | `/api/v1/banking/categorization-rules` | `apps/backend/src/banking/categorization-rules.routes.ts` | — | — | — |
| nested | `/api/v1/banking/categorization-rules/:id/apply-historical` | `apps/backend/src/banking/categorization-rules.routes.ts` | — | — | — |
| create | `/api/v1/banking/cc-payments` | `apps/backend/src/banking/transfers.routes.ts` | — | — | — |
| create | `/api/v1/banking/drift-alerts/detect` | `apps/backend/src/banking/drift-alerts.routes.ts` | — | — | — |
| create | `/api/v1/banking/equipment-loans` | `apps/backend/src/data-infra/data-infra.routes.ts` | — | — | — |
| nested | `/api/v1/banking/equipment-loans/:id/attributions` | `apps/backend/src/data-infra/data-infra.routes.ts` | — | — | — |
| nested | `/api/v1/banking/equipment-loans/:id/payments` | `apps/backend/src/data-infra/data-infra.routes.ts` | — | — | — |
| create | `/api/v1/banking/link-suggestions/accept` | `apps/backend/src/banking/link-suggestions-actions.routes.ts` | — | — | — |
| create | `/api/v1/banking/link-suggestions/bulk-accept` | `apps/backend/src/banking/link-suggestions-actions.routes.ts` | — | — | — |
| create | `/api/v1/banking/link-suggestions/exclude` | `apps/backend/src/banking/link-suggestions-actions.routes.ts` | — | — | — |
| create | `/api/v1/banking/link-suggestions/undo` | `apps/backend/src/banking/link-suggestions-actions.routes.ts` | — | — | — |
| create | `/api/v1/banking/manual-je` | `apps/backend/src/banking/manual-je.routes.deprecated.ts` | — | — | — |
| nested | `/api/v1/banking/plaid/accounts/:id/disconnect` | `apps/backend/src/integrations/plaid/link.routes.ts` | — | — | — |
| create | `/api/v1/banking/plaid/create-link-token` | `apps/backend/src/integrations/plaid/link.routes.ts` | — | — | — |
| create | `/api/v1/banking/plaid/create-update-link-token` | `apps/backend/src/integrations/plaid/link.routes.ts` | — | — | — |
| create | `/api/v1/banking/plaid/exchange-public-token` | `apps/backend/src/integrations/plaid/link.routes.ts` | — | — | — |
| nested | `/api/v1/banking/plaid/items/:itemId/disconnect` | `apps/backend/src/banking/plaid-items.routes.ts` | — | — | — |
| create | `/api/v1/banking/plaid/items/disconnect` | `apps/backend/src/integrations/plaid/link.routes.ts` | — | — | — |
| create | `/api/v1/banking/reconciliation-sessions` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| nested | `/api/v1/banking/reconciliation-sessions/:id/finalize` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| nested | `/api/v1/banking/reconciliation/:sessionId/clear` | `apps/backend/src/banking/reconciliation.routes.ts` | — | — | — |
| create | `/api/v1/banking/related-party-pairs/confirm` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| create | `/api/v1/banking/rules` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| create | `/api/v1/banking/rules/bulk-apply` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/investigate` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/refresh-suggestion` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/reject-suggestion` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/skip` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/supersede-plaid-pending` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/transfer` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/undo-categorization` | `apps/backend/src/banking/banking.routes.ts` | — | — | — |
| create | `/api/v1/banking/transactions/bulk-categorize` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| create | `/api/v1/banking/transactions/bulk-post-as-bills` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| create | `/api/v1/banking/transactions/categorize-bulk` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| create | `/api/v1/banking/transactions/post-categorized-backlog` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| create | `/api/v1/banking/transactions/suggest` | `apps/backend/src/banking/p7-wave2.routes.ts` | — | — | — |
| create | `/api/v1/banking/transactions/undo-categorization` | `apps/backend/src/banking/categorization.routes.ts` | — | — | — |
| create | `/api/v1/banking/transfers` | `apps/backend/src/banking/transfers.routes.ts` | — | — | — |
| create | `/api/v1/banking/transfers/intercompany` | `apps/backend/src/banking/transfers.routes.ts` | — | — | — |
| create | `/api/v1/banking/upload-statement` | `apps/backend/src/banking/reconciliation.routes.ts` | — | — | — |

### maintenance — 42 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo` | `apps/backend/src/maintenance/arriving-soon.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/arriving-soon/audit-view` | `apps/backend/src/maintenance/arriving-soon.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/brake-wear/measurements` | `apps/backend/src/integrations/samsara/cap-13-brake-wear/routes.ts` | — | — | — |
| create | `/api/v1/maintenance/drivers` | `apps/backend/src/maintenance/drivers.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/dvir-defects/:id/triage` | `apps/backend/src/maintenance/defects.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/fault-rules` | `apps/backend/src/maintenance/fault-auto-wo/fault-rules.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/idle-events/:id/confirm-manual` | `apps/backend/src/maintenance/kpi.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/inspections` | `apps/backend/src/maintenance/inspections.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/inspections/:id/photos` | `apps/backend/src/maintenance/inspections.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/internal-labor` | `apps/backend/src/maintenance/internal-labor.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/parts` | `apps/backend/src/maintenance/parts.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/parts-inventory/purchases` | `apps/backend/src/maintenance/parts-inventory.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/pm-auto-engine/run-now` | `apps/backend/src/maintenance/pm-auto-engine.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/pm-auto-engine/settings` | `apps/backend/src/maintenance/pm-auto-engine.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/pm-schedule` | `apps/backend/src/maintenance/pm-schedule.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/pm-schedule/:id/generate-wo` | `apps/backend/src/maintenance/pm-schedule.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/pre-flight-dvir/:defectId/route` | `apps/backend/src/maintenance/pre-flight-dvir.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/pre-flight/defects/:id/route` | `apps/backend/src/maintenance/pre-flight/routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/predictive-alerts/:id/create-work-order` | `apps/backend/src/maintenance/predictive-alerts.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/reefer-hours/ingest-samsara` | `apps/backend/src/maintenance/reefer-hours.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/reefer-hours/log` | `apps/backend/src/maintenance/reefer-hours.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/service-history` | `apps/backend/src/maintenance/service-history-backfill.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/severe-repair/export-pdf` | `apps/backend/src/maintenance/severe-repair-estimate.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/tire-tread/measurements` | `apps/backend/src/integrations/samsara/cap-12-tire-tread/routes.ts` | — | — | — |
| create | `/api/v1/maintenance/tires/brands` | `apps/backend/src/maintenance/tires.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/tires/records` | `apps/backend/src/maintenance/tires.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/tires/replace` | `apps/backend/src/maintenance/tires.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/tires/tread-audit` | `apps/backend/src/maintenance/tires.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/triage/:issue_id/convert-to-damage` | `apps/backend/src/maintenance/triage.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/triage/:issue_id/convert-to-wo` | `apps/backend/src/maintenance/triage.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/vehicles` | `apps/backend/src/maintenance/vehicles.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/vendors` | `apps/backend/src/maintenance/vendors.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/warranty/claims` | `apps/backend/src/maintenance/warranty.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/warranty/claims/:id/file` | `apps/backend/src/maintenance/warranty.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/warranty/claims/:id/reimburse` | `apps/backend/src/maintenance/warranty.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/warranty/detect-from-wo` | `apps/backend/src/maintenance/warranty.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/warranty/parts` | `apps/backend/src/maintenance/warranty.routes.ts` | — | — | — |
| create | `/api/v1/maintenance/work-orders` | `apps/backend/src/maintenance/work-orders.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/bay` | `apps/backend/src/maintenance/shop-bays.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/line-items` | `apps/backend/src/maintenance/work-orders.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/parts-invoice-links` | `apps/backend/src/maintenance/parts-invoice-links.routes.ts` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/status` | `apps/backend/src/maintenance/work-orders.routes.ts` | — | — | — |

### dispatch — 39 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival` | `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts` | — | — | — |
| nested | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure` | `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts` | — | — | — |
| nested | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document` | `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/cargo-incidents/:id/file-claim` | `apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/detention-events/:id/post-driver-pay` | `apps/backend/src/driver-finance/detention-pay-posting.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/detention/events/:id/bridge-billing` | `apps/backend/src/dispatch/detention.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/detention/events/:id/notify-customer` | `apps/backend/src/dispatch/detention.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/equipment-transfers/:uuid/confirm-inbound` | `apps/backend/src/dispatch/equipment-transfer/routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/equipment-transfers/:uuid/confirm-outbound` | `apps/backend/src/dispatch/equipment-transfer/routes.ts` | — | — | — |
| create | `/api/v1/dispatch/equipment-transfers/initiate` | `apps/backend/src/dispatch/equipment-transfer/routes.ts` | — | — | — |
| create | `/api/v1/dispatch/intransit-issues` | `apps/backend/src/dispatch/intransit-issues.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/intransit-issues/office` | `apps/backend/src/dispatch/arch-tabs.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/loads` | `apps/backend/src/dispatch/loads.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/complete-quicksave-draft` | `apps/backend/src/dispatch/quicksave.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/distribute-instructions` | `apps/backend/src/dispatch/loads.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/geocode-stops` | `apps/backend/src/dispatch/loads.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/quick-assign` | `apps/backend/src/dispatch/quicksave.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/shuttle-legs` | `apps/backend/src/dispatch/load-shuttle-leg.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:load_id/confirm-predicted-delivery` | `apps/backend/src/dispatch/predicted-delivery.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates` | `apps/backend/src/dispatch/loads/multi-stop/extra-rate.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:loadId/completion-prompts/late-penalty` | `apps/backend/src/dispatch/completion-prompts.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:loadId/completion-prompts/lumper` | `apps/backend/src/dispatch/completion-prompts.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/loads/:loadId/manual-delivery-authorization` | `apps/backend/src/dispatch/manual-delivery-authorization.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/loads/ocr-upload` | `apps/backend/src/dispatch/loads.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/loads/reserve-id` | `apps/backend/src/dispatch/loads.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/loads/trailers-from-expenses` | `apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/loads/trailers-from-gps` | `apps/backend/src/dispatch/mileage/miles-recommendations.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/non-owned-trailers` | `apps/backend/src/dispatch/trailer-interchange.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/ocr-intake/items/:id/convert` | `apps/backend/src/dispatch/ocr-intake.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/ocr-intake/items/:id/finalize` | `apps/backend/src/dispatch/ocr-intake.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/ocr-intake/items/:id/reprocess` | `apps/backend/src/dispatch/ocr-intake.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/ratecon/extract` | `apps/backend/src/dispatch/ratecon-extract.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/trailer-interchanges` | `apps/backend/src/dispatch/trailer-interchange.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/trailer-interchanges/:id/agreement` | `apps/backend/src/dispatch/trailer-interchange.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/trailer-interchanges/:id/receive` | `apps/backend/src/dispatch/trailer-interchange.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/trailer-interchanges/:id/return` | `apps/backend/src/dispatch/trailer-interchange.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/arrive` | `apps/backend/src/dispatch/truck-line/stop-stamp.routes.ts` | — | — | — |
| nested | `/api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/depart` | `apps/backend/src/dispatch/truck-line/stop-stamp.routes.ts` | — | — | — |
| create | `/api/v1/dispatch/validation/pre-dispatch` | `apps/backend/src/dispatch/validation/pre-dispatch.routes.ts` | — | — | — |

### catalogs — 29 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/catalogs/account-role-bindings` | `apps/backend/src/catalogs/account-role-bindings.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/accounts` | `apps/backend/src/catalogs/accounts.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/classes` | `apps/backend/src/catalogs/classes.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/dispatch-flag-colors` | `apps/backend/src/catalogs/dispatch-flag-colors.routes.ts` | — | — | — |
| nested | `/api/v1/catalogs/dispatch-flag-colors/:id/reactivate` | `apps/backend/src/catalogs/dispatch-flag-colors.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/driver-load-statuses` | `apps/backend/src/catalogs/driver-load-statuses.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/driver-termination-reasons` | `apps/backend/src/mdata/driver-safety-events.routes.ts` | — | — | — |
| nested | `/api/v1/catalogs/driver-termination-reasons/:id/reactivate` | `apps/backend/src/mdata/driver-safety-events.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/equipment-types` | `apps/backend/src/catalogs/equipment-types.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/file-categories` | `apps/backend/src/catalogs/file-categories.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/items` | `apps/backend/src/catalogs/items.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/load-cancellation-reasons` | `apps/backend/src/catalogs/load-cancellation-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/load-exception-reasons` | `apps/backend/src/catalogs/load-exception-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/maintenance/parts-master` | `apps/backend/src/catalogs/maintenance/parts.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/maintenance/services-catalog` | `apps/backend/src/catalogs/maintenance/services.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/override-reasons` | `apps/backend/src/catalogs/override-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/payment-methods` | `apps/backend/src/driver-finance/payment-methods-catalog.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/payment-terms` | `apps/backend/src/catalogs/payment-terms.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/posting-templates` | `apps/backend/src/catalogs/posting-templates.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/registry` | `apps/backend/src/catalogs/catalog-registry.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/safety/cargo-claim-reasons` | `apps/backend/src/catalogs/safety/cargo-claim-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/safety/civil-fine-types` | `apps/backend/src/catalogs/safety/civil-fine-types.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/safety/company-violation-types` | `apps/backend/src/catalogs/safety/company-violation-types.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/safety/complaint-types` | `apps/backend/src/catalogs/safety/complaint-types.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/safety/dot-violation-types` | `apps/backend/src/catalogs/safety/dot-violation-types.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/safety/internal-fine-reasons` | `apps/backend/src/catalogs/safety/internal-fine-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/void-cancel-reasons` | `apps/backend/src/catalogs/void-cancel-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/wo-cancellation-reasons` | `apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts` | — | — | — |
| create | `/api/v1/catalogs/workflow-requests` | `apps/backend/src/catalogs/workflow-routes.ts` | — | — | — |

### driver-finance — 28 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/driver-finance/batch-settlements` | `apps/backend/src/driver-finance/batch-settlements.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/cash-advance-requests` | `apps/backend/src/driver-finance/cash-advance-requests.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/cash-advance-requests/:id/deny` | `apps/backend/src/driver-finance/cash-advance-requests.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/driver-bills/:id/reprice-to-settlement-line` | `apps/backend/src/driver-finance/driver-bills.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/driver-bills/:id/void-stray-practical` | `apps/backend/src/driver-finance/driver-bills.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/driver-bills/:id/void-stray-salaried` | `apps/backend/src/driver-finance/driver-bills.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/drivers/:driverId/payment-methods` | `apps/backend/src/driver-finance/driver-payment-methods.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/escrow-separations` | `apps/backend/src/driver-finance/escrow-separation.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/escrow/:driverId/forfeit` | `apps/backend/src/driver-finance/escrow-forfeit.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/pre-settlements/:id/add-load` | `apps/backend/src/driver-finance/pre-settlement.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/pre-settlements/:id/close-tour` | `apps/backend/src/driver-finance/tour-readout.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/pre-settlements/:id/settle` | `apps/backend/src/driver-finance/pre-settlement.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/presettlement-suggestions/:id/confirm` | `apps/backend/src/dispatch/presettlement-link.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlement-creator/:settlementId/retry-after-commit` | `apps/backend/src/driver-finance/settlement-creator.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlement-creator/post-as-signed` | `apps/backend/src/driver-finance/settlement-creator.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlement-creator/source-check` | `apps/backend/src/driver-finance/settlement-creator.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlement-deductions` | `apps/backend/src/driver-finance/deductions.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlement-disputes` | `apps/backend/src/driver-finance/settlement-dispute.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlement-disputes/:id/disburse` | `apps/backend/src/driver-finance/settlement-dispute.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlement-disputes/:id/withdraw` | `apps/backend/src/driver-finance/settlement-dispute.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlement-lines/:id/unvoid` | `apps/backend/src/driver-finance/settlements.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlement-references` | `apps/backend/src/driver-finance/settlements.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlements` | `apps/backend/src/driver-finance/settlements.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/close-trip` | `apps/backend/src/driver-finance/settlement-payrun-close.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/pay-lines` | `apps/backend/src/driver-finance/settlements.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/payrun-close` | `apps/backend/src/driver-finance/settlement-payrun-close.routes.ts` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/unlock` | `apps/backend/src/driver-finance/settlements.routes.ts` | — | — | — |
| create | `/api/v1/driver-finance/settlements/header-boundaries-repair` | `apps/backend/src/accounting/owner-data-repair.routes.ts` | — | — | — |

### legal — 22 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/legal/attorney-review/:token/request-changes` | `apps/backend/src/legal/attorney-review.routes.ts` | — | — | — |
| create | `/api/v1/legal/contracts` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| nested | `/api/v1/legal/contracts/:id/pdf-file` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| create | `/api/v1/legal/contracts/draft-preview` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| create | `/api/v1/legal/contracts/lease-to-own/ensure-template` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| create | `/api/v1/legal/contracts/sync-linkage` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| nested | `/api/v1/legal/contracts/templates/:code/ensure` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| create | `/api/v1/legal/contracts/truck-lease/ensure-template` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| create | `/api/v1/legal/linkage/backfill-from-sources` | `apps/backend/src/legal/contracts.routes.ts` | — | — | — |
| create | `/api/v1/legal/matters` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/matters/:id/deadlines` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/matters/:id/documents` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/matters/:id/events` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/matters/:id/legal-fee` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/matters/:id/recovery` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/matters/:id/reserve` | `apps/backend/src/legal/matters.routes.ts` | — | — | — |
| nested | `/api/v1/legal/sign/:token/verify/confirm` | `apps/backend/src/legal/sign.routes.ts` | — | — | — |
| create | `/api/v1/legal/templates` | `apps/backend/src/legal/templates.routes.ts` | — | — | — |
| nested | `/api/v1/legal/templates/:id/attorney-review-link` | `apps/backend/src/legal/templates.routes.ts` | — | — | — |
| nested | `/api/v1/legal/templates/:id/new-version` | `apps/backend/src/legal/templates.routes.ts` | — | — | — |
| nested | `/api/v1/legal/templates/:id/retire` | `apps/backend/src/legal/templates.routes.ts` | — | — | — |
| create | `/api/v1/legal/templates/library/ensure` | `apps/backend/src/legal/templates.routes.ts` | — | — | — |

### driver — 18 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/driver/arrival-prompts/:id/confirm` | `apps/backend/src/driver/arrival-prompts.routes.ts` | — | — | — |
| nested | `/api/v1/driver/arrival-prompts/:id/dismiss` | `apps/backend/src/driver/arrival-prompts.routes.ts` | — | — | — |
| create | `/api/v1/driver/cash-advance-requests` | `apps/backend/src/driver-finance/cash-advance-requests.routes.ts` | — | — | — |
| nested | `/api/v1/driver/chat/messages/:id/receipt` | `apps/backend/src/chat/chat.routes.ts` | — | — | — |
| nested | `/api/v1/driver/chat/threads/:id/messages` | `apps/backend/src/chat/chat.routes.ts` | — | — | — |
| create | `/api/v1/driver/dvir` | `apps/backend/src/driver/dvir.routes.ts` | — | — | — |
| create | `/api/v1/driver/fuel/upload-receipt` | `apps/backend/src/driver/fuel-receipt.routes.ts` | — | — | — |
| nested | `/api/v1/driver/loads/:id/accept` | `apps/backend/src/driver/loads.routes.ts` | — | — | — |
| nested | `/api/v1/driver/loads/:id/stops/:stopId/arrive` | `apps/backend/src/driver/loads.routes.ts` | — | — | — |
| nested | `/api/v1/driver/loads/:id/stops/:stopId/depart` | `apps/backend/src/driver/loads.routes.ts` | — | — | — |
| nested | `/api/v1/driver/loads/:loadId/stops/:stopId/pod` | `apps/backend/src/dispatch/pod.routes.ts` | — | — | — |
| create | `/api/v1/driver/messages` | `apps/backend/src/drivers/messages.routes.ts` | — | — | — |
| create | `/api/v1/driver/push-subscription` | `apps/backend/src/driver/push-subscriptions.routes.ts` | — | — | — |
| create | `/api/v1/driver/reports` | `apps/backend/src/driver/reports.routes.ts` | — | — | — |
| create | `/api/v1/driver/scheduler/request` | `apps/backend/src/safety/driver-scheduler.routes.ts` | — | — | — |
| nested | `/api/v1/driver/scheduler/request/:id/documentation` | `apps/backend/src/safety/driver-scheduler.routes.ts` | — | — | — |
| nested | `/api/v1/driver/settlements/:settlementId/dispute` | `apps/backend/src/driver/settlement-disputes-p6.routes.ts` | — | — | — |
| nested | `/api/v1/driver/status-suggestions/:id/respond` | `apps/backend/src/driver/status-suggestions.routes.ts` | — | — | — |

### fuel — 17 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/fuel/assignment-questions/:id/answer` | `apps/backend/src/fuel/fuel-assignment-question.routes.ts` | — | — | — |
| create | `/api/v1/fuel/assignment-questions/evaluate` | `apps/backend/src/fuel/fuel-assignment-question.routes.ts` | — | — | — |
| create | `/api/v1/fuel/card-assignments` | `apps/backend/src/fuel/fuel-card-assignments.routes.ts` | — | — | — |
| nested | `/api/v1/fuel/card-assignments/:id/end` | `apps/backend/src/fuel/fuel-card-assignments.routes.ts` | — | — | — |
| nested | `/api/v1/fuel/card-overage-events/:id/exempt` | `apps/backend/src/fuel/fuel-card-overage.routes.ts` | — | — | — |
| create | `/api/v1/fuel/card-overage-events/reprocess` | `apps/backend/src/fuel/fuel-card-overage.routes.ts` | — | — | — |
| nested | `/api/v1/fuel/card-types/:id/issuer` | `apps/backend/src/fuel/fuel-card-assignments.routes.ts` | — | — | — |
| create | `/api/v1/fuel/dreamline/statement-import` | `apps/backend/src/fuel/fuel-transaction-import.routes.ts` | — | — | — |
| create | `/api/v1/fuel/fill-truck-and-load/rerun` | `apps/backend/src/fuel/fuel-transaction-import.routes.ts` | — | — | — |
| create | `/api/v1/fuel/gl/reflush-unposted` | `apps/backend/src/fuel/fuel-gl-reflush.routes.ts` | — | — | — |
| nested | `/api/v1/fuel/planner/recommendations/:id/send-to-driver` | `apps/backend/src/fuel/planner.routes.ts` | — | — | — |
| create | `/api/v1/fuel/receipts/repoint-to-loads` | `apps/backend/src/fuel/fuel-receipt-repoint.routes.ts` | — | — | — |
| create | `/api/v1/fuel/relay-duplicates/void-later` | `apps/backend/src/fuel/fuel-receipt-repoint.routes.ts` | — | — | — |
| create | `/api/v1/fuel/relay-links/undo-cross-rail` | `apps/backend/src/fuel/fuel-receipt-repoint.routes.ts` | — | — | — |
| create | `/api/v1/fuel/statement-discounts/card-credit-repair` | `apps/backend/src/accounting/owner-data-repair.routes.ts` | — | — | — |
| create | `/api/v1/fuel/transactions` | `apps/backend/src/fuel/fuel-transactions.routes.ts` | — | — | — |
| create | `/api/v1/fuel/wex/statement-import` | `apps/backend/src/fuel/fuel-transaction-import.routes.ts` | — | — | — |

### factoring — 16 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/factoring/1090-wire-proposals/dry-run-accept` | `apps/backend/src/factoring/factoring.routes.ts` | — | — | — |
| create | `/api/v1/factoring/batches` | `apps/backend/src/factoring/batch.routes.ts` | — | — | — |
| create | `/api/v1/factoring/cash-reserve-reclass` | `apps/backend/src/factoring/cash-reserve-reclass.routes.ts` | — | — | — |
| create | `/api/v1/factoring/collection-apply` | `apps/backend/src/factoring/collection-apply.routes.ts` | — | — | — |
| create | `/api/v1/factoring/factors` | `apps/backend/src/factoring/factor.routes.ts` | — | — | — |
| nested | `/api/v1/factoring/factors/:id/letter-of-release` | `apps/backend/src/factoring/factor.routes.ts` | — | — | — |
| create | `/api/v1/factoring/faro-imports` | `apps/backend/src/data-infra/data-infra.routes.ts` | — | — | — |
| nested | `/api/v1/factoring/faro-reserve-entries/:id/short-pay-resolution` | `apps/backend/src/factoring/faro-reserve-entries.routes.ts` | — | — | — |
| create | `/api/v1/factoring/import/faro` | `apps/backend/src/factoring/faro-csv-import.routes.ts` | — | — | — |
| create | `/api/v1/factoring/interest-accrual/propose` | `apps/backend/src/factoring/interest-accrual.routes.ts` | — | — | — |
| nested | `/api/v1/factoring/interest-accrual/runs/:id/decide` | `apps/backend/src/factoring/interest-accrual.routes.ts` | — | — | — |
| nested | `/api/v1/factoring/purchase-lines/:id/faro-invoice-number` | `apps/backend/src/factoring/purchase.routes.ts` | — | — | — |
| create | `/api/v1/factoring/purchases` | `apps/backend/src/factoring/purchase.routes.ts` | — | — | — |
| nested | `/api/v1/factoring/purchases/candidates/:invoiceId/${suffix}` | `apps/backend/src/factoring/purchase.routes.ts` | — | — | — |
| nested | `/api/v1/factoring/repurchase-due/:id/decide` | `apps/backend/src/factoring/repurchase-due.routes.ts` | — | — | — |
| create | `/api/v1/factoring/submission-queue/submit-batch` | `apps/backend/src/factoring/submission-queue.routes.ts` | — | — | — |

### compliance — 11 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/compliance/csa/mitigation-actions` | `apps/backend/src/compliance/csa.routes.ts` | — | — | — |
| create | `/api/v1/compliance/csa/pull-now` | `apps/backend/src/compliance/csa.routes.ts` | — | — | — |
| create | `/api/v1/compliance/drug-alcohol/results` | `apps/backend/src/compliance/drug-alcohol.routes.ts` | — | — | — |
| create | `/api/v1/compliance/fmcsa-safer/verify-now` | `apps/backend/src/compliance/fmcsa-safer.routes.ts` | — | — | — |
| nested | `/api/v1/compliance/form-2290/:id/mark-submitted` | `apps/backend/src/compliance/form-2290.routes.ts` | — | — | — |
| create | `/api/v1/compliance/form-2290/generate-draft` | `apps/backend/src/compliance/form-2290.routes.ts` | — | — | — |
| create | `/api/v1/compliance/notification-rules` | `apps/backend/src/compliance/compliance-notification-rules.routes.ts` | — | — | — |
| create | `/api/v1/compliance/property-tax/appraisal-districts` | `apps/backend/src/compliance/property-tax/property-tax.routes.ts` | — | — | — |
| create | `/api/v1/compliance/property-tax/renditions` | `apps/backend/src/compliance/property-tax/property-tax.routes.ts` | — | — | — |
| nested | `/api/v1/compliance/property-tax/renditions/:id/lines` | `apps/backend/src/compliance/property-tax/property-tax.routes.ts` | — | — | — |
| create | `/api/v1/compliance/required-document-types` | `apps/backend/src/compliance/required-documents.routes.ts` | — | — | — |

### insurance — 11 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/insurance/claims` | `apps/backend/src/insurance/claim.routes.ts` | — | — | — |
| create | `/api/v1/insurance/coi-requests` | `apps/backend/src/insurance/coi-request.routes.ts` | — | — | — |
| create | `/api/v1/insurance/lawsuits` | `apps/backend/src/insurance/lawsuit.routes.ts` | — | — | — |
| create | `/api/v1/insurance/payment-schedule` | `apps/backend/src/insurance/payment-schedule.routes.ts` | — | — | — |
| create | `/api/v1/insurance/policies` | `apps/backend/src/insurance/policy.routes.ts` | — | — | — |
| nested | `/api/v1/insurance/policies/:id/generate-bills` | `apps/backend/src/insurance/dispersal.routes.ts` | — | — | — |
| nested | `/api/v1/insurance/policies/:policy_id/renew` | `apps/backend/src/insurance/policy.routes.ts` | — | — | — |
| nested | `/api/v1/insurance/policies/:policy_id/units` | `apps/backend/src/insurance/policy.routes.ts` | — | — | — |
| create | `/api/v1/insurance/policies/with-bills` | `apps/backend/src/insurance/policy-create-atomic.routes.ts` | — | — | — |
| create | `/api/v1/insurance/schedule-confirmations` | `apps/backend/src/insurance/schedule-confirmations.routes.ts` | — | — | — |
| create | `/api/v1/insurance/type-catalog` | `apps/backend/src/insurance/type-catalog.routes.ts` | — | — | — |

### identity — 9 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/identity/applicants/:id/convert-to-driver` | `apps/backend/src/identity/applicants.routes.ts` | — | — | — |
| create | `/api/v1/identity/applicants/ensure-portal` | `apps/backend/src/identity/applicants.routes.ts` | — | — | — |
| create | `/api/v1/identity/me/switch-company` | `apps/backend/src/identity/company-context.routes.ts` | — | — | — |
| create | `/api/v1/identity/password-reset/confirm` | `apps/backend/src/identity/password-reset.routes.ts` | — | — | — |
| create | `/api/v1/identity/password-reset/request` | `apps/backend/src/identity/password-reset.routes.ts` | — | — | — |
| create | `/api/v1/identity/users` | `apps/backend/src/identity/users.routes.ts` | — | — | — |
| nested | `/api/v1/identity/users/:user_id/safety-events` | `apps/backend/src/mdata/dispatcher-safety-events.routes.ts` | — | — | — |
| create | `/api/v1/identity/users/check-returning-dispatcher` | `apps/backend/src/mdata/dispatcher-safety-events.routes.ts` | — | — | — |
| create | `/api/v1/identity/workflow-requests` | `apps/backend/src/identity/workflow-routes.ts` | — | — | — |

### reports — 9 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/reports/custom-definitions` | `apps/backend/src/reports/custom-report-builder.routes.ts` | — | — | — |
| create | `/api/v1/reports/form-425c/exhibits/build` | `apps/backend/src/reports/form-425c/exhibits/routes.ts` | — | — | — |
| nested | `/api/v1/reports/ifta/draft/:uuid/mark-filed` | `apps/backend/src/reports/ifta/routes.ts` | — | — | — |
| nested | `/api/v1/reports/ifta/draft/:uuid/owner-approve` | `apps/backend/src/reports/ifta/routes.ts` | — | — | — |
| create | `/api/v1/reports/ifta/prepare` | `apps/backend/src/reports/ifta/routes.ts` | — | — | — |
| create | `/api/v1/reports/run-log` | `apps/backend/src/reports/library.routes.ts` | — | — | — |
| create | `/api/v1/reports/scheduled` | `apps/backend/src/reports/scheduled-reports.routes.ts` | — | — | — |
| nested | `/api/v1/reports/scheduled/:id/test-send` | `apps/backend/src/reports/scheduled-reports.routes.ts` | — | — | — |
| create | `/api/v1/reports/scheduled/subscriptions` | `apps/backend/src/reports/scheduled/routes.ts` | — | — | — |

### form-425c — 8 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/form-425c` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| nested | `/api/v1/form-425c/:id/amend` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| nested | `/api/v1/form-425c/:id/exhibit-a` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| nested | `/api/v1/form-425c/:id/exhibit-b` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| nested | `/api/v1/form-425c/:id/generate-filing-pdf` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| nested | `/api/v1/form-425c/:id/import-banking` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| nested | `/api/v1/form-425c/:id/mark-filed` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |
| create | `/api/v1/form-425c/profiles` | `apps/backend/src/compliance/form-425c.routes.ts` | — | — | — |

### driver-pay — 7 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/driver-pay/settlements/:id/mark-bounced` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/mark-cleared` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/mark-paid-manually` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/mark-sent` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/queue-payment` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/reopen-manual-paid` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |
| create | `/api/v1/driver-pay/settlements/repair-paid-status` | `apps/backend/src/driver-finance/settlement-payment.routes.ts` | — | — | — |

### settlements — 7 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/settlements` | `apps/backend/src/driver-finance/settlements-mvp.routes.ts` | — | — | — |
| nested | `/api/v1/settlements/:id/disputes` | `apps/backend/src/settlements/disputes/disputes.routes.ts` | — | — | — |
| create | `/api/v1/settlements/approve-line` | `apps/backend/src/settlements/approval.routes.ts` | — | — | — |
| create | `/api/v1/settlements/finalize` | `apps/backend/src/settlements/approval.routes.ts` | — | — | — |
| create | `/api/v1/settlements/generate-pdf` | `apps/backend/src/settlements/approval.routes.ts` | — | — | — |
| create | `/api/v1/settlements/reject-line` | `apps/backend/src/settlements/approval.routes.ts` | — | — | — |
| create | `/api/v1/settlements/weekly-close` | `apps/backend/src/driver-finance/weekly-close.routes.ts` | — | — | — |

### customers — 7 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/customers/:customer_id/contacts` | `apps/backend/src/mdata/customer-detail-alias.routes.ts` | — | — | — |
| nested | `/api/v1/customers/:customer_id/lanes` | `apps/backend/src/mdata/customer-detail-alias.routes.ts` | — | — | — |
| nested | `/api/v1/customers/:customerId/factor` | `apps/backend/src/factoring/factor.routes.ts` | — | — | — |
| nested | `/api/v1/customers/:id/flag-duplicate` | `apps/backend/src/mdata/reclassify.routes.ts` | — | — | — |
| nested | `/api/v1/customers/:id/payments` | `apps/backend/src/accounting/customer-payments.routes.ts` | — | — | — |
| nested | `/api/v1/customers/:id/portal-users` | `apps/backend/src/shipper-portal/portal-users-admin.routes.ts` | — | — | — |
| nested | `/api/v1/customers/:id/reclassify` | `apps/backend/src/mdata/reclassify.routes.ts` | — | — | — |

### checks — 6 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/checks` | `apps/backend/src/accounting/checks/checks.routes.ts` | — | — | — |
| nested | `/api/v1/checks/:id/reissue` | `apps/backend/src/accounting/checks/checks.routes.ts` | — | — | — |
| nested | `/api/v1/checks/:id/unvoid` | `apps/backend/src/accounting/checks/checks.routes.ts` | — | — | — |
| create | `/api/v1/checks/pay-bills` | `apps/backend/src/accounting/checks/checks.routes.ts` | — | — | — |
| create | `/api/v1/checks/print-batch` | `apps/backend/src/accounting/checks/checks.routes.ts` | — | — | — |
| nested | `/api/v1/checks/print-batch/:id/confirm` | `apps/backend/src/accounting/checks/checks.routes.ts` | — | — | — |

### bank-recon — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/bank-recon/accept-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts` | — | — | — |
| create | `/api/v1/bank-recon/accept-multi-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts` | — | — | — |
| create | `/api/v1/bank-recon/close-period` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts` | — | — | — |
| create | `/api/v1/bank-recon/manual-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts` | — | — | — |
| create | `/api/v1/bank-recon/reject-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts` | — | — | — |

### expenses — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/expenses` | `apps/backend/src/accounting/expenses.routes.ts` | — | — | — |
| nested | `/api/v1/expenses/:expenseId/change-payment-source` | `apps/backend/src/accounting/expenses.routes.ts` | — | — | — |
| nested | `/api/v1/expenses/:expenseId/correct` | `apps/backend/src/accounting/expenses.routes.ts` | — | — | — |
| nested | `/api/v1/expenses/:expenseId/reattribute` | `apps/backend/src/accounting/expenses.routes.ts` | — | — | — |
| nested | `/api/v1/expenses/:expenseId/unvoid` | `apps/backend/src/accounting/expenses.routes.ts` | — | — | — |

### ifta — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/ifta/preparations` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/aggregate-gallons` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/aggregate-miles` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/calculate-tax` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/generate-csv` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts` | — | — | — |

### scheduled-reports — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/scheduled-reports` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts` | — | — | — |
| nested | `/api/v1/scheduled-reports/:id/pause` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts` | — | — | — |
| nested | `/api/v1/scheduled-reports/:id/resume` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts` | — | — | — |
| nested | `/api/v1/scheduled-reports/:id/send-now` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts` | — | — | — |
| create | `/api/v1/scheduled-reports/test-send` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts` | — | — | — |

### telematics — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/telematics/geofences` | `apps/backend/src/telematics/geofences.routes.ts` | — | — | — |
| create | `/api/v1/telematics/odometer-readings` | `apps/backend/src/telematics/odometer-manual.routes.ts` | — | — | — |
| create | `/api/v1/telematics/stops/geocode-backfill` | `apps/backend/src/telematics/stops-geocode-backfill.routes.ts` | — | — | — |
| create | `/api/v1/telematics/stops/push-fences` | `apps/backend/src/telematics/stops-geocode-backfill.routes.ts` | — | — | — |
| create | `/api/v1/telematics/stops/zip-center-resolve` | `apps/backend/src/telematics/stops-geocode-backfill.routes.ts` | — | — | — |

### master-data — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/master-data/drivers/:id/link-qbo-vendor` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts` | — | — | — |
| nested | `/api/v1/master-data/trailers/:id/link-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts` | — | — | — |
| nested | `/api/v1/master-data/trailers/:id/unlink-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts` | — | — | — |
| nested | `/api/v1/master-data/units/:id/link-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts` | — | — | — |
| nested | `/api/v1/master-data/units/:id/unlink-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts` | — | — | — |

### chat — 4 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/chat/attachments/presign` | `apps/backend/src/chat/chat.routes.ts` | — | — | — |
| nested | `/api/v1/chat/messages/:id/receipt` | `apps/backend/src/chat/chat.routes.ts` | — | — | — |
| nested | `/api/v1/chat/threads/:id/messages` | `apps/backend/src/chat/chat.routes.ts` | — | — | — |
| create | `/api/v1/chat/threads/for-load` | `apps/backend/src/chat/chat.routes.ts` | — | — | — |

### docs — 4 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/docs/files/:file_id/links` | `apps/backend/src/docs/files.routes.ts` | — | — | — |
| nested | `/api/v1/docs/files/:file_id/upload-complete` | `apps/backend/src/docs/files.routes.ts` | — | — | — |
| nested | `/api/v1/docs/files/:file_id/versions` | `apps/backend/src/docs/files.routes.ts` | — | — | — |
| create | `/api/v1/docs/files/upload-url` | `apps/backend/src/docs/files.routes.ts` | — | — | — |

### cash-flow — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/cash-flow/adjustments` | `apps/backend/src/cash-flow/cash-flow.routes.ts` | — | — | — |
| create | `/api/v1/cash-flow/pull-transactions` | `apps/backend/src/cash-flow/cash-flow.routes.ts` | — | — | — |
| create | `/api/v1/cash-flow/rolling-ledger/adjustments` | `apps/backend/src/cash-flow/cash-flow.routes.ts` | — | — | — |

### finance — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/finance/calculator/compute` | `apps/backend/src/finance/calculator/routes.ts` | — | — | — |
| create | `/api/v1/finance/loans` | `apps/backend/src/finance/amortization/routes.ts` | — | — | — |
| create | `/api/v1/finance/scenarios` | `apps/backend/src/finance/scenarios/routes.ts` | — | — | — |

### leases — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/leases` | `apps/backend/src/leases/lease.routes.ts` | — | — | — |
| nested | `/api/v1/leases/:id/buyout` | `apps/backend/src/leases/lease.routes.ts` | — | — | — |
| nested | `/api/v1/leases/:id/sign` | `apps/backend/src/leases/lease.routes.ts` | — | — | — |

### notifications — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/notifications/:id/dismiss` | `apps/backend/src/notifications/notifications.routes.ts` | — | — | — |
| nested | `/api/v1/notifications/:id/read` | `apps/backend/src/notifications/notifications.routes.ts` | — | — | — |
| create | `/api/v1/notifications/mark-all-read` | `apps/backend/src/notifications/notifications.routes.ts` | — | — | — |

### perfume — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/perfume/lists` | `apps/backend/src/perfume/desk.routes.ts` | — | — | — |
| nested | `/api/v1/perfume/rows/:id/confirm` | `apps/backend/src/perfume/desk.routes.ts` | — | — | — |
| create | `/api/v1/perfume/vendors` | `apps/backend/src/perfume/desk.routes.ts` | — | — | — |

### safety-docs — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/safety-docs` | `apps/backend/src/safetydoc/safetydoc.routes.ts` | — | — | — |
| nested | `/api/v1/safety-docs/assignments/:id/read` | `apps/backend/src/safetydoc/safetydoc.routes.ts` | — | — | — |
| nested | `/api/v1/safety-docs/assignments/:id/sign` | `apps/backend/src/safetydoc/safetydoc.routes.ts` | — | — | — |

### driver-pwa — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/driver-pwa/transfers/:id/ack-dropoff` | `apps/backend/src/mdata/equipment-transfer.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pwa/transfers/:id/ack-pickup` | `apps/backend/src/mdata/equipment-transfer.routes.ts` | — | — | — |
| nested | `/api/v1/driver-pwa/transfers/:id/confirm` | `apps/backend/src/mdata/equipment-transfer.routes.ts` | — | — | — |

### loads — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/loads/:id/team-split` | `apps/backend/src/settlements/team-splits/team-splits.routes.ts` | — | — | — |
| nested | `/api/v1/loads/:loadId/abandonment` | `apps/backend/src/mdata/load-abandonment.routes.ts` | — | — | — |
| nested | `/api/v1/loads/:loadId/stops` | `apps/backend/src/dispatch/dispatch-refinements.routes.ts` | — | — | — |

### vendors — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/vendors/:id/bill-payments` | `apps/backend/src/accounting/vendor-bill-payments.routes.ts` | — | — | — |
| nested | `/api/v1/vendors/:id/flag-duplicate` | `apps/backend/src/mdata/reclassify.routes.ts` | — | — | — |
| nested | `/api/v1/vendors/:id/reclassify` | `apps/backend/src/mdata/reclassify.routes.ts` | — | — | — |

### attachments — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/attachments/:id/finalize` | `apps/backend/src/documents/attachments.routes.ts` | — | — | — |
| create | `/api/v1/attachments/upload-url` | `apps/backend/src/documents/attachments.routes.ts` | — | — | — |

### cash-advances — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/cash-advances` | `apps/backend/src/cash-advances/cash-advances.routes.ts` | — | — | — |
| nested | `/api/v1/cash-advances/hub/requests/:id/deny` | `apps/backend/src/cash-advances/driver-hub-requests.routes.ts` | — | — | — |

### customer-contracts — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/customer-contracts` | `apps/backend/src/customer-contracts/customer-contract.routes.ts` | — | — | — |
| nested | `/api/v1/customer-contracts/:id/supersede` | `apps/backend/src/customer-contracts/customer-contract.routes.ts` | — | — | — |

### daily-tasks — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/daily-tasks` | `apps/backend/src/daily-tasks/daily-tasks.routes.ts` | — | — | — |
| nested | `/api/v1/daily-tasks/:id/accept` | `apps/backend/src/daily-tasks/daily-tasks.routes.ts` | — | — | — |

### driver-alerts — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/driver-alerts` | `apps/backend/src/driveralert/driveralert.routes.ts` | — | — | — |
| nested | `/api/v1/driver-alerts/:id/re-alarm` | `apps/backend/src/driveralert/driveralert.routes.ts` | — | — | — |

### drivers — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/drivers/document-alerts/evaluate` | `apps/backend/src/drivers/document-alerts.routes.ts` | — | — | — |
| create | `/api/v1/drivers/merge-all` | `apps/backend/src/mdata/driver-merge.routes.ts` | — | — | — |

### email — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/email/queue/:id/retry-now` | `apps/backend/src/email/email.routes.ts` | — | — | — |
| create | `/api/v1/email/test` | `apps/backend/src/email/email.routes.ts` | — | — | — |

### geofences — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/geofences/:id/samsara-address-link` | `apps/backend/src/integrations/samsara/geofences/geofence-address-link.routes.ts` | — | — | — |
| create | `/api/v1/geofences/samsara-push` | `apps/backend/src/integrations/samsara/geofences/geofence-address-link.routes.ts` | — | — | — |

### governance — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/governance/void-cancel-requests` | `apps/backend/src/governance/void-cancel-requests.routes.ts` | — | — | — |
| nested | `/api/v1/governance/void-cancel-requests/:id/deny` | `apps/backend/src/governance/void-cancel-requests.routes.ts` | — | — | — |

### maint — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/maint/parts` | `apps/backend/src/maint/parts.routes.ts` | — | — | — |
| create | `/api/v1/maint/pm/schedules` | `apps/backend/src/maint/pm.routes.ts` | — | — | — |

### portal — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/portal/auth/forgot-password` | `apps/backend/src/shipper-portal/portal-auth.routes.ts` | — | — | — |
| create | `/api/v1/portal/auth/reset-password` | `apps/backend/src/shipper-portal/portal-auth.routes.ts` | — | — | — |

### road-service-tickets — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/road-service-tickets` | `apps/backend/src/maintenance/road-service/tickets.routes.ts` | — | — | — |
| nested | `/api/v1/road-service-tickets/:id/create-wo` | `apps/backend/src/maintenance/road-service/tickets.routes.ts` | — | — | — |

### tax-documents — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/tax-documents/1099-nec/:id/render-pdf` | `apps/backend/src/tax-documents/tax-documents.routes.ts` | — | — | — |
| create | `/api/v1/tax-documents/1099-nec/generate-batch` | `apps/backend/src/tax-documents/tax-documents.routes.ts` | — | — | — |

### work-orders — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/work-orders` | `apps/backend/src/work-orders/work-orders.routes.ts` | — | — | — |
| nested | `/api/v1/work-orders/:id/photos` | `apps/backend/src/work-orders/work-orders.routes.ts` | — | — | — |

### units — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/units/:unit_uuid/permits` | `apps/backend/src/master-data/units/permits/routes.ts` | — | — | — |
| nested | `/api/units/:unit_uuid/toll-tags` | `apps/backend/src/master-data/units/toll-tags/routes.ts` | — | — | — |

### disputes — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/disputes/:disputeId/decide` | `apps/backend/src/accounting/disputes.routes.ts` | — | — | — |
| nested | `/api/v1/disputes/:disputeId/start-review` | `apps/backend/src/accounting/disputes.routes.ts` | — | — | — |

### ap — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/ap/bill-payments` | `apps/backend/src/ap/payment-application.routes.ts` | — | — | — |

### assets — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/assets` | `apps/backend/src/assets/assets.routes.ts` | — | — | — |

### assignments — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/assignments/quicksave` | `apps/backend/src/assignments/quicksave.routes.ts` | — | — | — |

### auto-deductions — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/auto-deductions/policies` | `apps/backend/src/settlements/auto-deductions/policy.routes.ts` | — | — | — |

### bill-payments — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/bill-payments/cc` | `apps/backend/src/bill-payments/cc-payment.routes.ts` | — | — | — |

### border-crossing — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/border-crossing/wizard` | `apps/backend/src/border-crossing/border-crossing-wizard.routes.ts` | — | — | — |

### broker-profiles — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/broker-profiles` | `apps/backend/src/brokerupdate/brokerupdate.routes.ts` | — | — | — |

### broker-updates — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/broker-updates` | `apps/backend/src/brokerupdate/brokerupdate.routes.ts` | — | — | — |

### dashcam — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/dashcam/request-clip` | `apps/backend/src/telematics/dashcam-on-demand.routes.ts` | — | — | — |

### driver-teams — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/driver-teams` | `apps/backend/src/mdata/driver-team-split.routes.ts` | — | — | — |

### feed — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/feed/settlement-document/expenses` | `apps/backend/src/feed/seed-settlement-document.routes.ts` | — | — | — |

### forecast — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/forecast/cash-entries` | `apps/backend/src/forecast/cash-forecast-manual.routes.ts` | — | — | — |

### geocoding — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/geocoding/route-reference` | `apps/backend/src/integrations/google/route-reference.routes.ts` | — | — | — |

### lists — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/lists/force-qbo-sync` | `apps/backend/src/lists/lists-hub.routes.ts` | — | — | — |

### load-templates — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/load-templates` | `apps/backend/src/dispatch/dispatch-refinements.routes.ts` | — | — | — |

### mx-permits — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/mx-permits` | `apps/backend/src/mexico-ops/mx-permits.routes.ts` | — | — | — |

### mx-tolls — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/mx-tolls` | `apps/backend/src/mexico-ops/mx-tolls.routes.ts` | — | — | — |

### onboarding — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/onboarding/seed-sample-data` | `apps/backend/src/onboarding/state.routes.ts` | — | — | — |

### org — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/org/user-company-access` | `apps/backend/src/org/companies.routes.ts` | — | — | — |

### payroll — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/payroll/driver-settlements/compute` | `apps/backend/src/payroll/driver-settlement.routes.ts` | — | — | — |

### program — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/program/board/notes` | `apps/backend/src/program/program-board.routes.ts` | — | — | — |

### team-splits — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/team-splits/configs` | `apps/backend/src/settlements/team-splits/team-splits.routes.ts` | — | — | — |

### time-entries — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/time-entries` | `apps/backend/src/maintenance/labor.routes.ts` | — | — | — |

### usmca — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/usmca/activation/transition` | `apps/backend/src/usmca/activation/activation.routes.ts` | — | — | — |

### abandonment-chargebacks — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/abandonment-chargebacks/:id/dispute` | `apps/backend/src/driver-finance/abandonment.routes.ts` | — | — | — |

### equipment-transfers — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/equipment-transfers/:id/confirm` | `apps/backend/src/mdata/equipment-transfer.routes.ts` | — | — | — |

### equipment — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/equipment/:id/initiate-transfer` | `apps/backend/src/mdata/equipment-transfer.routes.ts` | — | — | — |

### integrity — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/integrity/anomalies/:id/dismiss` | `apps/backend/src/integrity/anomaly-status.routes.ts` | — | — | — |

### liabilities — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/liabilities/:id/send-ack-request` | `apps/backend/src/liabilities/liabilities.routes.ts` | — | — | — |

### owner-approval — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/owner-approval/:token/deny` | `apps/backend/src/driver-finance/owner-approval.routes.ts` | — | — | — |

## Known create-surface failures already proven live (2026-08-07)

| surface | live result | lane |
|---|---|---|
| `GET/POST /api/v1/catalogs/maintenance/services` | **404 — route not found** on the deployed API | CC-2 |
| fleet catalog create | **500** — reported as a trailing `--` SQL comment | CC-2 |
| payment-terms creator | **42701 duplicate column** | CC-2 / lists |
| `GET /api/v1/catalogs/fleet/tire-positions` | 200 `{rows:[],total:0}` — reachable, empty | — |
| `GET /api/v1/catalogs/maintenance/parts` | 200 with USMCA rows — reachable and populated | — |

