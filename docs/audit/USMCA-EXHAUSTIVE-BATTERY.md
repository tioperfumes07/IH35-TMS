# USMCA EXHAUSTIVE TRANSACTION BATTERY — surface → created → registered → gap

> **GENERATED — do not hand-edit.** Produced by `scripts/gen-usmca-battery-doc.mjs` from
> `scripts/usmca-create-surface-inventory.mjs`, which reads the route files themselves. The list
> therefore cannot drift from what the server actually serves.

**Entity: USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`** (`USMCA Freight Solutions Inc`, operating_carrier, active — verified on the prod branch).

## Scope and counts

| bucket | n | meaning |
|---|---:|---|
| **create** (collection POST) | 337 | `POST /api/v1/mdata/customers` — creates a top-level record |
| **nested create** (child POST) | 273 | `POST /…/loads/:id/stops` — needs its parent to exist first, so it is ordered after it |
| action (NOT a create) | 250 | `/:id/approve`, `/scan` — operates on an existing row |
| infra (NOT a surface) | 72 | auth, webhooks, feature flags, integrations plumbing |
| **TOTAL POST endpoints** | 932 | |
| UI files with `+ Create`/`+ Book` | 195 | product vocabulary is locked to those two labels, which is what makes the UI side greppable |

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

### accounting — 72 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/accounting/1099-corrections` | `apps/backend/src/accounting/p7-wave2.routes.ts:505` | — | — | — |
| create | `/api/v1/accounting/account-register/inline-save` | `apps/backend/src/accounting/account-register.routes.ts:102` | — | — | — |
| create | `/api/v1/accounting/account-register/toggle-cleared` | `apps/backend/src/accounting/account-register.routes.ts:70` | — | — | — |
| create | `/api/v1/accounting/bank-deposits` | `apps/backend/src/accounting/bank-deposits.routes.ts:94` | — | — | — |
| nested | `/api/v1/accounting/bill-payments/:id/post-gl` | `apps/backend/src/accounting/bill-payment-gl.routes.ts:19` | — | — | — |
| nested | `/api/v1/accounting/bill-payments/:id/unvoid` | `apps/backend/src/accounting/bills.routes.ts:801` | — | — | — |
| create | `/api/v1/accounting/bills` | `apps/backend/src/accounting/bills.routes.ts:518` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/allocate` | `apps/backend/src/accounting/bills.routes.ts:900` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/pay` | `apps/backend/src/accounting/bills.routes.ts:619` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/post-gl` | `apps/backend/src/accounting/bill-gl-draft.routes.ts:102` | — | — | — |
| nested | `/api/v1/accounting/bills/:id/unvoid` | `apps/backend/src/accounting/bills.routes.ts:715` | — | — | — |
| create | `/api/v1/accounting/bills/draft-je-preview` | `apps/backend/src/accounting/bill-gl-draft.routes.ts:45` | — | — | — |
| create | `/api/v1/accounting/broker-advances` | `apps/backend/src/accounting/broker-advances.routes.ts:38` | — | — | — |
| nested | `/api/v1/accounting/broker-advances/:id/disburse-to-driver-bill` | `apps/backend/src/accounting/broker-advances.routes.ts:76` | — | — | — |
| nested | `/api/v1/accounting/collections/:taskId/contact` | `apps/backend/src/accounting/collections.routes.ts:92` | — | — | — |
| create | `/api/v1/accounting/company-settlements/open` | `apps/backend/src/accounting/company-settlement-open-close.routes.ts:40` | — | — | — |
| create | `/api/v1/accounting/credit-memos` | `apps/backend/src/accounting/credit-memos.routes.ts:240` | — | — | — |
| nested | `/api/v1/accounting/credit-memos/:id/unvoid` | `apps/backend/src/accounting/credit-memos.routes.ts:597` | — | — | — |
| create | `/api/v1/accounting/escrow/deposit` | `apps/backend/src/accounting/escrow/routes.ts:119` | — | — | — |
| create | `/api/v1/accounting/escrow/open` | `apps/backend/src/accounting/escrow/routes.ts:42` | — | — | — |
| create | `/api/v1/accounting/expense-category-map` | `apps/backend/src/accounting/expense-category-map/routes.ts:222` | — | — | — |
| create | `/api/v1/accounting/factoring-advances` | `apps/backend/src/accounting/factoring-advances.routes.ts:426` | — | — | — |
| nested | `/api/v1/accounting/factoring-advances/:id/advance` | `apps/backend/src/accounting/factoring-advances.routes.ts:758` | — | — | — |
| nested | `/api/v1/accounting/factoring-advances/:id/recourse-return` | `apps/backend/src/accounting/factoring-advances.routes.ts:1114` | — | — | — |
| nested | `/api/v1/accounting/factoring-advances/:id/reserve-held` | `apps/backend/src/accounting/factoring-advances.routes.ts:870` | — | — | — |
| create | `/api/v1/accounting/fixed-assets/dispose` | `apps/backend/src/accounting/amortization-posting/amortization-posting.routes.ts:104` | — | — | — |
| create | `/api/v1/accounting/fixed-assets/register-trk-units` | `apps/backend/src/accounting/fixed-assets.routes.ts:415` | — | — | — |
| create | `/api/v1/accounting/fixed-assets/register-unit` | `apps/backend/src/accounting/fixed-assets.routes.ts:381` | — | — | — |
| nested | `/api/v1/accounting/invoice-disputes/:id/fault` | `apps/backend/src/accounting/invoice-disputes.routes.ts:186` | — | — | — |
| create | `/api/v1/accounting/invoices` | `apps/backend/src/accounting/invoices.routes.ts:529` | — | — | — |
| nested | `/api/v1/accounting/invoices/:id/disputes` | `apps/backend/src/accounting/invoice-disputes.routes.ts:107` | — | — | — |
| nested | `/api/v1/accounting/invoices/:id/lines` | `apps/backend/src/accounting/invoice-lines.routes.ts:96` | — | — | — |
| nested | `/api/v1/accounting/invoices/:id/unvoid` | `apps/backend/src/accounting/invoices.routes.ts:1316` | — | — | — |
| create | `/api/v1/accounting/invoices/from-load` | `apps/backend/src/accounting/invoices.routes.ts:757` | — | — | — |
| create | `/api/v1/accounting/journal-entries` | `apps/backend/src/accounting/journal-entries.routes.ts:105` | — | — | — |
| create | `/api/v1/accounting/lease-posting/leases` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:99` | — | — | — |
| nested | `/api/v1/accounting/lease-posting/leases/:lease_id/assets` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:140` | — | — | — |
| nested | `/api/v1/accounting/lease-posting/leases/:lease_id/schedule` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:172` | — | — | — |
| create | `/api/v1/accounting/lease-posting/operating/end-of-term-sale` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:306` | — | — | — |
| create | `/api/v1/accounting/lease-posting/operating/rental` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:282` | — | — | — |
| create | `/api/v1/accounting/lease-posting/sales-type/commencement` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:330` | — | — | — |
| create | `/api/v1/accounting/lease-posting/sales-type/interest` | `apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts:354` | — | — | — |
| create | `/api/v1/accounting/month-close` | `apps/backend/src/accounting/month-close.routes.ts:60` | — | — | — |
| create | `/api/v1/accounting/month-close-acknowledge` | `apps/backend/src/accounting/month-close.routes.ts:90` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/clone-as-is-commit` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts:169` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/finality` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts:194` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/import-from-fixture` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts:150` | — | — | — |
| create | `/api/v1/accounting/opening-balance-register/import-from-qbo` | `apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts:132` | — | — | — |
| create | `/api/v1/accounting/payments` | `apps/backend/src/accounting/payments.routes.ts:405` | — | — | — |
| nested | `/api/v1/accounting/payments/:id/unvoid` | `apps/backend/src/accounting/payments.routes.ts:831` | — | — | — |
| nested | `/api/v1/accounting/payments/:paymentId/applications` | `apps/backend/src/accounting/payment-applications.routes.ts:42` | — | — | — |
| create | `/api/v1/accounting/periods` | `apps/backend/src/accounting/p7-wave2.routes.ts:182` | — | — | — |
| create | `/api/v1/accounting/posting-engine-mvp/remediate-bank-ledger-repoint` | `apps/backend/src/accounting/posting-engine.routes.ts:218` | — | — | — |
| create | `/api/v1/accounting/prepaid-expenses` | `apps/backend/src/accounting/prepaid-expenses.routes.ts:392` | — | — | — |
| nested | `/api/v1/accounting/prepaid-expenses/:id/unvoid` | `apps/backend/src/accounting/prepaid-expenses.routes.ts:707` | — | — | — |
| create | `/api/v1/accounting/pse-mirror/enforce` | `apps/backend/src/accounting/pse-mirror.routes.ts:44` | — | — | — |
| create | `/api/v1/accounting/pse-mirror/sync-now` | `apps/backend/src/accounting/pse-mirror.routes.ts:33` | — | — | — |
| nested | `/api/v1/accounting/reclassify/batches/:batchId/undo` | `apps/backend/src/accounting/reclassify/reclassify.routes.ts:125` | — | — | — |
| create | `/api/v1/accounting/recurring-bill-templates` | `apps/backend/src/accounting/bills/recurring/routes.ts:73` | — | — | — |
| nested | `/api/v1/accounting/recurring-bill-templates/:uuid/generate-now` | `apps/backend/src/accounting/bills/recurring/routes.ts:217` | — | — | — |
| create | `/api/v1/accounting/recurring-templates` | `apps/backend/src/accounting/recurring-template-detail.routes.ts:150` | — | — | — |
| create | `/api/v1/accounting/related-party-loans` | `apps/backend/src/accounting/related-party-loan-posting/routes.ts:339` | — | — | — |
| nested | `/api/v1/accounting/reports/reefer-fuel-credit/lines/:id/gallons` | `apps/backend/src/accounting/reefer-fuel-credit.routes.ts:57` | — | — | — |
| create | `/api/v1/accounting/reports/reefer-fuel-credit/trailer` | `apps/backend/src/accounting/reefer-fuel-credit.routes.ts:88` | — | — | — |
| create | `/api/v1/accounting/sales-tax/agencies` | `apps/backend/src/accounting/sales-tax/routes.ts:79` | — | — | — |
| nested | `/api/v1/accounting/sales-tax/returns/:id/file` | `apps/backend/src/accounting/sales-tax/routes.ts:292` | — | — | — |
| nested | `/api/v1/accounting/sales-tax/returns/:id/mark-paid` | `apps/backend/src/accounting/sales-tax/routes.ts:332` | — | — | — |
| create | `/api/v1/accounting/sales-tax/returns/prepare` | `apps/backend/src/accounting/sales-tax/routes.ts:179` | — | — | — |
| create | `/api/v1/accounting/settlement-posting/bill-payment-post` | `apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts:141` | — | — | — |
| create | `/api/v1/accounting/settlement-posting/recover-from-driver` | `apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts:158` | — | — | — |
| create | `/api/v1/accounting/vendor-credits` | `apps/backend/src/accounting/vendor-credits.routes.ts:232` | — | — | — |
| create | `/api/v1/accounting/vendors/batch-categorize` | `apps/backend/src/accounting/vendor-category.routes.ts:45` | — | — | — |

### safety — 67 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/safety/anomaly/evaluate` | `apps/backend/src/safety/anomaly/routes.ts:218` | — | — | — |
| create | `/api/safety/anomaly/rules` | `apps/backend/src/safety/anomaly/routes.ts:31` | — | — | — |
| create | `/api/safety/anomaly/seed-defaults` | `apps/backend/src/safety/anomaly/routes.ts:205` | — | — | — |
| nested | `/api/safety/damage-reports/:uuid/photos` | `apps/backend/src/safety/damage-reports/photo-evidence.routes.ts:42` | — | — | — |
| create | `/api/safety/drug-alcohol/enrollments` | `apps/backend/src/safety/drug-alcohol/routes.ts:102` | — | — | — |
| create | `/api/safety/drug-alcohol/enrollments/bulk-active` | `apps/backend/src/safety/drug-alcohol/routes.ts:143` | — | — | — |
| create | `/api/safety/drug-alcohol/random-pool/draw` | `apps/backend/src/safety/drug-alcohol/routes.ts:319` | — | — | — |
| create | `/api/safety/drug-alcohol/tests` | `apps/backend/src/safety/drug-alcohol/routes.ts:211` | — | — | — |
| nested | `/api/safety/drug-alcohol/tests/:uuid/flag-positive` | `apps/backend/src/safety/drug-alcohol/routes.ts:277` | — | — | — |
| nested | `/api/safety/photo-comparison/:session_uuid/post-trip` | `apps/backend/src/safety/photo-comparison/routes.ts:199` | — | — | — |
| create | `/api/safety/photo-comparison/evidence` | `apps/backend/src/safety/photo-comparison/routes.ts:112` | — | — | — |
| create | `/api/safety/photo-comparison/pre-trip` | `apps/backend/src/safety/photo-comparison/routes.ts:167` | — | — | — |
| nested | `/api/v1/safety/accident-liabilities/:id/decide` | `apps/backend/src/safety/accident-liabilities.routes.ts:113` | — | — | — |
| create | `/api/v1/safety/accidents` | `apps/backend/src/safety/safety.routes.ts:725` | — | — | — |
| nested | `/api/v1/safety/accidents/:id/photos` | `apps/backend/src/safety/safety.routes.ts:1055` | — | — | — |
| nested | `/api/v1/safety/accidents/:id/spawn-liability` | `apps/backend/src/safety/safety.routes.ts:1116` | — | — | — |
| nested | `/api/v1/safety/accidents/:id/spawn-wo` | `apps/backend/src/safety/safety.routes.ts:1314` | — | — | — |
| create | `/api/v1/safety/background-checks` | `apps/backend/src/safety/background-checks.routes.ts:122` | — | — | — |
| create | `/api/v1/safety/company-violations` | `apps/backend/src/safety/company-violations.routes.ts:334` | — | — | — |
| nested | `/api/v1/safety/company-violations/:id/complete-corrective-action` | `apps/backend/src/safety/company-violations.routes.ts:655` | — | — | — |
| nested | `/api/v1/safety/company-violations/:id/generate-audit-export` | `apps/backend/src/safety/company-violations.routes.ts:607` | — | — | — |
| create | `/api/v1/safety/complaints` | `apps/backend/src/routes/safety/complaints.ts:257` | — | — | — |
| nested | `/api/v1/safety/complaints/:id/chargeback` | `apps/backend/src/routes/safety/complaints.ts:503` | — | — | — |
| create | `/api/v1/safety/csa-scores/compute` | `apps/backend/src/routes/safety/csa-scores.ts:194` | — | — | — |
| create | `/api/v1/safety/csa-scores/pull-from-safer` | `apps/backend/src/routes/safety/csa-scores.ts:206` | — | — | — |
| nested | `/api/v1/safety/dot-inspection-events/:id/follow-up` | `apps/backend/src/safety/dot-inspection-events.routes.ts:111` | — | — | — |
| create | `/api/v1/safety/dot-inspections` | `apps/backend/src/routes/safety/dot-inspections.ts:238` | — | — | — |
| nested | `/api/v1/safety/dot-inspections/:id/upload-pdf` | `apps/backend/src/routes/safety/dot-inspections.ts:423` | — | — | — |
| create | `/api/v1/safety/driver-documents` | `apps/backend/src/safety/driver-documents.routes.ts:52` | — | — | — |
| create | `/api/v1/safety/driver-qualification/items` | `apps/backend/src/safety/driver-qualification.routes.ts:370` | — | — | — |
| create | `/api/v1/safety/drug-pool/selections` | `apps/backend/src/safety/drug-pool.routes.ts:52` | — | — | — |
| create | `/api/v1/safety/drug-program/clearinghouse-queries` | `apps/backend/src/safety/drug-program.routes.ts:524` | — | — | — |
| create | `/api/v1/safety/drug-program/random-pools` | `apps/backend/src/safety/drug-program.routes.ts:425` | — | — | — |
| create | `/api/v1/safety/drug-program/tests` | `apps/backend/src/safety/drug-program.routes.ts:211` | — | — | — |
| create | `/api/v1/safety/dvir` | `apps/backend/src/safety/dvir.routes.ts:260` | — | — | — |
| create | `/api/v1/safety/events-log` | `apps/backend/src/safety/events/safety-events.routes.ts:312` | — | — | — |
| create | `/api/v1/safety/fines` | `apps/backend/src/safety/fines.routes.ts:282` | — | — | — |
| nested | `/api/v1/safety/fines/:id/contest` | `apps/backend/src/safety/fines.routes.ts:618` | — | — | — |
| nested | `/api/v1/safety/fines/:id/convert-to-liability` | `apps/backend/src/safety/fines.routes.ts:447` | — | — | — |
| nested | `/api/v1/safety/fines/:id/dismiss` | `apps/backend/src/safety/fines.routes.ts:649` | — | — | — |
| nested | `/api/v1/safety/fines/:id/link-payment` | `apps/backend/src/safety/fines.routes.ts:771` | — | — | — |
| nested | `/api/v1/safety/fines/:id/reduce` | `apps/backend/src/safety/fines.routes.ts:680` | — | — | — |
| create | `/api/v1/safety/hos-violations` | `apps/backend/src/routes/safety/hos-violations.ts:167` | — | — | — |
| create | `/api/v1/safety/hos/exceptions` | `apps/backend/src/safety/hos.routes.ts:34` | — | — | — |
| create | `/api/v1/safety/incidents` | `apps/backend/src/safety/incidents.routes.ts:345` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/auto-create-claim` | `apps/backend/src/safety/damage-continuity/continuity.routes.ts:171` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/photos` | `apps/backend/src/safety/incidents.routes.ts:506` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/start-continuity` | `apps/backend/src/safety/damage-continuity/continuity.routes.ts:57` | — | — | — |
| nested | `/api/v1/safety/incidents/:id/status` | `apps/backend/src/safety/incidents.routes.ts:663` | — | — | — |
| create | `/api/v1/safety/incidents/full-report` | `apps/backend/src/safety/incidents/full-report.routes.ts:51` | — | — | — |
| create | `/api/v1/safety/integrity-alert-rules` | `apps/backend/src/safety/integrity-alerts.routes.ts:201` | — | — | — |
| create | `/api/v1/safety/integrity-alerts` | `apps/backend/src/safety/integrity-alerts.routes.ts:483` | — | — | — |
| nested | `/api/v1/safety/integrity-alerts/:id/snooze` | `apps/backend/src/safety/integrity-alerts.routes.ts:427` | — | — | — |
| create | `/api/v1/safety/integrity-alerts/evaluate` | `apps/backend/src/safety/integrity-alerts.routes.ts:284` | — | — | — |
| create | `/api/v1/safety/internal-fines` | `apps/backend/src/safety/safety-v5.routes.ts:260` | — | — | — |
| create | `/api/v1/safety/medical-cards` | `apps/backend/src/safety/medical-cards.routes.ts:225` | — | — | — |
| create | `/api/v1/safety/onboarding/sessions` | `apps/backend/src/safety/onboarding.routes.ts:106` | — | — | — |
| nested | `/api/v1/safety/onboarding/sessions/:session_id/admin-override` | `apps/backend/src/safety/onboarding.routes.ts:328` | — | — | — |
| create | `/api/v1/safety/permits` | `apps/backend/src/safety/permits.routes.ts:259` | — | — | — |
| create | `/api/v1/safety/rtd/cases` | `apps/backend/src/safety/rtd.routes.ts:286` | — | — | — |
| nested | `/api/v1/safety/rtd/cases/:id/advance` | `apps/backend/src/safety/rtd.routes.ts:380` | — | — | — |
| nested | `/api/v1/safety/scheduler/requests/:id/assign-cover` | `apps/backend/src/safety/driver-scheduler.routes.ts:345` | — | — | — |
| create | `/api/v1/safety/scheduler/temp-assignments` | `apps/backend/src/safety/driver-scheduler.routes.ts:499` | — | — | — |
| create | `/api/v1/safety/training-programs` | `apps/backend/src/safety/training-programs.routes.ts:75` | — | — | — |
| create | `/api/v1/safety/training-records` | `apps/backend/src/safety/training-records.routes.ts:48` | — | — | — |
| create | `/api/v1/safety/v5/complaints` | `apps/backend/src/safety/safety-v5.routes.ts:684` | — | — | — |
| create | `/api/v1/safety/v5/dot-inspections` | `apps/backend/src/safety/safety-v5.routes.ts:129` | — | — | — |

### mdata — 50 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/mdata/customers` | `apps/backend/src/mdata/customers.routes.ts:753` | — | — | — |
| nested | `/api/v1/mdata/customers/:customer_id/lanes` | `apps/backend/src/mdata/customer-lanes.routes.ts:98` | — | — | — |
| nested | `/api/v1/mdata/customers/:customer_id/quality-events` | `apps/backend/src/mdata/customer-quality-events.routes.ts:238` | — | — | — |
| nested | `/api/v1/mdata/customers/:id/fmcsa-link` | `apps/backend/src/catalogs/fmcsa.routes.ts:225` | — | — | — |
| nested | `/api/v1/mdata/customers/:id/verify-fmcsa` | `apps/backend/src/mdata/customers.routes.ts:1452` | — | — | — |
| create | `/api/v1/mdata/driver-tags` | `apps/backend/src/mdata/driver-tags.routes.ts:107` | — | — | — |
| create | `/api/v1/mdata/driver-teams` | `apps/backend/src/mdata/driver-teams.routes.ts:260` | — | — | — |
| nested | `/api/v1/mdata/driver-teams/:id/replace-driver` | `apps/backend/src/mdata/driver-teams.routes.ts:461` | — | — | — |
| create | `/api/v1/mdata/drivers` | `apps/backend/src/mdata/drivers.routes.ts:1530` | — | — | — |
| nested | `/api/v1/mdata/drivers/:driver_id/safety-events` | `apps/backend/src/mdata/driver-safety-events.routes.ts:578` | — | — | — |
| nested | `/api/v1/mdata/drivers/:driver_id/suspend` | `apps/backend/src/mdata/driver-safety-events.routes.ts:363` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/clear-default-truck` | `apps/backend/src/mdata/driver-default-truck.routes.ts:213` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/default-truck` | `apps/backend/src/mdata/driver-default-truck.routes.ts:157` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/disable-phone-login` | `apps/backend/src/mdata/drivers.routes.ts:2839` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/enable-phone-login` | `apps/backend/src/mdata/drivers.routes.ts:2708` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/messages` | `apps/backend/src/mdata/driver-messages.routes.ts:28` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/reactivate` | `apps/backend/src/mdata/drivers.routes.ts:2629` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/resend-invite` | `apps/backend/src/mdata/drivers.routes.ts:2009` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/training` | `apps/backend/src/mdata/driver-training.routes.ts:79` | — | — | — |
| nested | `/api/v1/mdata/drivers/:id/w8ben` | `apps/backend/src/mdata/driver-w8ben.routes.ts:215` | — | — | — |
| create | `/api/v1/mdata/drivers/bulk-invite` | `apps/backend/src/mdata/drivers.routes.ts:1802` | — | — | — |
| create | `/api/v1/mdata/drivers/bulk-tag` | `apps/backend/src/mdata/driver-tags.routes.ts:179` | — | — | — |
| create | `/api/v1/mdata/drivers/check-returning` | `apps/backend/src/mdata/driver-returning-detection.routes.ts:155` | — | — | — |
| create | `/api/v1/mdata/equipment` | `apps/backend/src/mdata/equipment.routes.ts:252` | — | — | — |
| create | `/api/v1/mdata/equipment-log` | `apps/backend/src/mdata/equipment-log.routes.ts:146` | — | — | — |
| nested | `/api/v1/mdata/equipment/:id/plates` | `apps/backend/src/mdata/equipment-plates.routes.ts:83` | — | — | — |
| nested | `/api/v1/mdata/equipment/:id/status-change` | `apps/backend/src/mdata/equipment.routes.ts:417` | — | — | — |
| create | `/api/v1/mdata/loads` | `apps/backend/src/mdata/loads.routes.ts:396` | — | — | — |
| nested | `/api/v1/mdata/loads/:id/remint-driver-bill` | `apps/backend/src/mdata/loads.routes.ts:1421` | — | — | — |
| nested | `/api/v1/mdata/loads/:id/stops` | `apps/backend/src/mdata/loads.routes.ts:1984` | — | — | — |
| create | `/api/v1/mdata/loads/remint-driver-bill/apply-all` | `apps/backend/src/mdata/loads.routes.ts:1570` | — | — | — |
| create | `/api/v1/mdata/locations` | `apps/backend/src/mdata/locations.routes.ts:282` | — | — | — |
| nested | `/api/v1/mdata/locations/:id/contacts` | `apps/backend/src/mdata/locations.routes.ts:686` | — | — | — |
| nested | `/api/v1/mdata/locations/:id/contacts/:contactId/set-primary` | `apps/backend/src/mdata/locations.routes.ts:879` | — | — | — |
| create | `/api/v1/mdata/qbo/accounts` | `apps/backend/src/mdata/qbo-master-write.routes.ts:487` | — | — | — |
| create | `/api/v1/mdata/qbo/customers` | `apps/backend/src/mdata/qbo-master-write.routes.ts:254` | — | — | — |
| create | `/api/v1/mdata/qbo/items` | `apps/backend/src/mdata/qbo-master-write.routes.ts:369` | — | — | — |
| create | `/api/v1/mdata/qbo/vendors` | `apps/backend/src/mdata/qbo-master-write.routes.ts:109` | — | — | — |
| create | `/api/v1/mdata/units` | `apps/backend/src/mdata/units.routes.ts:459` | — | — | — |
| nested | `/api/v1/mdata/units/:id/drivers/clear-default` | `apps/backend/src/mdata/unit-default-driver.routes.ts:229` | — | — | — |
| nested | `/api/v1/mdata/units/:id/drivers/default` | `apps/backend/src/mdata/unit-default-driver.routes.ts:182` | — | — | — |
| nested | `/api/v1/mdata/units/:id/photos` | `apps/backend/src/mdata/unit-photos.routes.ts:60` | — | — | — |
| nested | `/api/v1/mdata/units/:id/plates` | `apps/backend/src/mdata/unit-plates.routes.ts:137` | — | — | — |
| nested | `/api/v1/mdata/units/:id/quick-availability` | `apps/backend/src/mdata/units.routes.ts:1000` | — | — | — |
| nested | `/api/v1/mdata/units/:id/trip-cost` | `apps/backend/src/mdata/unit-trip-cost.routes.ts:43` | — | — | — |
| create | `/api/v1/mdata/vendors` | `apps/backend/src/mdata/vendors.routes.ts:590` | — | — | — |
| nested | `/api/v1/mdata/vendors/:id/payment-methods` | `apps/backend/src/mdata/vendor-payment-methods.routes.ts:147` | — | — | — |
| nested | `/api/v1/mdata/vendors/:id/reactivate` | `apps/backend/src/mdata/vendors.routes.ts:1061` | — | — | — |
| create | `/api/v1/mdata/vendors/ensure-drivers` | `apps/backend/src/mdata/vendors.routes.ts:518` | — | — | — |
| create | `/api/v1/mdata/workflow-requests` | `apps/backend/src/mdata/workflow-routes.ts:212` | — | — | — |

