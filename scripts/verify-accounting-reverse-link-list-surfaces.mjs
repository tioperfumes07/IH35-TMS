#!/usr/bin/env node
/**
 * Accounting reverse_link remainder — leaf-specific Built for list/detail surfaces
 * that already drill via EntityLink. Honesty drops create-only modals/drawers elsewhere.
 *
 * @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(bill_payments\\.list|payments\\.receive|collections|factoring\\.list|je\\.list|audit_trail|accounting\\.panel\\.bill_detail|accounting\\.parity\\.(expenses_list_page|factoring_detail_page|receipts_page|vendor_credits_page))$","task":"VERTICAL-REVERSE-LINK-accounting-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-reverse-link-list-surfaces";
const AUDIT_TRAIL = "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx";
const POSTING_LINEAGE = "apps/frontend/src/pages/accounting/PostingLineagePage.tsx";
const JE_DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const AMORTIZATION = "apps/frontend/src/pages/finance/AmortizationPage.tsx";
const LEASE_DETAIL = "apps/frontend/src/pages/accounting/AccountingLeaseDetailPage.tsx";
const RECURRING_DETAIL = "apps/frontend/src/pages/accounting/AccountingRecurringTemplateDetailPage.tsx";
const RECURRING_ROUTE = "apps/backend/src/accounting/recurring-template-detail.routes.ts";
const PERIOD_CLOSE_DETAIL = "apps/frontend/src/pages/accounting/AccountingPeriodCloseDetailPage.tsx";
const PERIOD_CLOSE_ROUTE = "apps/backend/src/accounting/period-close-detail.routes.ts";
const SCHEDULE_DETAIL = "apps/frontend/src/pages/accounting/AccountingScheduleRowDetailPage.tsx";
const SCHEDULE_ROUTE = "apps/backend/src/accounting/schedule-row-detail.routes.ts";
const REIMBURSEMENT_DETAIL = "apps/frontend/src/pages/accounting/AccountingDriverReimbursementDetailPage.tsx";
const REIMBURSEMENT_ROUTE = "apps/backend/src/accounting/driver-reimbursement-detail.routes.ts";

const CHECKS = [
  { name: "BillPaymentsList EntityLink", file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", pattern: /EntityLink/ },
  { name: "ReceiptsPage EntityLink payment", file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", pattern: /EntityLink/ },
  { name: "CollectionsPage EntityLink", file: "apps/frontend/src/pages/accounting/CollectionsPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringListPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx", pattern: /EntityLink/ },
  { name: "ManualJEList EntityLink", file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx", pattern: /EntityLink/ },
  { name: "AuditTrail EntityLink", file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx", pattern: /EntityLink/ },
  { name: "AuditTrail bill-payment canonical kind", file: AUDIT_TRAIL, pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "AuditTrail driver-advance canonical drill", file: AUDIT_TRAIL, pattern: /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/ },
  { name: "AuditTrail transfer canonical drill", file: AUDIT_TRAIL, pattern: /case "transfer":\s*return "transfer";/ },
  { name: "Audit API bill-payment canonical kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "Audit API driver-advance canonical kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "driver_advance":\s*return "cash_advance";/ },
  { name: "Audit API transfer canonical kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "transfer":\s*return "transfer";/ },
  { name: "Audit API emits canonical source kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /source_entity_kind:\s*accountingSourceEntityKind/ },
  { name: "Audit client carries canonical source kind", file: "apps/frontend/src/api/accounting.ts", pattern: /export type AccountingAuditTrailEvent = \{[\s\S]*?source_transaction_type:\s*string \| null;\s*source_entity_kind:\s*string \| null;[\s\S]*?\n\};/ },
  { name: "Audit Trail consumes canonical source kind", file: AUDIT_TRAIL, pattern: /type=\{row\.source_entity_kind \?\? row\.source_transaction_type\}/ },
  { name: "Posting Lineage bill-payment canonical drill", file: POSTING_LINEAGE, pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "Posting Lineage driver-advance canonical drill", file: POSTING_LINEAGE, pattern: /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/ },
  { name: "Posting Lineage transfer canonical drill", file: POSTING_LINEAGE, pattern: /case "transfer":\s*return "transfer";/ },
  { name: "Lineage API emits canonical source kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /source_entity_kind:\s*accountingSourceEntityKind\(String\(row\.source_transaction_type/ },
  { name: "Lineage API emits canonical linked-object kind", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /linked_object_entity_kind:\s*accountingSourceEntityKind\(row\.linked_object_type/ },
  { name: "Lineage client carries canonical linked-object kind", file: "apps/frontend/src/api/accounting.ts", pattern: /export type AccountingSourceLineageRow = \{[\s\S]*?linked_object_type:\s*string \| null;\s*linked_object_entity_kind:\s*string \| null;/ },
  { name: "Posting Lineage consumes canonical linked-object kind", file: POSTING_LINEAGE, pattern: /type=\{row\.linked_object_entity_kind \?\? row\.linked_object_type\}/ },
  { name: "JE source API canonicalizes bill payment", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'bill_payment' THEN 'bill_payment'/ },
  { name: "JE source API canonicalizes driver advance", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'driver_advance' THEN 'cash_advance'/ },
  { name: "JE source client carries canonical kinds", file: "apps/frontend/src/api/accounting.ts", pattern: /export type JournalEntrySourceLink = \{[\s\S]*?source_entity_kind:\s*string \| null;[\s\S]*?linked_object_entity_kind:\s*string \| null;/ },
  { name: "JE detail bill-payment canonical drill", file: JE_DETAIL, pattern: /case "bill_payment":\s*return "bill_payment";/ },
  { name: "JE detail driver-advance canonical drill", file: JE_DETAIL, pattern: /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/ },
  { name: "JE detail consumes source canonical kind", file: JE_DETAIL, pattern: /type:\s*row\.source_entity_kind \?\? row\.source_transaction_type/ },
  { name: "JE detail consumes linked-object canonical kind", file: JE_DETAIL, pattern: /type:\s*row\.linked_object_entity_kind \?\? row\.linked_object_type/ },
  { name: "Audit API canonicalizes amortization", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "prepaid_asset":\s*case "prepaid_amortization":\s*return "prepaid_asset";/ },
  { name: "Audit API canonicalizes depreciation", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "fixed_asset":\s*case "fixed_asset_depreciation":\s*return "fixed_asset";/ },
  { name: "Audit Trail drills amortization", file: AUDIT_TRAIL, pattern: /case "prepaid_asset":\s*case "prepaid_amortization":\s*return "prepaid_asset";/ },
  { name: "Audit Trail drills depreciation", file: AUDIT_TRAIL, pattern: /case "fixed_asset":\s*case "fixed_asset_depreciation":\s*return "fixed_asset";/ },
  { name: "Posting Lineage drills amortization", file: POSTING_LINEAGE, pattern: /case "prepaid_asset":\s*case "prepaid_amortization":\s*return "prepaid_asset";/ },
  { name: "Posting Lineage drills depreciation", file: POSTING_LINEAGE, pattern: /case "fixed_asset":\s*case "fixed_asset_depreciation":\s*return "fixed_asset";/ },
  { name: "JE source API canonicalizes amortization", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type IN \('prepaid_asset', 'prepaid_amortization'\) THEN 'prepaid_asset'/ },
  { name: "JE source API canonicalizes depreciation", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type IN \('fixed_asset', 'fixed_asset_depreciation'\) THEN 'fixed_asset'/ },
  { name: "Audit API canonicalizes finance loan", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "loan":\s*return "finance_loan";/ },
  { name: "JE source API canonicalizes finance loan", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'loan' THEN 'finance_loan'/ },
  { name: "EntityLink owns finance-loan route", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "finance_loan":\s*return `\/finance\/amortization\?loan_id=\$\{id\}`;/ },
  { name: "Audit Trail drills finance loan", file: AUDIT_TRAIL, pattern: /case "loan":\s*case "finance_loan":\s*return "finance_loan";/ },
  { name: "Posting Lineage drills finance loan", file: POSTING_LINEAGE, pattern: /case "loan":\s*case "finance_loan":\s*return "finance_loan";/ },
  { name: "JE Detail drills finance loan", file: JE_DETAIL, pattern: /case "loan":\s*case "finance_loan":\s*return "finance_loan";/ },
  { name: "Amortization accepts finance-loan deep link", file: AMORTIZATION, pattern: /searchParams\.get\("loan_id"\)/ },
  { name: "Amortization scopes deep-linked schedule read", file: AMORTIZATION, pattern: /getLoanSchedule\(requestedLoanId, companyId\)/ },
  { name: "Amortization persists selected loan in URL", file: AMORTIZATION, pattern: /next\.set\("loan_id", id\)/ },
  { name: "Audit API canonicalizes lease contract", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "lease_contract":\s*return "lease_contract";/ },
  { name: "JE source API canonicalizes lease contract", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'lease_contract' THEN 'lease_contract'/ },
  { name: "EntityLink owns lease-contract route", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "lease_contract":\s*return `\/accounting\/leases\/\$\{id\}`;/ },
  { name: "Lease detail route mounted", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/leases\/:id"[\s\S]*?<AccountingLeaseDetailPage/ },
  { name: "Lease detail uses scoped exact reader", file: LEASE_DETAIL, pattern: /getAccountingLeaseDetail\(id, companyId\)/ },
  { name: "Lease detail drills fixed asset", file: LEASE_DETAIL, pattern: /kind="fixed_asset" id=\{row\.fixed_asset_id\}/ },
  { name: "Lease detail drills unit", file: LEASE_DETAIL, pattern: /kind="unit" id=\{row\.unit_uuid\}/ },
  { name: "Lease detail drills journal entries", file: LEASE_DETAIL, pattern: /kind="journal_entry"/ },
  { name: "Lease backend resolves human asset labels", file: "apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts", pattern: /fa\.asset_number, fa\.name AS fixed_asset_name, u\.unit_number/ },
  { name: "Lease backend scopes fixed-asset join", file: "apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts", pattern: /fa\.id = lal\.fixed_asset_id AND fa\.operating_company_id = lal\.operating_company_id/ },
  { name: "Lease backend scopes unit join", file: "apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts", pattern: /u\.id = lal\.unit_uuid AND u\.operating_company_id = lal\.operating_company_id/ },
  { name: "Audit API canonicalizes recurring template", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "recurring_template":\s*return "recurring_template";/ },
  { name: "JE source API canonicalizes recurring template", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'recurring_template' THEN 'recurring_template'/ },
  { name: "EntityLink owns recurring-template route", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "recurring_template":\s*return `\/accounting\/recurring-templates\/\$\{id\}`;/ },
  { name: "Recurring template detail route mounted", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/recurring-templates\/:id"[\s\S]*?<AccountingRecurringTemplateDetailPage/ },
  { name: "Recurring template backend route mounted", file: "apps/backend/src/index.ts", pattern: /await registerRecurringTemplateDetailRoutes\(app\)/ },
  { name: "Recurring template detail uses scoped exact reader", file: RECURRING_DETAIL, pattern: /getAccountingRecurringTemplate\(id, companyId\)/ },
  { name: "Recurring template backend explicitly scopes company and id", file: RECURRING_ROUTE, pattern: /WHERE rt\.operating_company_id = \$1::uuid AND rt\.id = \$2::uuid/ },
  { name: "Recurring template backend verifies membership", file: RECURRING_ROUTE, pattern: /assertCompanyMembership\(user\.uuid, opco\)/ },
  { name: "Recurring template is read-only", file: RECURRING_ROUTE, pattern: /app\.get\("\/api\/v1\/accounting\/recurring-templates\/:id"/ },
  { name: "Audit Trail drills recurring template", file: AUDIT_TRAIL, pattern: /case "recurring_template":\s*return "recurring_template";/ },
  { name: "Posting Lineage drills recurring template", file: POSTING_LINEAGE, pattern: /case "recurring_template":\s*return "recurring_template";/ },
  { name: "JE Detail drills recurring template", file: JE_DETAIL, pattern: /case "recurring_template":\s*return "recurring_template";/ },
  { name: "Audit API canonicalizes period close", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "period_close":\s*return "period_close";/ },
  { name: "JE source API canonicalizes period close", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'period_close' THEN 'period_close'/ },
  { name: "EntityLink owns fiscal-year close route", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "period_close":\s*return `\/accounting\/period-closes\/\$\{encodeURIComponent\(id\)\}`;/ },
  { name: "Fiscal-year close detail route mounted", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/period-closes\/:fiscalYearId"[\s\S]*?<AccountingPeriodCloseDetailPage/ },
  { name: "Fiscal-year close backend route mounted", file: "apps/backend/src/index.ts", pattern: /await registerPeriodCloseDetailRoutes\(app\)/ },
  { name: "Fiscal-year close detail uses scoped exact reader", file: PERIOD_CLOSE_DETAIL, pattern: /getAccountingPeriodClose\(fiscalYearId, companyId\)/ },
  { name: "Fiscal-year close backend validates stored identifier", file: PERIOD_CLOSE_ROUTE, pattern: /fiscal_year_id: z\.string\(\)\.regex\(\/\^FY\\d\{4\}\$\/\)/ },
  { name: "Fiscal-year close backend explicitly scopes source link", file: PERIOD_CLOSE_ROUTE, pattern: /tsl\.operating_company_id = \$1::uuid[\s\S]*?tsl\.linked_object_type = 'period_close'[\s\S]*?tsl\.linked_object_id = \$2/ },
  { name: "Fiscal-year close backend scopes posting join", file: PERIOD_CLOSE_ROUTE, pattern: /jep\.id = tsl\.journal_entry_posting_id[\s\S]*?jep\.operating_company_id = tsl\.operating_company_id/ },
  { name: "Fiscal-year close detail drills journal entry", file: PERIOD_CLOSE_DETAIL, pattern: /kind="journal_entry" id=\{row\.journal_entry_id\}/ },
  { name: "Audit Trail drills period close", file: AUDIT_TRAIL, pattern: /case "period_close":\s*return "period_close";/ },
  { name: "Posting Lineage drills period close", file: POSTING_LINEAGE, pattern: /case "period_close":\s*return "period_close";/ },
  { name: "JE Detail drills period close", file: JE_DETAIL, pattern: /case "period_close":\s*return "period_close";/ },
  { name: "Schedule-row EntityLink kinds exist", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "prepaid_amortization_row":\s*case "depreciation_schedule_row":\s*case "loan_amortization_row":\s*return `\/accounting\/schedule-rows\/\$\{kind\}\/\$\{id\}`;/ },
  { name: "Schedule-row detail route mounted", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/schedule-rows\/:kind\/:id"[\s\S]*?<AccountingScheduleRowDetailPage/ },
  { name: "Schedule-row backend route mounted", file: "apps/backend/src/index.ts", pattern: /await registerScheduleRowDetailRoutes\(app\)/ },
  { name: "Schedule-row reader kind whitelist", file: SCHEDULE_ROUTE, pattern: /z\.enum\(\["prepaid_amortization_row", "depreciation_schedule_row", "loan_amortization_row"\]\)/ },
  { name: "Prepaid row read explicitly company scoped", file: SCHEDULE_ROUTE, pattern: /FROM accounting\.prepaid_amortization_rows r[\s\S]*?r\.operating_company_id = \$1::uuid AND r\.id = \$2::uuid/ },
  { name: "Depreciation row read explicitly company scoped", file: SCHEDULE_ROUTE, pattern: /FROM accounting\.depreciation_schedule_rows r[\s\S]*?r\.operating_company_id = \$1::uuid AND r\.id = \$2::uuid/ },
  { name: "Loan row read explicitly company scoped", file: SCHEDULE_ROUTE, pattern: /FROM finance\.loan_amortization_rows r[\s\S]*?r\.operating_company_id = \$1::uuid AND r\.id = \$2::uuid/ },
  { name: "Schedule row drills parent", file: SCHEDULE_DETAIL, pattern: /<EntityLink kind=\{row\.parent_kind\} id=\{row\.parent_id\}/ },
  { name: "Schedule row drills posted JE", file: SCHEDULE_DETAIL, pattern: /kind="journal_entry" id=\{row\.posted_journal_entry_id\}/ },
  { name: "Audit Trail drills all schedule rows", file: AUDIT_TRAIL, pattern: /case "prepaid_amortization_row":\s*case "depreciation_schedule_row":\s*case "loan_amortization_row":\s*return t;/ },
  { name: "Posting Lineage drills all schedule rows", file: POSTING_LINEAGE, pattern: /case "prepaid_amortization_row":\s*case "depreciation_schedule_row":\s*case "loan_amortization_row":\s*return t;/ },
  { name: "JE Detail drills all schedule rows", file: JE_DETAIL, pattern: /case "prepaid_amortization_row":\s*case "depreciation_schedule_row":\s*case "loan_amortization_row":\s*return t;/ },
  { name: "Factoring lifecycle writer stores advance id", file: "apps/backend/src/accounting/factoring-posting/lifecycle-repair.ts", pattern: /SET source_transaction_type = \$3,[\s\S]*?source_transaction_id = \$4[\s\S]*?opts\.factoring_advance_id/ },
  { name: "Audit API canonicalizes factoring lifecycle", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "factoring_customer_payment":\s*case "factoring_chargeback":\s*case "factoring_reserve_release":\s*case "factoring_default_interest":\s*return "factoring_advance";/ },
  { name: "JE source API canonicalizes factoring lifecycle", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type IN \('factoring_customer_payment', 'factoring_chargeback', 'factoring_reserve_release', 'factoring_default_interest'\) THEN 'factoring_advance'/ },
  { name: "Audit Trail drills factoring lifecycle", file: AUDIT_TRAIL, pattern: /case "factoring_customer_payment":\s*case "factoring_chargeback":\s*case "factoring_reserve_release":\s*case "factoring_default_interest":\s*return "factoring_advance";/ },
  { name: "Posting Lineage drills factoring lifecycle", file: POSTING_LINEAGE, pattern: /case "factoring_customer_payment":\s*case "factoring_chargeback":\s*case "factoring_reserve_release":\s*case "factoring_default_interest":\s*return "factoring_advance";/ },
  { name: "JE Detail drills factoring lifecycle", file: JE_DETAIL, pattern: /case "factoring_customer_payment":\s*case "factoring_chargeback":\s*case "factoring_reserve_release":\s*case "factoring_default_interest":\s*return "factoring_advance";/ },
  { name: "Loan-payment writer stores loan id", file: "apps/backend/src/accounting/finance-hub-amortization-posting/loan-payment-posting.service.ts", pattern: /sourceTransactionType: "loan_payment",\s*sourceTransactionId: input\.loanId/ },
  { name: "Prepaid-purchase writer stores asset id", file: "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts", pattern: /sourceTransactionType: "prepaid_purchase",\s*sourceTransactionId: input\.assetId/ },
  { name: "Audit API canonicalizes loan payment", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "loan_payment":\s*return "finance_loan";/ },
  { name: "Audit API canonicalizes prepaid purchase", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "prepaid_purchase":\s*return "prepaid_asset";/ },
  { name: "JE source API canonicalizes loan payment", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'loan_payment' THEN 'finance_loan'/ },
  { name: "JE source API canonicalizes prepaid purchase", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'prepaid_purchase' THEN 'prepaid_asset'/ },
  { name: "Audit Trail drills parent lifecycle", file: AUDIT_TRAIL, pattern: /case "loan_payment":\s*return "finance_loan";\s*case "prepaid_purchase":\s*return "prepaid_asset";/ },
  { name: "Posting Lineage drills parent lifecycle", file: POSTING_LINEAGE, pattern: /case "loan_payment":\s*return "finance_loan";\s*case "prepaid_purchase":\s*return "prepaid_asset";/ },
  { name: "JE Detail drills parent lifecycle", file: JE_DETAIL, pattern: /case "loan_payment":\s*return "finance_loan";\s*case "prepaid_purchase":\s*return "prepaid_asset";/ },
  { name: "Fuel poster stores canonical transaction id", file: "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts", pattern: /fuel_event_id: candidate\.fuel_transaction_id/ },
  { name: "Fuel reader accepts exact transaction id", file: "apps/backend/src/fuel/fuel-transactions.routes.ts", pattern: /transaction_id: z\.string\(\)\.uuid\(\)\.optional\(\)/ },
  { name: "Fuel reader scopes exact id with company", file: "apps/backend/src/fuel/fuel-transactions.routes.ts", pattern: /filters: string\[\] = \["ft\.operating_company_id = \$1::uuid"[\s\S]*?filters\.push\(`ft\.id = \$\$\{values\.length\}::uuid`\)/ },
  { name: "Fuel API sends exact transaction id", file: "apps/frontend/src/api/fuelPlanner.ts", pattern: /if \(params\.transaction_id\) search\.set\("transaction_id", params\.transaction_id\)/ },
  { name: "Fuel History reads accounting deep link", file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", pattern: /deepLinkTransactionId = searchParams\.get\("transaction_id"\)/ },
  { name: "Fuel History queries exact transaction", file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", pattern: /transaction_id: deepLinkTransactionId/ },
  { name: "EntityLink owns fuel transaction route", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "fuel_transaction":\s*return `\/fuel\/history\?transaction_id=\$\{id\}`;/ },
  { name: "Audit API canonicalizes fuel event", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "fuel_event":\s*return "fuel_transaction";/ },
  { name: "Audit API resolves scoped fuel label", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /FROM fuel\.fuel_transactions ft[\s\S]*?ft\.id::text = jp\.source_transaction_id[\s\S]*?ft\.operating_company_id = jp\.operating_company_id/ },
  { name: "JE source API canonicalizes fuel event", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'fuel_event' THEN 'fuel_transaction'/ },
  { name: "JE linked API canonicalizes fuel event", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /tsl\.linked_object_type = 'fuel_event' THEN 'fuel_transaction'/ },
  { name: "JE source API resolves scoped fuel label", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /FROM fuel\.fuel_transactions ft[\s\S]*?ft\.id::text = jep\.source_transaction_id[\s\S]*?ft\.operating_company_id = \$2::uuid/ },
  { name: "Audit Trail drills fuel event", file: AUDIT_TRAIL, pattern: /case "fuel_event":\s*return "fuel_transaction";/ },
  { name: "Posting Lineage drills fuel event", file: POSTING_LINEAGE, pattern: /case "fuel_event":\s*return "fuel_transaction";/ },
  { name: "JE Detail drills fuel event", file: JE_DETAIL, pattern: /case "fuel_event":\s*return "fuel_transaction";/ },
  { name: "Reimbursement writer stores canonical reimbursement id", file: "apps/backend/src/driver-finance/driver-reimbursement.service.ts", pattern: /source_transaction_type: "driver_reimbursement",\s*source_transaction_id: input\.reimbursement_id/ },
  { name: "EntityLink owns reimbursement route", file: "apps/frontend/src/components/shared/EntityLink.tsx", pattern: /case "driver_reimbursement":\s*return `\/accounting\/driver-reimbursements\/\$\{id\}`;/ },
  { name: "Reimbursement frontend route mounted", file: "apps/frontend/src/routes/manifest.tsx", pattern: /path="\/accounting\/driver-reimbursements\/:id"[\s\S]*?<AccountingDriverReimbursementDetailPage/ },
  { name: "Reimbursement backend route mounted", file: "apps/backend/src/index.ts", pattern: /await registerDriverReimbursementDetailRoutes\(app\)/ },
  { name: "Reimbursement exact reader scopes company and id", file: REIMBURSEMENT_ROUTE, pattern: /WHERE r\.operating_company_id = \$1::uuid AND r\.id = \$2::uuid/ },
  { name: "Reimbursement reader verifies membership", file: REIMBURSEMENT_ROUTE, pattern: /assertCompanyMembership\(user\.uuid, opco\)/ },
  { name: "Reimbursement reader scopes driver join", file: REIMBURSEMENT_ROUTE, pattern: /d\.id = r\.driver_id AND d\.operating_company_id = r\.operating_company_id/ },
  { name: "Reimbursement detail drills driver", file: REIMBURSEMENT_DETAIL, pattern: /kind="driver" id=\{row\.driver_id\}/ },
  { name: "Reimbursement detail drills load", file: REIMBURSEMENT_DETAIL, pattern: /kind="load" id=\{row\.load_id\}/ },
  { name: "Reimbursement detail drills settlement", file: REIMBURSEMENT_DETAIL, pattern: /kind="settlement" id=\{row\.applied_to_settlement_id\}/ },
  { name: "Reimbursement detail drills JE", file: REIMBURSEMENT_DETAIL, pattern: /kind="journal_entry" id=\{row\.journal_entry_id\}/ },
  { name: "Audit API canonicalizes reimbursement", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /case "driver_reimbursement":\s*return "driver_reimbursement";/ },
  { name: "Audit API resolves scoped reimbursement label", file: "apps/backend/src/accounting/audit-trail/service.ts", pattern: /FROM driver_finance\.driver_reimbursements r[\s\S]*?r\.id::text = jp\.source_transaction_id[\s\S]*?r\.operating_company_id = jp\.operating_company_id/ },
  { name: "JE API canonicalizes reimbursement", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /jep\.source_transaction_type = 'driver_reimbursement' THEN 'driver_reimbursement'/ },
  { name: "JE API resolves scoped reimbursement label", file: "apps/backend/src/accounting/journal-entries.service.ts", pattern: /FROM driver_finance\.driver_reimbursements r[\s\S]*?r\.id::text = jep\.source_transaction_id[\s\S]*?r\.operating_company_id = \$2::uuid/ },
  { name: "Audit Trail drills reimbursement", file: AUDIT_TRAIL, pattern: /case "driver_reimbursement":\s*return "driver_reimbursement";/ },
  { name: "Posting Lineage drills reimbursement", file: POSTING_LINEAGE, pattern: /case "driver_reimbursement":\s*return "driver_reimbursement";/ },
  { name: "JE Detail drills reimbursement", file: JE_DETAIL, pattern: /case "driver_reimbursement":\s*return "driver_reimbursement";/ },
  { name: "JE Detail amount uses canonical money formatter", file: JE_DETAIL, pattern: /render: \(posting\) => formatUsdCents\(posting\.amount_cents\)/ },
  { name: "BillDetailPanel EntityLink", file: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx", pattern: /EntityLink/ },
  { name: "ExpensesListPage EntityLink", file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringDetailPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx", pattern: /EntityLink/ },
  { name: "VendorCreditsPage EntityLink", file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx", pattern: /EntityLink/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink in ${c.file}`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".acct-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  const auditTrail = fs.readFileSync(path.join(ROOT, AUDIT_TRAIL), "utf8");
  const wrongApRoute = auditTrail.replace(/case "bill_payment":\s*return "bill_payment";/, 'case "bill_payment":\n      return "payment";');
  if (/case "bill_payment":\s*return "bill_payment";/.test(wrongApRoute)) {
    console.error(`${LABEL} SELFTEST FAIL — bill-payment wrong-route mutation stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — bill-payment wrong-route mutation red`);
  const deadAdvanceDrill = auditTrail.replace(/case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/, 'case "cash_advance":\n      return "cash_advance";');
  if (/case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/.test(deadAdvanceDrill)) {
    console.error(`${LABEL} SELFTEST FAIL — driver-advance dead-drill mutation stayed green`);
    process.exit(1);
  }
  const deadTransferDrill = auditTrail.replace(/case "transfer":\s*return "transfer";/, "");
  if (/case "transfer":\s*return "transfer";/.test(deadTransferDrill)) {
    console.error(`${LABEL} SELFTEST FAIL — transfer dead-drill mutation stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — driver-advance and transfer dead-drill mutations red`);
  const postingLineage = fs.readFileSync(path.join(ROOT, POSTING_LINEAGE), "utf8");
  const wrongLineageBillRoute = postingLineage.replace(/case "bill_payment":\s*return "bill_payment";/, 'case "bill_payment":\n      return "payment";');
  const deadLineageAdvance = postingLineage.replace(/case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/, 'case "cash_advance":\n      return "cash_advance";');
  const deadLineageTransfer = postingLineage.replace(/case "transfer":\s*return "transfer";/, "");
  if (/case "bill_payment":\s*return "bill_payment";/.test(wrongLineageBillRoute)
    || /case "driver_advance":\s*case "cash_advance":\s*return "cash_advance";/.test(deadLineageAdvance)
    || /case "transfer":\s*return "transfer";/.test(deadLineageTransfer)) {
    console.error(`${LABEL} SELFTEST FAIL — Posting Lineage wrong/dead-route mutation stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — Posting Lineage wrong/dead-route mutations red`);
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting reverse_link list surfaces ratcheted`);