### banking — 43 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/banking/accounts/:id/hide` | `apps/backend/src/banking/banking.routes.ts:880` | — | — | — |
| nested | `/api/v1/banking/accounts/:id/unhide` | `apps/backend/src/banking/banking.routes.ts:905` | — | — | — |
| create | `/api/v1/banking/accounts/faro-reserve` | `apps/backend/src/banking/banking.routes.ts:367` | — | — | — |
| create | `/api/v1/banking/accounts/petty-cash` | `apps/backend/src/banking/banking.routes.ts:314` | — | — | — |
| create | `/api/v1/banking/accounts/visibility` | `apps/backend/src/banking/banking.routes.ts:394` | — | — | — |
| create | `/api/v1/banking/categorization-rules` | `apps/backend/src/banking/categorization-rules.routes.ts:189` | — | — | — |
| nested | `/api/v1/banking/categorization-rules/:id/apply-historical` | `apps/backend/src/banking/categorization-rules.routes.ts:343` | — | — | — |
| create | `/api/v1/banking/cc-payments` | `apps/backend/src/banking/transfers.routes.ts:161` | — | — | — |
| create | `/api/v1/banking/drift-alerts/detect` | `apps/backend/src/banking/drift-alerts.routes.ts:125` | — | — | — |
| create | `/api/v1/banking/equipment-loans` | `apps/backend/src/data-infra/data-infra.routes.ts:205` | — | — | — |
| nested | `/api/v1/banking/equipment-loans/:id/attributions` | `apps/backend/src/data-infra/data-infra.routes.ts:240` | — | — | — |
| nested | `/api/v1/banking/equipment-loans/:id/payments` | `apps/backend/src/data-infra/data-infra.routes.ts:259` | — | — | — |
| create | `/api/v1/banking/link-suggestions/accept` | `apps/backend/src/banking/link-suggestions-actions.routes.ts:167` | — | — | — |
| create | `/api/v1/banking/link-suggestions/bulk-accept` | `apps/backend/src/banking/link-suggestions-actions.routes.ts:191` | — | — | — |
| create | `/api/v1/banking/link-suggestions/exclude` | `apps/backend/src/banking/link-suggestions-actions.routes.ts:280` | — | — | — |
| create | `/api/v1/banking/link-suggestions/undo` | `apps/backend/src/banking/link-suggestions-actions.routes.ts:326` | — | — | — |
| create | `/api/v1/banking/manual-je` | `apps/backend/src/banking/manual-je.routes.deprecated.ts:56` | — | — | — |
| nested | `/api/v1/banking/plaid/accounts/:id/disconnect` | `apps/backend/src/integrations/plaid/link.routes.ts:444` | — | — | — |
| create | `/api/v1/banking/plaid/create-link-token` | `apps/backend/src/integrations/plaid/link.routes.ts:185` | — | — | — |
| create | `/api/v1/banking/plaid/create-update-link-token` | `apps/backend/src/integrations/plaid/link.routes.ts:535` | — | — | — |
| create | `/api/v1/banking/plaid/exchange-public-token` | `apps/backend/src/integrations/plaid/link.routes.ts:207` | — | — | — |
| nested | `/api/v1/banking/plaid/items/:itemId/disconnect` | `apps/backend/src/banking/plaid-items.routes.ts:116` | — | — | — |
| create | `/api/v1/banking/plaid/items/disconnect` | `apps/backend/src/integrations/plaid/link.routes.ts:551` | — | — | — |
| create | `/api/v1/banking/reconciliation-sessions` | `apps/backend/src/banking/p7-wave2.routes.ts:565` | — | — | — |
| nested | `/api/v1/banking/reconciliation-sessions/:id/finalize` | `apps/backend/src/banking/p7-wave2.routes.ts:659` | — | — | — |
| nested | `/api/v1/banking/reconciliation/:sessionId/clear` | `apps/backend/src/banking/reconciliation.routes.ts:1000` | — | — | — |
| create | `/api/v1/banking/rules` | `apps/backend/src/banking/p7-wave2.routes.ts:352` | — | — | — |
| create | `/api/v1/banking/rules/bulk-apply` | `apps/backend/src/banking/p7-wave2.routes.ts:543` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/investigate` | `apps/backend/src/banking/categorization.routes.ts:1097` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/refresh-suggestion` | `apps/backend/src/banking/p7-wave2.routes.ts:474` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/skip` | `apps/backend/src/banking/categorization.routes.ts:1028` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/supersede-plaid-pending` | `apps/backend/src/banking/p7-wave2.routes.ts:36` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/transfer` | `apps/backend/src/banking/categorization.routes.ts:937` | — | — | — |
| nested | `/api/v1/banking/transactions/:id/undo-categorization` | `apps/backend/src/banking/banking.routes.ts:729` | — | — | — |
| create | `/api/v1/banking/transactions/bulk-categorize` | `apps/backend/src/banking/categorization.routes.ts:1165` | — | — | — |
| create | `/api/v1/banking/transactions/bulk-post-as-bills` | `apps/backend/src/banking/categorization.routes.ts:1282` | — | — | — |
| create | `/api/v1/banking/transactions/categorize-bulk` | `apps/backend/src/banking/categorization.routes.ts:813` | — | — | — |
| create | `/api/v1/banking/transactions/post-categorized-backlog` | `apps/backend/src/banking/categorization.routes.ts:1224` | — | — | — |
| create | `/api/v1/banking/transactions/suggest` | `apps/backend/src/banking/p7-wave2.routes.ts:286` | — | — | — |
| create | `/api/v1/banking/transactions/undo-categorization` | `apps/backend/src/banking/categorization.routes.ts:1466` | — | — | — |
| create | `/api/v1/banking/transfers` | `apps/backend/src/banking/transfers.routes.ts:101` | — | — | — |
| create | `/api/v1/banking/transfers/intercompany` | `apps/backend/src/banking/transfers.routes.ts:216` | — | — | — |
| create | `/api/v1/banking/upload-statement` | `apps/backend/src/banking/reconciliation.routes.ts:1586` | — | — | — |

### maintenance — 41 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo` | `apps/backend/src/maintenance/arriving-soon.routes.ts:293` | — | — | — |
| create | `/api/v1/maintenance/arriving-soon/audit-view` | `apps/backend/src/maintenance/arriving-soon.routes.ts:572` | — | — | — |
| create | `/api/v1/maintenance/brake-wear/measurements` | `apps/backend/src/integrations/samsara/cap-13-brake-wear/routes.ts:64` | — | — | — |
| create | `/api/v1/maintenance/drivers` | `apps/backend/src/maintenance/drivers.routes.ts:185` | — | — | — |
| nested | `/api/v1/maintenance/dvir-defects/:id/triage` | `apps/backend/src/maintenance/defects.routes.ts:209` | — | — | — |
| create | `/api/v1/maintenance/fault-rules` | `apps/backend/src/maintenance/fault-auto-wo/fault-rules.routes.ts:74` | — | — | — |
| nested | `/api/v1/maintenance/idle-events/:id/confirm-manual` | `apps/backend/src/maintenance/kpi.routes.ts:421` | — | — | — |
| create | `/api/v1/maintenance/inspections` | `apps/backend/src/maintenance/inspections.routes.ts:294` | — | — | — |
| nested | `/api/v1/maintenance/inspections/:id/photos` | `apps/backend/src/maintenance/inspections.routes.ts:468` | — | — | — |
| create | `/api/v1/maintenance/internal-labor` | `apps/backend/src/maintenance/internal-labor.routes.ts:144` | — | — | — |
| create | `/api/v1/maintenance/parts` | `apps/backend/src/maintenance/parts.routes.ts:210` | — | — | — |
| create | `/api/v1/maintenance/parts-inventory/purchases` | `apps/backend/src/maintenance/parts-inventory.routes.ts:180` | — | — | — |
| create | `/api/v1/maintenance/pm-auto-engine/run-now` | `apps/backend/src/maintenance/pm-auto-engine.service.ts:674` | — | — | — |
| create | `/api/v1/maintenance/pm-auto-engine/settings` | `apps/backend/src/maintenance/pm-auto-engine.service.ts:642` | — | — | — |
| create | `/api/v1/maintenance/pm-schedule` | `apps/backend/src/maintenance/pm-schedule.routes.ts:121` | — | — | — |
| nested | `/api/v1/maintenance/pm-schedule/:id/generate-wo` | `apps/backend/src/maintenance/pm-schedule.routes.ts:173` | — | — | — |
| nested | `/api/v1/maintenance/pre-flight-dvir/:defectId/route` | `apps/backend/src/maintenance/pre-flight-dvir.routes.ts:163` | — | — | — |
| nested | `/api/v1/maintenance/pre-flight/defects/:id/route` | `apps/backend/src/maintenance/pre-flight/routes.ts:171` | — | — | — |
| nested | `/api/v1/maintenance/predictive-alerts/:id/create-work-order` | `apps/backend/src/maintenance/predictive-alerts.routes.ts:126` | — | — | — |
| create | `/api/v1/maintenance/reefer-hours/ingest-samsara` | `apps/backend/src/maintenance/reefer-hours.routes.ts:513` | — | — | — |
| create | `/api/v1/maintenance/reefer-hours/log` | `apps/backend/src/maintenance/reefer-hours.routes.ts:413` | — | — | — |
| create | `/api/v1/maintenance/service-history` | `apps/backend/src/maintenance/service-history-backfill.routes.ts:72` | — | — | — |
| create | `/api/v1/maintenance/severe-repair/export-pdf` | `apps/backend/src/maintenance/severe-repair-estimate.routes.ts:97` | — | — | — |
| create | `/api/v1/maintenance/tire-tread/measurements` | `apps/backend/src/integrations/samsara/cap-12-tire-tread/routes.ts:61` | — | — | — |
| create | `/api/v1/maintenance/tires/brands` | `apps/backend/src/maintenance/tires.routes.ts:335` | — | — | — |
| create | `/api/v1/maintenance/tires/records` | `apps/backend/src/maintenance/tires.routes.ts:421` | — | — | — |
| create | `/api/v1/maintenance/tires/replace` | `apps/backend/src/maintenance/tires.routes.ts:710` | — | — | — |
| create | `/api/v1/maintenance/tires/tread-audit` | `apps/backend/src/maintenance/tires.routes.ts:789` | — | — | — |
| nested | `/api/v1/maintenance/triage/:issue_id/convert-to-damage` | `apps/backend/src/maintenance/triage.routes.ts:206` | — | — | — |
| nested | `/api/v1/maintenance/triage/:issue_id/convert-to-wo` | `apps/backend/src/maintenance/triage.routes.ts:58` | — | — | — |
| create | `/api/v1/maintenance/vehicles` | `apps/backend/src/maintenance/vehicles.routes.ts:196` | — | — | — |
| create | `/api/v1/maintenance/vendors` | `apps/backend/src/maintenance/vendors.routes.ts:378` | — | — | — |
| create | `/api/v1/maintenance/warranty/claims` | `apps/backend/src/maintenance/warranty.routes.ts:463` | — | — | — |
| nested | `/api/v1/maintenance/warranty/claims/:id/file` | `apps/backend/src/maintenance/warranty.routes.ts:584` | — | — | — |
| nested | `/api/v1/maintenance/warranty/claims/:id/reimburse` | `apps/backend/src/maintenance/warranty.routes.ts:625` | — | — | — |
| create | `/api/v1/maintenance/warranty/detect-from-wo` | `apps/backend/src/maintenance/warranty.routes.ts:711` | — | — | — |
| create | `/api/v1/maintenance/warranty/parts` | `apps/backend/src/maintenance/warranty.routes.ts:361` | — | — | — |
| create | `/api/v1/maintenance/work-orders` | `apps/backend/src/maintenance/work-orders.routes.ts:860` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/line-items` | `apps/backend/src/maintenance/work-orders.routes.ts:1853` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/parts-invoice-links` | `apps/backend/src/maintenance/parts-invoice-links.routes.ts:207` | — | — | — |
| nested | `/api/v1/maintenance/work-orders/:id/status` | `apps/backend/src/maintenance/work-orders.routes.ts:1751` | — | — | — |

### dispatch — 36 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival` | `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts:320` | — | — | — |
| nested | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure` | `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts:392` | — | — | — |
| nested | `/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document` | `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts:469` | — | — | — |
| nested | `/api/v1/dispatch/cargo-incidents/:id/file-claim` | `apps/backend/src/integrations/samsara/cap-14-cargo-sensors/routes.ts:92` | — | — | — |
| nested | `/api/v1/dispatch/detention-events/:id/post-driver-pay` | `apps/backend/src/driver-finance/detention-pay-posting.routes.ts:23` | — | — | — |
| nested | `/api/v1/dispatch/detention/events/:id/bridge-billing` | `apps/backend/src/dispatch/detention.routes.ts:93` | — | — | — |
| nested | `/api/v1/dispatch/detention/events/:id/notify-customer` | `apps/backend/src/dispatch/detention.routes.ts:110` | — | — | — |
| nested | `/api/v1/dispatch/equipment-transfers/:uuid/confirm-inbound` | `apps/backend/src/dispatch/equipment-transfer/routes.ts:102` | — | — | — |
| nested | `/api/v1/dispatch/equipment-transfers/:uuid/confirm-outbound` | `apps/backend/src/dispatch/equipment-transfer/routes.ts:79` | — | — | — |
| create | `/api/v1/dispatch/equipment-transfers/initiate` | `apps/backend/src/dispatch/equipment-transfer/routes.ts:29` | — | — | — |
| create | `/api/v1/dispatch/intransit-issues` | `apps/backend/src/dispatch/intransit-issues.routes.ts:61` | — | — | — |
| create | `/api/v1/dispatch/intransit-issues/office` | `apps/backend/src/dispatch/arch-tabs.routes.ts:93` | — | — | — |
| create | `/api/v1/dispatch/loads` | `apps/backend/src/dispatch/loads.routes.ts:1681` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/complete-quicksave-draft` | `apps/backend/src/dispatch/quicksave.routes.ts:129` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/distribute-instructions` | `apps/backend/src/dispatch/loads.routes.ts:1384` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/geocode-stops` | `apps/backend/src/dispatch/loads.routes.ts:2392` | — | — | — |
| nested | `/api/v1/dispatch/loads/:id/quick-assign` | `apps/backend/src/dispatch/quicksave.routes.ts:109` | — | — | — |
| nested | `/api/v1/dispatch/loads/:load_id/confirm-predicted-delivery` | `apps/backend/src/dispatch/predicted-delivery.routes.ts:35` | — | — | — |
| nested | `/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates` | `apps/backend/src/dispatch/loads/multi-stop/extra-rate.routes.ts:46` | — | — | — |
| nested | `/api/v1/dispatch/loads/:loadId/completion-prompts/late-penalty` | `apps/backend/src/dispatch/completion-prompts.routes.ts:276` | — | — | — |
| nested | `/api/v1/dispatch/loads/:loadId/completion-prompts/lumper` | `apps/backend/src/dispatch/completion-prompts.routes.ts:214` | — | — | — |
| nested | `/api/v1/dispatch/loads/:loadId/manual-delivery-authorization` | `apps/backend/src/dispatch/manual-delivery-authorization.routes.ts:73` | — | — | — |
| create | `/api/v1/dispatch/loads/ocr-upload` | `apps/backend/src/dispatch/loads.routes.ts:892` | — | — | — |
| create | `/api/v1/dispatch/loads/reserve-id` | `apps/backend/src/dispatch/loads.routes.ts:778` | — | — | — |
| create | `/api/v1/dispatch/non-owned-trailers` | `apps/backend/src/dispatch/trailer-interchange.routes.ts:128` | — | — | — |
| nested | `/api/v1/dispatch/ocr-intake/items/:id/convert` | `apps/backend/src/dispatch/ocr-intake.routes.ts:83` | — | — | — |
| nested | `/api/v1/dispatch/ocr-intake/items/:id/finalize` | `apps/backend/src/dispatch/ocr-intake.routes.ts:99` | — | — | — |
| nested | `/api/v1/dispatch/ocr-intake/items/:id/reprocess` | `apps/backend/src/dispatch/ocr-intake.routes.ts:70` | — | — | — |
| create | `/api/v1/dispatch/ratecon/extract` | `apps/backend/src/dispatch/ratecon-extract.routes.ts:67` | — | — | — |
| create | `/api/v1/dispatch/trailer-interchanges` | `apps/backend/src/dispatch/trailer-interchange.routes.ts:186` | — | — | — |
| nested | `/api/v1/dispatch/trailer-interchanges/:id/agreement` | `apps/backend/src/dispatch/trailer-interchange.routes.ts:269` | — | — | — |
| nested | `/api/v1/dispatch/trailer-interchanges/:id/receive` | `apps/backend/src/dispatch/trailer-interchange.routes.ts:208` | — | — | — |
| nested | `/api/v1/dispatch/trailer-interchanges/:id/return` | `apps/backend/src/dispatch/trailer-interchange.routes.ts:239` | — | — | — |
| nested | `/api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/arrive` | `apps/backend/src/dispatch/truck-line/stop-stamp.routes.ts:55` | — | — | — |
| nested | `/api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/depart` | `apps/backend/src/dispatch/truck-line/stop-stamp.routes.ts:84` | — | — | — |
| create | `/api/v1/dispatch/validation/pre-dispatch` | `apps/backend/src/dispatch/validation/pre-dispatch.routes.ts:17` | — | — | — |

### catalogs — 28 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/catalogs/account-role-bindings` | `apps/backend/src/catalogs/account-role-bindings.routes.ts:128` | — | — | — |
| create | `/api/v1/catalogs/accounts` | `apps/backend/src/catalogs/accounts.routes.ts:278` | — | — | — |
| create | `/api/v1/catalogs/classes` | `apps/backend/src/catalogs/classes.routes.ts:136` | — | — | — |
| create | `/api/v1/catalogs/dispatch-flag-colors` | `apps/backend/src/catalogs/dispatch-flag-colors.routes.ts:103` | — | — | — |
| nested | `/api/v1/catalogs/dispatch-flag-colors/:id/reactivate` | `apps/backend/src/catalogs/dispatch-flag-colors.routes.ts:282` | — | — | — |
| create | `/api/v1/catalogs/driver-load-statuses` | `apps/backend/src/catalogs/driver-load-statuses.routes.ts:128` | — | — | — |
| create | `/api/v1/catalogs/driver-termination-reasons` | `apps/backend/src/mdata/driver-safety-events.routes.ts:171` | — | — | — |
| nested | `/api/v1/catalogs/driver-termination-reasons/:id/reactivate` | `apps/backend/src/mdata/driver-safety-events.routes.ts:333` | — | — | — |
| create | `/api/v1/catalogs/equipment-types` | `apps/backend/src/catalogs/equipment-types.routes.ts:218` | — | — | — |
| create | `/api/v1/catalogs/file-categories` | `apps/backend/src/catalogs/file-categories.routes.ts:69` | — | — | — |
| create | `/api/v1/catalogs/items` | `apps/backend/src/catalogs/items.routes.ts:180` | — | — | — |
| create | `/api/v1/catalogs/load-cancellation-reasons` | `apps/backend/src/catalogs/load-cancellation-reasons.routes.ts:131` | — | — | — |
| create | `/api/v1/catalogs/load-exception-reasons` | `apps/backend/src/catalogs/load-exception-reasons.routes.ts:107` | — | — | — |
| create | `/api/v1/catalogs/maintenance/parts-master` | `apps/backend/src/catalogs/maintenance/parts.routes.ts:115` | — | — | — |
| create | `/api/v1/catalogs/maintenance/services-catalog` | `apps/backend/src/catalogs/maintenance/services.routes.ts:158` | — | — | — |
| create | `/api/v1/catalogs/payment-methods` | `apps/backend/src/driver-finance/payment-methods-catalog.routes.ts:60` | — | — | — |
| create | `/api/v1/catalogs/payment-terms` | `apps/backend/src/catalogs/payment-terms.routes.ts:143` | — | — | — |
| create | `/api/v1/catalogs/posting-templates` | `apps/backend/src/catalogs/posting-templates.routes.ts:155` | — | — | — |
| create | `/api/v1/catalogs/registry` | `apps/backend/src/catalogs/catalog-registry.routes.ts:346` | — | — | — |
| create | `/api/v1/catalogs/safety/cargo-claim-reasons` | `apps/backend/src/catalogs/safety/cargo-claim-reasons.routes.ts:117` | — | — | — |
| create | `/api/v1/catalogs/safety/civil-fine-types` | `apps/backend/src/catalogs/safety/civil-fine-types.routes.ts:116` | — | — | — |
| create | `/api/v1/catalogs/safety/company-violation-types` | `apps/backend/src/catalogs/safety/company-violation-types.routes.ts:108` | — | — | — |
| create | `/api/v1/catalogs/safety/complaint-types` | `apps/backend/src/catalogs/safety/complaint-types.routes.ts:102` | — | — | — |
| create | `/api/v1/catalogs/safety/dot-violation-types` | `apps/backend/src/catalogs/safety/dot-violation-types.routes.ts:143` | — | — | — |
| create | `/api/v1/catalogs/safety/internal-fine-reasons` | `apps/backend/src/catalogs/safety/internal-fine-reasons.routes.ts:118` | — | — | — |
| create | `/api/v1/catalogs/void-cancel-reasons` | `apps/backend/src/catalogs/void-cancel-reasons.routes.ts:123` | — | — | — |
| create | `/api/v1/catalogs/wo-cancellation-reasons` | `apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts:94` | — | — | — |
| create | `/api/v1/catalogs/workflow-requests` | `apps/backend/src/catalogs/workflow-routes.ts:276` | — | — | — |

### legal — 21 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/legal/attorney-review/:token/request-changes` | `apps/backend/src/legal/attorney-review.routes.ts:45` | — | — | — |
| create | `/api/v1/legal/contracts` | `apps/backend/src/legal/contracts.routes.ts:258` | — | — | — |
| create | `/api/v1/legal/contracts/draft-preview` | `apps/backend/src/legal/contracts.routes.ts:227` | — | — | — |
| create | `/api/v1/legal/contracts/lease-to-own/ensure-template` | `apps/backend/src/legal/contracts.routes.ts:388` | — | — | — |
| create | `/api/v1/legal/contracts/sync-linkage` | `apps/backend/src/legal/contracts.routes.ts:127` | — | — | — |
| nested | `/api/v1/legal/contracts/templates/:code/ensure` | `apps/backend/src/legal/contracts.routes.ts:347` | — | — | — |
| create | `/api/v1/legal/contracts/truck-lease/ensure-template` | `apps/backend/src/legal/contracts.routes.ts:332` | — | — | — |
| create | `/api/v1/legal/linkage/backfill-from-sources` | `apps/backend/src/legal/contracts.routes.ts:144` | — | — | — |
| create | `/api/v1/legal/matters` | `apps/backend/src/legal/matters.routes.ts:205` | — | — | — |
| nested | `/api/v1/legal/matters/:id/deadlines` | `apps/backend/src/legal/matters.routes.ts:455` | — | — | — |
| nested | `/api/v1/legal/matters/:id/documents` | `apps/backend/src/legal/matters.routes.ts:410` | — | — | — |
| nested | `/api/v1/legal/matters/:id/events` | `apps/backend/src/legal/matters.routes.ts:389` | — | — | — |
| nested | `/api/v1/legal/matters/:id/legal-fee` | `apps/backend/src/legal/matters.routes.ts:334` | — | — | — |
| nested | `/api/v1/legal/matters/:id/recovery` | `apps/backend/src/legal/matters.routes.ts:362` | — | — | — |
| nested | `/api/v1/legal/matters/:id/reserve` | `apps/backend/src/legal/matters.routes.ts:299` | — | — | — |
| nested | `/api/v1/legal/sign/:token/verify/confirm` | `apps/backend/src/legal/sign.routes.ts:58` | — | — | — |
| create | `/api/v1/legal/templates` | `apps/backend/src/legal/templates.routes.ts:147` | — | — | — |
| nested | `/api/v1/legal/templates/:id/attorney-review-link` | `apps/backend/src/legal/templates.routes.ts:259` | — | — | — |
| nested | `/api/v1/legal/templates/:id/new-version` | `apps/backend/src/legal/templates.routes.ts:215` | — | — | — |
| nested | `/api/v1/legal/templates/:id/retire` | `apps/backend/src/legal/templates.routes.ts:332` | — | — | — |
| create | `/api/v1/legal/templates/library/ensure` | `apps/backend/src/legal/templates.routes.ts:196` | — | — | — |

### driver-finance — 20 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/driver-finance/batch-settlements` | `apps/backend/src/driver-finance/batch-settlements.routes.ts:95` | — | — | — |
| create | `/api/v1/driver-finance/cash-advance-requests` | `apps/backend/src/driver-finance/cash-advance-requests.routes.ts:314` | — | — | — |
| nested | `/api/v1/driver-finance/cash-advance-requests/:id/deny` | `apps/backend/src/driver-finance/cash-advance-requests.routes.ts:421` | — | — | — |
| nested | `/api/v1/driver-finance/drivers/:driverId/payment-methods` | `apps/backend/src/driver-finance/driver-payment-methods.routes.ts:81` | — | — | — |
| create | `/api/v1/driver-finance/escrow-separations` | `apps/backend/src/driver-finance/escrow-separation.routes.ts:67` | — | — | — |
| nested | `/api/v1/driver-finance/escrow/:driverId/forfeit` | `apps/backend/src/driver-finance/escrow-forfeit.routes.ts:46` | — | — | — |
| nested | `/api/v1/driver-finance/pre-settlements/:id/add-load` | `apps/backend/src/driver-finance/pre-settlement.routes.ts:288` | — | — | — |
| nested | `/api/v1/driver-finance/pre-settlements/:id/close-tour` | `apps/backend/src/driver-finance/tour-readout.routes.ts:616` | — | — | — |
| nested | `/api/v1/driver-finance/pre-settlements/:id/settle` | `apps/backend/src/driver-finance/pre-settlement.routes.ts:423` | — | — | — |
| nested | `/api/v1/driver-finance/presettlement-suggestions/:id/confirm` | `apps/backend/src/dispatch/presettlement-link.routes.ts:71` | — | — | — |
| create | `/api/v1/driver-finance/settlement-deductions` | `apps/backend/src/driver-finance/deductions.routes.ts:195` | — | — | — |
| create | `/api/v1/driver-finance/settlement-disputes` | `apps/backend/src/driver-finance/settlement-dispute.routes.ts:87` | — | — | — |
| nested | `/api/v1/driver-finance/settlement-disputes/:id/disburse` | `apps/backend/src/driver-finance/settlement-dispute.routes.ts:234` | — | — | — |
| nested | `/api/v1/driver-finance/settlement-disputes/:id/withdraw` | `apps/backend/src/driver-finance/settlement-dispute.routes.ts:257` | — | — | — |
| create | `/api/v1/driver-finance/settlement-references` | `apps/backend/src/driver-finance/settlements.routes.ts:179` | — | — | — |
| create | `/api/v1/driver-finance/settlements` | `apps/backend/src/driver-finance/settlements.routes.ts:1123` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/close-trip` | `apps/backend/src/driver-finance/settlement-payrun-close.routes.ts:147` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/pay-lines` | `apps/backend/src/driver-finance/settlements.routes.ts:1249` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/payrun-close` | `apps/backend/src/driver-finance/settlement-payrun-close.routes.ts:104` | — | — | — |
| nested | `/api/v1/driver-finance/settlements/:id/unlock` | `apps/backend/src/driver-finance/settlements.routes.ts:1583` | — | — | — |

### driver — 18 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/driver/arrival-prompts/:id/confirm` | `apps/backend/src/driver/arrival-prompts.routes.ts:90` | — | — | — |
| nested | `/api/v1/driver/arrival-prompts/:id/dismiss` | `apps/backend/src/driver/arrival-prompts.routes.ts:182` | — | — | — |
| create | `/api/v1/driver/cash-advance-requests` | `apps/backend/src/driver-finance/cash-advance-requests.routes.ts:92` | — | — | — |
| nested | `/api/v1/driver/chat/messages/:id/receipt` | `apps/backend/src/chat/chat.routes.ts:237` | — | — | — |
| nested | `/api/v1/driver/chat/threads/:id/messages` | `apps/backend/src/chat/chat.routes.ts:224` | — | — | — |
| create | `/api/v1/driver/dvir` | `apps/backend/src/driver/dvir.routes.ts:19` | — | — | — |
| create | `/api/v1/driver/fuel/upload-receipt` | `apps/backend/src/driver/fuel-receipt.routes.ts:63` | — | — | — |
| nested | `/api/v1/driver/loads/:id/accept` | `apps/backend/src/driver/loads.routes.ts:374` | — | — | — |
| nested | `/api/v1/driver/loads/:id/stops/:stopId/arrive` | `apps/backend/src/driver/loads.routes.ts:494` | — | — | — |
| nested | `/api/v1/driver/loads/:id/stops/:stopId/depart` | `apps/backend/src/driver/loads.routes.ts:599` | — | — | — |
| nested | `/api/v1/driver/loads/:loadId/stops/:stopId/pod` | `apps/backend/src/dispatch/pod.routes.ts:93` | — | — | — |
| create | `/api/v1/driver/messages` | `apps/backend/src/drivers/messages.routes.ts:127` | — | — | — |
| create | `/api/v1/driver/push-subscription` | `apps/backend/src/driver/push-subscriptions.routes.ts:23` | — | — | — |
| create | `/api/v1/driver/reports` | `apps/backend/src/driver/reports.routes.ts:29` | — | — | — |
| create | `/api/v1/driver/scheduler/request` | `apps/backend/src/safety/driver-scheduler.routes.ts:147` | — | — | — |
| nested | `/api/v1/driver/scheduler/request/:id/documentation` | `apps/backend/src/safety/driver-scheduler.routes.ts:191` | — | — | — |
| nested | `/api/v1/driver/settlements/:settlementId/dispute` | `apps/backend/src/driver/settlement-disputes-p6.routes.ts:38` | — | — | — |
| nested | `/api/v1/driver/status-suggestions/:id/respond` | `apps/backend/src/driver/status-suggestions.routes.ts:73` | — | — | — |

### factoring — 14 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/factoring/batches` | `apps/backend/src/factoring/batch.routes.ts:60` | — | — | — |
| create | `/api/v1/factoring/cash-reserve-reclass` | `apps/backend/src/factoring/cash-reserve-reclass.routes.ts:28` | — | — | — |
| create | `/api/v1/factoring/factors` | `apps/backend/src/factoring/factor.routes.ts:179` | — | — | — |
| nested | `/api/v1/factoring/factors/:id/letter-of-release` | `apps/backend/src/factoring/factor.routes.ts:371` | — | — | — |
| create | `/api/v1/factoring/faro-imports` | `apps/backend/src/data-infra/data-infra.routes.ts:179` | — | — | — |
| nested | `/api/v1/factoring/faro-reserve-entries/:id/short-pay-resolution` | `apps/backend/src/factoring/faro-reserve-entries.routes.ts:55` | — | — | — |
| create | `/api/v1/factoring/import/faro` | `apps/backend/src/factoring/faro-csv-import.routes.ts:26` | — | — | — |
| create | `/api/v1/factoring/interest-accrual/propose` | `apps/backend/src/factoring/interest-accrual.routes.ts:79` | — | — | — |
| nested | `/api/v1/factoring/interest-accrual/runs/:id/decide` | `apps/backend/src/factoring/interest-accrual.routes.ts:93` | — | — | — |
| nested | `/api/v1/factoring/purchase-lines/:id/faro-invoice-number` | `apps/backend/src/factoring/purchase.routes.ts:271` | — | — | — |
| create | `/api/v1/factoring/purchases` | `apps/backend/src/factoring/purchase.routes.ts:209` | — | — | — |
| nested | `/api/v1/factoring/purchases/candidates/:invoiceId/${suffix}` | `apps/backend/src/factoring/purchase.routes.ts:148` | — | — | — |
| nested | `/api/v1/factoring/repurchase-due/:id/decide` | `apps/backend/src/factoring/repurchase-due.routes.ts:42` | — | — | — |
| create | `/api/v1/factoring/submission-queue/submit-batch` | `apps/backend/src/factoring/submission-queue.routes.ts:59` | — | — | — |

### compliance — 11 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/compliance/csa/mitigation-actions` | `apps/backend/src/compliance/csa.routes.ts:370` | — | — | — |
| create | `/api/v1/compliance/csa/pull-now` | `apps/backend/src/compliance/csa.routes.ts:584` | — | — | — |
| create | `/api/v1/compliance/drug-alcohol/results` | `apps/backend/src/compliance/drug-alcohol.routes.ts:226` | — | — | — |
| create | `/api/v1/compliance/fmcsa-safer/verify-now` | `apps/backend/src/compliance/fmcsa-safer.routes.ts:153` | — | — | — |
| nested | `/api/v1/compliance/form-2290/:id/mark-submitted` | `apps/backend/src/compliance/form-2290.routes.ts:353` | — | — | — |
| create | `/api/v1/compliance/form-2290/generate-draft` | `apps/backend/src/compliance/form-2290.routes.ts:192` | — | — | — |
| create | `/api/v1/compliance/notification-rules` | `apps/backend/src/compliance/compliance-notification-rules.routes.ts:58` | — | — | — |
| create | `/api/v1/compliance/property-tax/appraisal-districts` | `apps/backend/src/compliance/property-tax/property-tax.routes.ts:92` | — | — | — |
| create | `/api/v1/compliance/property-tax/renditions` | `apps/backend/src/compliance/property-tax/property-tax.routes.ts:212` | — | — | — |
| nested | `/api/v1/compliance/property-tax/renditions/:id/lines` | `apps/backend/src/compliance/property-tax/property-tax.routes.ts:258` | — | — | — |
| create | `/api/v1/compliance/required-document-types` | `apps/backend/src/compliance/required-documents.routes.ts:91` | — | — | — |

### insurance — 11 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/insurance/claims` | `apps/backend/src/insurance/claim.routes.ts:499` | — | — | — |
| create | `/api/v1/insurance/coi-requests` | `apps/backend/src/insurance/coi-request.routes.ts:56` | — | — | — |
| create | `/api/v1/insurance/lawsuits` | `apps/backend/src/insurance/lawsuit.routes.ts:131` | — | — | — |
| create | `/api/v1/insurance/payment-schedule` | `apps/backend/src/insurance/payment-schedule.routes.ts:101` | — | — | — |
| create | `/api/v1/insurance/policies` | `apps/backend/src/insurance/policy.routes.ts:274` | — | — | — |
| nested | `/api/v1/insurance/policies/:id/generate-bills` | `apps/backend/src/insurance/dispersal.routes.ts:274` | — | — | — |
| nested | `/api/v1/insurance/policies/:policy_id/renew` | `apps/backend/src/insurance/policy.routes.ts:701` | — | — | — |
| nested | `/api/v1/insurance/policies/:policy_id/units` | `apps/backend/src/insurance/policy.routes.ts:518` | — | — | — |
| create | `/api/v1/insurance/policies/with-bills` | `apps/backend/src/insurance/policy-create-atomic.routes.ts:42` | — | — | — |
| create | `/api/v1/insurance/schedule-confirmations` | `apps/backend/src/insurance/schedule-confirmations.routes.ts:35` | — | — | — |
| create | `/api/v1/insurance/type-catalog` | `apps/backend/src/insurance/type-catalog.routes.ts:116` | — | — | — |

### identity — 9 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/identity/applicants/:id/convert-to-driver` | `apps/backend/src/identity/applicants.routes.ts:318` | — | — | — |
| create | `/api/v1/identity/applicants/ensure-portal` | `apps/backend/src/identity/applicants.routes.ts:192` | — | — | — |
| create | `/api/v1/identity/me/switch-company` | `apps/backend/src/identity/company-context.routes.ts:130` | — | — | — |
| create | `/api/v1/identity/password-reset/confirm` | `apps/backend/src/identity/password-reset.routes.ts:106` | — | — | — |
| create | `/api/v1/identity/password-reset/request` | `apps/backend/src/identity/password-reset.routes.ts:41` | — | — | — |
| create | `/api/v1/identity/users` | `apps/backend/src/identity/users.routes.ts:672` | — | — | — |
| nested | `/api/v1/identity/users/:user_id/safety-events` | `apps/backend/src/mdata/dispatcher-safety-events.routes.ts:495` | — | — | — |
| create | `/api/v1/identity/users/check-returning-dispatcher` | `apps/backend/src/mdata/dispatcher-safety-events.routes.ts:794` | — | — | — |
| create | `/api/v1/identity/workflow-requests` | `apps/backend/src/identity/workflow-routes.ts:123` | — | — | — |

### reports — 9 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/reports/custom-definitions` | `apps/backend/src/reports/custom-report-builder.routes.ts:92` | — | — | — |
| create | `/api/v1/reports/form-425c/exhibits/build` | `apps/backend/src/reports/form-425c/exhibits/routes.ts:26` | — | — | — |
| nested | `/api/v1/reports/ifta/draft/:uuid/mark-filed` | `apps/backend/src/reports/ifta/routes.ts:121` | — | — | — |
| nested | `/api/v1/reports/ifta/draft/:uuid/owner-approve` | `apps/backend/src/reports/ifta/routes.ts:103` | — | — | — |
| create | `/api/v1/reports/ifta/prepare` | `apps/backend/src/reports/ifta/routes.ts:44` | — | — | — |
| create | `/api/v1/reports/run-log` | `apps/backend/src/reports/library.routes.ts:680` | — | — | — |
| create | `/api/v1/reports/scheduled` | `apps/backend/src/reports/scheduled-reports.routes.ts:68` | — | — | — |
| nested | `/api/v1/reports/scheduled/:id/test-send` | `apps/backend/src/reports/scheduled-reports.routes.ts:174` | — | — | — |
| create | `/api/v1/reports/scheduled/subscriptions` | `apps/backend/src/reports/scheduled/routes.ts:71` | — | — | — |

### form-425c — 8 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/form-425c` | `apps/backend/src/compliance/form-425c.routes.ts:730` | — | — | — |
| nested | `/api/v1/form-425c/:id/amend` | `apps/backend/src/compliance/form-425c.routes.ts:1310` | — | — | — |
| nested | `/api/v1/form-425c/:id/exhibit-a` | `apps/backend/src/compliance/form-425c.routes.ts:1495` | — | — | — |
| nested | `/api/v1/form-425c/:id/exhibit-b` | `apps/backend/src/compliance/form-425c.routes.ts:1539` | — | — | — |
| nested | `/api/v1/form-425c/:id/generate-filing-pdf` | `apps/backend/src/compliance/form-425c.routes.ts:1105` | — | — | — |
| nested | `/api/v1/form-425c/:id/import-banking` | `apps/backend/src/compliance/form-425c.routes.ts:998` | — | — | — |
| nested | `/api/v1/form-425c/:id/mark-filed` | `apps/backend/src/compliance/form-425c.routes.ts:1223` | — | — | — |
| create | `/api/v1/form-425c/profiles` | `apps/backend/src/compliance/form-425c.routes.ts:639` | — | — | — |

### fuel — 8 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/fuel/card-assignments` | `apps/backend/src/fuel/fuel-card-assignments.routes.ts:101` | — | — | — |
| nested | `/api/v1/fuel/card-assignments/:id/end` | `apps/backend/src/fuel/fuel-card-assignments.routes.ts:121` | — | — | — |
| nested | `/api/v1/fuel/card-overage-events/:id/exempt` | `apps/backend/src/fuel/fuel-card-overage.routes.ts:299` | — | — | — |
| create | `/api/v1/fuel/card-overage-events/reprocess` | `apps/backend/src/fuel/fuel-card-overage.routes.ts:363` | — | — | — |
| nested | `/api/v1/fuel/card-types/:id/issuer` | `apps/backend/src/fuel/fuel-card-assignments.routes.ts:169` | — | — | — |
| create | `/api/v1/fuel/gl/reflush-unposted` | `apps/backend/src/fuel/fuel-gl-reflush.routes.ts:26` | — | — | — |
| nested | `/api/v1/fuel/planner/recommendations/:id/send-to-driver` | `apps/backend/src/fuel/planner.routes.ts:284` | — | — | — |
| create | `/api/v1/fuel/transactions` | `apps/backend/src/fuel/fuel-transactions.routes.ts:347` | — | — | — |

### settlements — 7 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/settlements` | `apps/backend/src/driver-finance/settlements-mvp.routes.ts:140` | — | — | — |
| nested | `/api/v1/settlements/:id/disputes` | `apps/backend/src/settlements/disputes/disputes.routes.ts:407` | — | — | — |
| create | `/api/v1/settlements/approve-line` | `apps/backend/src/settlements/approval.routes.ts:111` | — | — | — |
| create | `/api/v1/settlements/finalize` | `apps/backend/src/settlements/approval.routes.ts:194` | — | — | — |
| create | `/api/v1/settlements/generate-pdf` | `apps/backend/src/settlements/approval.routes.ts:291` | — | — | — |
| create | `/api/v1/settlements/reject-line` | `apps/backend/src/settlements/approval.routes.ts:140` | — | — | — |
| create | `/api/v1/settlements/weekly-close` | `apps/backend/src/driver-finance/weekly-close.routes.ts:255` | — | — | — |

### customers — 7 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/customers/:customer_id/contacts` | `apps/backend/src/mdata/customer-detail-alias.routes.ts:22` | — | — | — |
| nested | `/api/v1/customers/:customer_id/lanes` | `apps/backend/src/mdata/customer-detail-alias.routes.ts:43` | — | — | — |
| nested | `/api/v1/customers/:customerId/factor` | `apps/backend/src/factoring/factor.routes.ts:409` | — | — | — |
| nested | `/api/v1/customers/:id/flag-duplicate` | `apps/backend/src/mdata/reclassify.routes.ts:192` | — | — | — |
| nested | `/api/v1/customers/:id/payments` | `apps/backend/src/accounting/customer-payments.routes.ts:163` | — | — | — |
| nested | `/api/v1/customers/:id/portal-users` | `apps/backend/src/shipper-portal/portal-users-admin.routes.ts:70` | — | — | — |
| nested | `/api/v1/customers/:id/reclassify` | `apps/backend/src/mdata/reclassify.routes.ts:105` | — | — | — |

### checks — 6 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/checks` | `apps/backend/src/accounting/checks/checks.routes.ts:142` | — | — | — |
| nested | `/api/v1/checks/:id/reissue` | `apps/backend/src/accounting/checks/checks.routes.ts:914` | — | — | — |
| nested | `/api/v1/checks/:id/unvoid` | `apps/backend/src/accounting/checks/checks.routes.ts:881` | — | — | — |
| create | `/api/v1/checks/pay-bills` | `apps/backend/src/accounting/checks/checks.routes.ts:492` | — | — | — |
| create | `/api/v1/checks/print-batch` | `apps/backend/src/accounting/checks/checks.routes.ts:769` | — | — | — |
| nested | `/api/v1/checks/print-batch/:id/confirm` | `apps/backend/src/accounting/checks/checks.routes.ts:805` | — | — | — |

### driver-pay — 6 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/driver-pay/settlements/:id/mark-bounced` | `apps/backend/src/driver-finance/settlement-payment.routes.ts:121` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/mark-cleared` | `apps/backend/src/driver-finance/settlement-payment.routes.ts:105` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/mark-paid-manually` | `apps/backend/src/driver-finance/settlement-payment.routes.ts:139` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/mark-sent` | `apps/backend/src/driver-finance/settlement-payment.routes.ts:87` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/queue-payment` | `apps/backend/src/driver-finance/settlement-payment.routes.ts:71` | — | — | — |
| nested | `/api/v1/driver-pay/settlements/:id/reopen-manual-paid` | `apps/backend/src/driver-finance/settlement-payment.routes.ts:170` | — | — | — |

### bank-recon — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/bank-recon/accept-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:90` | — | — | — |
| create | `/api/v1/bank-recon/accept-multi-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:218` | — | — | — |
| create | `/api/v1/bank-recon/close-period` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:257` | — | — | — |
| create | `/api/v1/bank-recon/manual-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:177` | — | — | — |
| create | `/api/v1/bank-recon/reject-match` | `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:131` | — | — | — |

### ifta — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/ifta/preparations` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts:56` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/aggregate-gallons` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts:160` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/aggregate-miles` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts:109` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/calculate-tax` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts:203` | — | — | — |
| nested | `/api/v1/ifta/preparations/:id/generate-csv` | `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts:270` | — | — | — |

### scheduled-reports — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/scheduled-reports` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts:173` | — | — | — |
| nested | `/api/v1/scheduled-reports/:id/pause` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts:407` | — | — | — |
| nested | `/api/v1/scheduled-reports/:id/resume` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts:448` | — | — | — |
| nested | `/api/v1/scheduled-reports/:id/send-now` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts:501` | — | — | — |
| create | `/api/v1/scheduled-reports/test-send` | `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts:586` | — | — | — |

### master-data — 5 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/master-data/drivers/:id/link-qbo-vendor` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts:167` | — | — | — |
| nested | `/api/v1/master-data/trailers/:id/link-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts:225` | — | — | — |
| nested | `/api/v1/master-data/trailers/:id/unlink-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts:278` | — | — | — |
| nested | `/api/v1/master-data/units/:id/link-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts:199` | — | — | — |
| nested | `/api/v1/master-data/units/:id/unlink-qbo-class` | `apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts:261` | — | — | — |

### chat — 4 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/chat/attachments/presign` | `apps/backend/src/chat/chat.routes.ts:136` | — | — | — |
| nested | `/api/v1/chat/messages/:id/receipt` | `apps/backend/src/chat/chat.routes.ts:127` | — | — | — |
| nested | `/api/v1/chat/threads/:id/messages` | `apps/backend/src/chat/chat.routes.ts:91` | — | — | — |
| create | `/api/v1/chat/threads/for-load` | `apps/backend/src/chat/chat.routes.ts:66` | — | — | — |

### docs — 4 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/docs/files/:file_id/links` | `apps/backend/src/docs/files.routes.ts:893` | — | — | — |
| nested | `/api/v1/docs/files/:file_id/upload-complete` | `apps/backend/src/docs/files.routes.ts:485` | — | — | — |
| nested | `/api/v1/docs/files/:file_id/versions` | `apps/backend/src/docs/files.routes.ts:1097` | — | — | — |
| create | `/api/v1/docs/files/upload-url` | `apps/backend/src/docs/files.routes.ts:353` | — | — | — |

### expenses — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/expenses` | `apps/backend/src/accounting/expenses.routes.ts:731` | — | — | — |
| nested | `/api/v1/expenses/:expenseId/reattribute` | `apps/backend/src/accounting/expenses.routes.ts:1486` | — | — | — |
| nested | `/api/v1/expenses/:expenseId/unvoid` | `apps/backend/src/accounting/expenses.routes.ts:1825` | — | — | — |

### finance — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/finance/calculator/compute` | `apps/backend/src/finance/calculator/routes.ts:13` | — | — | — |
| create | `/api/v1/finance/loans` | `apps/backend/src/finance/amortization/routes.ts:20` | — | — | — |
| create | `/api/v1/finance/scenarios` | `apps/backend/src/finance/scenarios/routes.ts:36` | — | — | — |

### leases — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/leases` | `apps/backend/src/leases/lease.routes.ts:124` | — | — | — |
| nested | `/api/v1/leases/:id/buyout` | `apps/backend/src/leases/lease.routes.ts:181` | — | — | — |
| nested | `/api/v1/leases/:id/sign` | `apps/backend/src/leases/lease.routes.ts:139` | — | — | — |

### notifications — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/notifications/:id/dismiss` | `apps/backend/src/notifications/notifications.routes.ts:45` | — | — | — |
| nested | `/api/v1/notifications/:id/read` | `apps/backend/src/notifications/notifications.routes.ts:23` | — | — | — |
| create | `/api/v1/notifications/mark-all-read` | `apps/backend/src/notifications/notifications.routes.ts:68` | — | — | — |

### safety-docs — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/safety-docs` | `apps/backend/src/safetydoc/safetydoc.routes.ts:15` | — | — | — |
| nested | `/api/v1/safety-docs/assignments/:id/read` | `apps/backend/src/safetydoc/safetydoc.routes.ts:108` | — | — | — |
| nested | `/api/v1/safety-docs/assignments/:id/sign` | `apps/backend/src/safetydoc/safetydoc.routes.ts:131` | — | — | — |

### telematics — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/telematics/geofences` | `apps/backend/src/telematics/geofences.routes.ts:227` | — | — | — |
| create | `/api/v1/telematics/odometer-readings` | `apps/backend/src/telematics/odometer-manual.routes.ts:57` | — | — | — |
| create | `/api/v1/telematics/stops/geocode-backfill` | `apps/backend/src/telematics/stops-geocode-backfill.routes.ts:9` | — | — | — |

### driver-pwa — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/driver-pwa/transfers/:id/ack-dropoff` | `apps/backend/src/mdata/equipment-transfer.routes.ts:191` | — | — | — |
| nested | `/api/v1/driver-pwa/transfers/:id/ack-pickup` | `apps/backend/src/mdata/equipment-transfer.routes.ts:213` | — | — | — |
| nested | `/api/v1/driver-pwa/transfers/:id/confirm` | `apps/backend/src/mdata/equipment-transfer.routes.ts:235` | — | — | — |

### loads — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/loads/:id/team-split` | `apps/backend/src/settlements/team-splits/team-splits.routes.ts:349` | — | — | — |
| nested | `/api/v1/loads/:loadId/abandonment` | `apps/backend/src/mdata/load-abandonment.routes.ts:35` | — | — | — |
| nested | `/api/v1/loads/:loadId/stops` | `apps/backend/src/dispatch/dispatch-refinements.routes.ts:221` | — | — | — |

### vendors — 3 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/vendors/:id/bill-payments` | `apps/backend/src/accounting/vendor-bill-payments.routes.ts:488` | — | — | — |
| nested | `/api/v1/vendors/:id/flag-duplicate` | `apps/backend/src/mdata/reclassify.routes.ts:327` | — | — | — |
| nested | `/api/v1/vendors/:id/reclassify` | `apps/backend/src/mdata/reclassify.routes.ts:240` | — | — | — |

### attachments — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/attachments/:id/finalize` | `apps/backend/src/documents/attachments.routes.ts:138` | — | — | — |
| create | `/api/v1/attachments/upload-url` | `apps/backend/src/documents/attachments.routes.ts:113` | — | — | — |

### cash-advances — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/cash-advances` | `apps/backend/src/cash-advances/cash-advances.routes.ts:323` | — | — | — |
| nested | `/api/v1/cash-advances/hub/requests/:id/deny` | `apps/backend/src/cash-advances/driver-hub-requests.routes.ts:89` | — | — | — |

### cash-flow — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/cash-flow/adjustments` | `apps/backend/src/cash-flow/cash-flow.routes.ts:142` | — | — | — |
| create | `/api/v1/cash-flow/rolling-ledger/adjustments` | `apps/backend/src/cash-flow/cash-flow.routes.ts:232` | — | — | — |

### customer-contracts — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/customer-contracts` | `apps/backend/src/customer-contracts/customer-contract.routes.ts:53` | — | — | — |
| nested | `/api/v1/customer-contracts/:id/supersede` | `apps/backend/src/customer-contracts/customer-contract.routes.ts:184` | — | — | — |

### daily-tasks — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/daily-tasks` | `apps/backend/src/daily-tasks/daily-tasks.routes.ts:32` | — | — | — |
| nested | `/api/v1/daily-tasks/:id/accept` | `apps/backend/src/daily-tasks/daily-tasks.routes.ts:91` | — | — | — |

### driver-alerts — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/driver-alerts` | `apps/backend/src/driveralert/driveralert.routes.ts:15` | — | — | — |
| nested | `/api/v1/driver-alerts/:id/re-alarm` | `apps/backend/src/driveralert/driveralert.routes.ts:141` | — | — | — |

### email — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/email/queue/:id/retry-now` | `apps/backend/src/email/email.routes.ts:125` | — | — | — |
| create | `/api/v1/email/test` | `apps/backend/src/email/email.routes.ts:47` | — | — | — |

### geofences — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/geofences/:id/samsara-address-link` | `apps/backend/src/integrations/samsara/geofences/geofence-address-link.routes.ts:32` | — | — | — |
| create | `/api/v1/geofences/samsara-push` | `apps/backend/src/integrations/samsara/geofences/geofence-address-link.routes.ts:66` | — | — | — |

### governance — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/governance/void-cancel-requests` | `apps/backend/src/governance/void-cancel-requests.routes.ts:103` | — | — | — |
| nested | `/api/v1/governance/void-cancel-requests/:id/deny` | `apps/backend/src/governance/void-cancel-requests.routes.ts:308` | — | — | — |

### maint — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/maint/parts` | `apps/backend/src/maint/parts.routes.ts:91` | — | — | — |
| create | `/api/v1/maint/pm/schedules` | `apps/backend/src/maint/pm.routes.ts:187` | — | — | — |

### portal — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/portal/auth/forgot-password` | `apps/backend/src/shipper-portal/portal-auth.routes.ts:116` | — | — | — |
| create | `/api/v1/portal/auth/reset-password` | `apps/backend/src/shipper-portal/portal-auth.routes.ts:170` | — | — | — |

### road-service-tickets — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/road-service-tickets` | `apps/backend/src/maintenance/road-service/tickets.routes.ts:160` | — | — | — |
| nested | `/api/v1/road-service-tickets/:id/create-wo` | `apps/backend/src/maintenance/road-service/tickets.routes.ts:312` | — | — | — |

### tax-documents — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/tax-documents/1099-nec/:id/render-pdf` | `apps/backend/src/tax-documents/tax-documents.routes.ts:249` | — | — | — |
| create | `/api/v1/tax-documents/1099-nec/generate-batch` | `apps/backend/src/tax-documents/tax-documents.routes.ts:81` | — | — | — |

### work-orders — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/work-orders` | `apps/backend/src/work-orders/work-orders.routes.ts:701` | — | — | — |
| nested | `/api/v1/work-orders/:id/photos` | `apps/backend/src/work-orders/work-orders.routes.ts:1425` | — | — | — |

### units — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/units/:unit_uuid/permits` | `apps/backend/src/master-data/units/permits/routes.ts:77` | — | — | — |
| nested | `/api/units/:unit_uuid/toll-tags` | `apps/backend/src/master-data/units/toll-tags/routes.ts:76` | — | — | — |

### disputes — 2 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/disputes/:disputeId/decide` | `apps/backend/src/accounting/disputes.routes.ts:128` | — | — | — |
| nested | `/api/v1/disputes/:disputeId/start-review` | `apps/backend/src/accounting/disputes.routes.ts:105` | — | — | — |

### ap — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/ap/bill-payments` | `apps/backend/src/ap/payment-application.routes.ts:71` | — | — | — |

### assets — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/assets` | `apps/backend/src/assets/assets.routes.ts:249` | — | — | — |

### assignments — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/assignments/quicksave` | `apps/backend/src/assignments/quicksave.routes.ts:87` | — | — | — |

### auto-deductions — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/auto-deductions/policies` | `apps/backend/src/settlements/auto-deductions/policy.routes.ts:88` | — | — | — |

### bill-payments — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/bill-payments/cc` | `apps/backend/src/bill-payments/cc-payment.routes.ts:36` | — | — | — |

### border-crossing — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/border-crossing/wizard` | `apps/backend/src/border-crossing/border-crossing-wizard.routes.ts:211` | — | — | — |

### broker-profiles — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/broker-profiles` | `apps/backend/src/brokerupdate/brokerupdate.routes.ts:15` | — | — | — |

### broker-updates — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/broker-updates` | `apps/backend/src/brokerupdate/brokerupdate.routes.ts:70` | — | — | — |

### dashcam — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/dashcam/request-clip` | `apps/backend/src/telematics/dashcam-on-demand.routes.ts:43` | — | — | — |

### driver-teams — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/driver-teams` | `apps/backend/src/mdata/driver-team-split.routes.ts:87` | — | — | — |

### drivers — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/drivers/document-alerts/evaluate` | `apps/backend/src/drivers/document-alerts.routes.ts:113` | — | — | — |

### feed — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/feed/settlement-document/expenses` | `apps/backend/src/feed/seed-settlement-document.routes.ts:160` | — | — | — |

### forecast — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/forecast/cash-entries` | `apps/backend/src/forecast/cash-forecast-manual.routes.ts:116` | — | — | — |

### geocoding — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/geocoding/route-reference` | `apps/backend/src/integrations/google/route-reference.routes.ts:52` | — | — | — |

### lists — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/lists/force-qbo-sync` | `apps/backend/src/lists/lists-hub.routes.ts:147` | — | — | — |

### load-templates — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/load-templates` | `apps/backend/src/dispatch/dispatch-refinements.routes.ts:347` | — | — | — |

### mx-permits — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/mx-permits` | `apps/backend/src/mexico-ops/mx-permits.routes.ts:97` | — | — | — |

### mx-tolls — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/mx-tolls` | `apps/backend/src/mexico-ops/mx-tolls.routes.ts:116` | — | — | — |

### onboarding — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/onboarding/seed-sample-data` | `apps/backend/src/onboarding/state.routes.ts:234` | — | — | — |

### org — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/org/user-company-access` | `apps/backend/src/org/companies.routes.ts:167` | — | — | — |

### payroll — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/payroll/driver-settlements/compute` | `apps/backend/src/payroll/driver-settlement.routes.ts:26` | — | — | — |

### program — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/program/board/notes` | `apps/backend/src/program/program-board.routes.ts:28` | — | — | — |

### team-splits — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/team-splits/configs` | `apps/backend/src/settlements/team-splits/team-splits.routes.ts:248` | — | — | — |

### time-entries — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/time-entries` | `apps/backend/src/maintenance/labor.routes.ts:303` | — | — | — |

### usmca — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| create | `/api/v1/usmca/activation/transition` | `apps/backend/src/usmca/activation/activation.routes.ts:73` | — | — | — |

### abandonment-chargebacks — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/abandonment-chargebacks/:id/dispute` | `apps/backend/src/driver-finance/abandonment.routes.ts:138` | — | — | — |

### equipment-transfers — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/equipment-transfers/:id/confirm` | `apps/backend/src/mdata/equipment-transfer.routes.ts:117` | — | — | — |

### equipment — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/equipment/:id/initiate-transfer` | `apps/backend/src/mdata/equipment-transfer.routes.ts:90` | — | — | — |

### integrity — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/integrity/anomalies/:id/dismiss` | `apps/backend/src/integrity/anomaly-status.routes.ts:364` | — | — | — |

### liabilities — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/liabilities/:id/send-ack-request` | `apps/backend/src/liabilities/liabilities.routes.ts:199` | — | — | — |

### owner-approval — 1 create-surface(s)

| kind | endpoint | route file | created | registered | gap |
|---|---|---|---|---|---|
| nested | `/api/v1/owner-approval/:token/deny` | `apps/backend/src/driver-finance/owner-approval.routes.ts:54` | — | — | — |

## Known create-surface failures already proven live (2026-08-07)

| surface | live result | lane |
|---|---|---|
| `GET/POST /api/v1/catalogs/maintenance/services` | **404 — route not found** on the deployed API | CC-2 |
| fleet catalog create | **500** — reported as a trailing `--` SQL comment | CC-2 |
| payment-terms creator | **42701 duplicate column** | CC-2 / lists |
| `GET /api/v1/catalogs/fleet/tire-positions` | 200 `{rows:[],total:0}` — reachable, empty | — |
| `GET /api/v1/catalogs/maintenance/parts` | 200 with USMCA rows — reachable and populated | — |

