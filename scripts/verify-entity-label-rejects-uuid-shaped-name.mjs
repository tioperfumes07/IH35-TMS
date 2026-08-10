#!/usr/bin/env node
/**
 * CLS-UUID-LABEL / LV-BILLS-VENDOR-UUID — entityLabel must not treat a UUID string as a display name.
 *
 * When list APIs fall back to `vendor_name: vendor_id`, FE used to paint the raw UUID in the Bills
 * Vendor column (`bill.vendor_name || bill.vendor_id`). entityLabel is the shared helper; rejecting
 * uuid-shaped "names" closes the class at the choke point. Batch-2 drains sibling name||id sites.
 *
 *   node scripts/verify-entity-label-rejects-uuid-shaped-name.mjs
 *   node scripts/verify-entity-label-rejects-uuid-shaped-name.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-entity-label-rejects-uuid-shaped-name";
const TARGET = "apps/frontend/src/lib/entity-label.ts";
const BILLS = "apps/frontend/src/pages/accounting/BillsPage.tsx";

/** Batch-2/3 drain sites — name||id / name??id paints (CLS-UUID-LABEL). */
const SIBLINGS = [
  {
    rel: "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx",
    bad: /driver_name\?\.trim\(\)\s*\|\|\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx",
    bad: /primary_driver_name\s*\|\|\s*row\.primary_driver_id/,
    good: /entityLabel\(\s*row\.primary_driver_name\s*,\s*row\.primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    bad: /lender_vendor_name\s*\|\|\s*row\.lender_vendor_id/,
    good: /entityLabel\(\s*row\.lender_vendor_name\s*,\s*row\.lender_vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
    bad: /detail\.driver_name\s*\?\?\s*detail\.driver_id|row\.driver_name\s*\?\?\s*row\.driver_id/,
    good: /entityLabel\(\s*(?:detail|row)\.driver_name\s*,\s*(?:detail|row)\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/Drivers.tsx",
    bad: /primary_driver_name\s*\?\?\s*row\.primary_driver_id|co_driver_name\s*\?\?\s*row\.secondary_driver_id/,
    good: /entityLabel\(\s*row\.primary_driver_name\s*,\s*row\.primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    bad: /bill\.driver_name\s*\?\?\s*bill\.driver_id/,
    good: /entityLabel\(\s*bill\.driver_name\s*,\s*bill\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
    bad: /selectedPending\.driver_name\s*\?\?\s*selectedPending\.driver_id/,
    good: /entityLabel\(\s*selectedPending\.driver_name\s*,\s*selectedPending\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
    bad: /row\.driver_name\s*\?\?\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
    bad: /let driverLabel = row\.driver_id/,
    good: /let driverLabel = entityLabel\(\s*null\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    bad: /invoice\.customer_name\s*\?\?\s*invoice\.customer_id/,
    good: /entityLabel\(\s*invoice\.customer_name\s*,\s*invoice\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    bad: /label=\{row\.customer_name\s*\?\?\s*row\.customer_id\}/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    bad: /label=\{row\.vendor_name\s*\?\?\s*row\.vendor_id\}/,
    good: /entityLabel\(\s*row\.vendor_name\s*,\s*row\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx",
    bad: /r\.counterparty_name\s*\?\?\s*r\.counterparty_id|r\.account_name\s*\?\?\s*r\.account_id/,
    good: /entityLabel\(\s*r\.account_name\s*,\s*r\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
    bad: /row\.vendor_name\s*\?\?\s*row\.vendor_id/,
    good: /entityLabel\(\s*row\.vendor_name\s*,\s*row\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
    bad: /row\.driver_name\s*\?\?\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
    bad: /row\.driver_name\s*\?\?\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/SalesTaxPage.tsx",
    bad: /row\.agency_name\s*\?\?\s*row\.agency_id/,
    good: /entityLabel\(\s*row\.agency_name\s*,\s*row\.agency_id\s*,\s*"Agency"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/bill-payments/CCPaymentModal.tsx",
    bad: /bill\.vendor_name\s*\?\?\s*bill\.vendor_id/,
    good: /entityLabel\(\s*bill\.vendor_name\s*,\s*bill\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/ExpenseCategoryMapPage.tsx",
    bad: /row\.account_name\s*\?\?\s*row\.account_id/,
    good: /entityLabel\(\s*row\.account_name\s*,\s*row\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /row\.ps_category_name\s*\|\|\s*row\.ps_category_id|row\.ps_item_name\s*\|\|\s*row\.ps_item_id/,
    good: /entityLabel\(\s*row\.ps_category_name\s*,\s*row\.ps_category_id\s*,\s*"Category"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx",
    bad: /row\.actor_name\s*\?\?\s*row\.actor_user_id/,
    good: /entityLabel\(\s*row\.actor_name\s*,\s*row\.actor_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/PayrollAggregatedPage.tsx",
    bad: /row\.qbo_payroll_run_name\s*\?\?\s*row\.qbo_payroll_run_id/,
    good: /entityLabel\(\s*row\.qbo_payroll_run_name\s*,\s*row\.qbo_payroll_run_id\s*,\s*"Payroll run"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/qbo/VendorLinkageModal.tsx",
    bad: /row\.company_name\s*\?\?\s*row\.qbo_vendor_id/,
    good: /entityLabel\(\s*row\.company_name\s*,\s*row\.qbo_vendor_id\s*,\s*"QBO vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /links\.vendor_name\s*\|\|\s*"Vendor"|links\.customer_name\s*\|\|\s*"Customer"/,
    good: /entityLabel\(\s*links\.vendor_name\s*,\s*links\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    bad: /line\.income_account_name\s*\?\?\s*line\.account_id/,
    good: /entityLabel\(\s*line\.income_account_name\s*,\s*line\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    bad: /line\.load_number\s*\?\?\s*line\.load_id/,
    good: /entityLabel\(\s*line\.load_number\s*,\s*line\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
    bad: /row\.unit_display_id\s*\?\?\s*row\.unit_id/,
    good: /entityLabel\(\s*row\.unit_display_id\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /row\.asset_unit_code\s*\|\|\s*row\.asset_id/,
    good: /entityLabel\(\s*row\.asset_unit_code\s*,\s*row\.asset_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    bad: /bill\.load_number\s*\?\?\s*bill\.load_id/,
    good: /entityLabel\(\s*bill\.load_number\s*,\s*bill\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx",
    bad: /selected\.load_number\s*\?\?\s*selected\.load_id/,
    good: /entityLabel\(\s*selected\.load_number\s*,\s*selected\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/Documents.tsx",
    bad: /row\.uploader_email\s*\?\?\s*row\.uploader_user_id/,
    good: /formatEntityLabel\(\s*row\.uploader_email\s*,\s*row\.uploader_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/tasks/TasksReportPage.tsx",
    bad: /assigned_to_name\s*\?\?\s*t\.assigned_to_email\s*\?\?\s*t\.assigned_to_user_id/,
    good: /entityLabel\(\s*task\.assigned_to_name\s*\|\|\s*task\.assigned_to_email\s*,\s*task\.assigned_to_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx",
    bad: /assigned_to_name\s*\?\?\s*t\.assigned_to_email\s*\?\?\s*t\.assigned_to_user_id/,
    good: /entityLabel\(\s*t\.assigned_to_name\s*\|\|\s*t\.assigned_to_email\s*,\s*t\.assigned_to_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/DriverDetail.tsx",
    bad: /created_by_user_email\s*\|\|\s*item\.created_by_user_id|voided_by_user_email\s*\|\|\s*event\.voided_by_user_id/,
    good: /entityLabel\(\s*item\.created_by_user_email\s*,\s*item\.created_by_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/ReserveDashboard.tsx",
    bad: /factorNameById\.get\(balance\.factor_id\)\s*\?\?\s*balance\.factor_id/,
    good: /entityLabel\(\s*factorNameById\.get\(balance\.factor_id\)\s*,\s*balance\.factor_id\s*,\s*"Factor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx",
    bad: /assigned_to_email\s*\|\|\s*task\.assigned_to_user_id/,
    good: /entityLabel\(\s*task\.assigned_to_email\s*,\s*task\.assigned_to_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx",
    bad: /unit_number\s*\?\?\s*def\.unit_id|load\.load_number\s*\?\?\s*load\.load_id/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx",
    bad: /work_order_display_id\s*\?\?\s*row\.work_order_id/,
    good: /entityLabel\(\s*row\.work_order_display_id\s*,\s*row\.work_order_id\s*,\s*"Order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/PositionHistoryPage.tsx",
    bad: /unit_number\s*\?\?\s*row\.unit_id|unit_number\?\.trim\(\)\s*\|\|\s*"Unit"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
    bad: /actor_email\s*\?\?\s*e\.actor_user_id|actor_email\s*\?\?\s*row\.actor_user_id/,
    good: /entityLabel\(\s*row\.actor_email\s*,\s*row\.actor_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx",
    bad: /actor_email\s*\?\?\s*row\.actor_user_id/,
    good: /entityLabel\(\s*row\.actor_email\s*,\s*row\.actor_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/UserDetail.tsx",
    bad: /voided_by_user_email\s*\?\?\s*event\.voided_by_user_id/,
    good: /entityLabel\(\s*event\.voided_by_user_email\s*,\s*event\.voided_by_user_id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
    bad: /billLabel=\{row\.bill_number\s*\?\?\s*row\.bill_id\}/,
    good: /entityLabel\(\s*row\.bill_number\s*,\s*row\.bill_id\s*,\s*"Bill"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx",
    bad: /settlement_display_id\s*\?\?\s*row\.settlement_id/,
    good: /entityLabel\(\s*row\.settlement_display_id\s*,\s*row\.settlement_id\s*,\s*"Settlement"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
    bad: /linked_bill_display_id\s*\?\?\s*advance\.linked_bill_id/,
    good: /entityLabel\(\s*advance\.linked_bill_display_id\s*,\s*advance\.linked_bill_id\s*,\s*"Bill"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/BankReconciliationPage.tsx",
    bad: /reference_no\s*\?\?\s*entry\.journal_entry_id/,
    good: /entityLabel\(\s*entry\.reference_no\s*,\s*entry\.journal_entry_id\s*,\s*"Journal entry"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    bad: /load_number\s*\?\?\s*issue\.load_id/,
    good: /entityLabel\(\s*issue\.load_number\s*,\s*issue\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
    bad: /load_number\s*\?\?\s*row\.load_id/,
    good: /entityLabel\(\s*row\.load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/drivers/LoadHistoryTab.tsx",
    bad: /load_number\s*\?\?\s*row\.load_id/,
    good: /entityLabel\(\s*row\.load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
    bad: /unit_number\s*\?\?\s*row\.unit_id|unit_number\s*\?\?\s*undefined|label=\{row\.display_id\s*\?\?\s*undefined\}/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx",
    bad: /account_number\s*\?\?\s*entry\.qbo_id/,
    good: /entityLabel\(\s*entry\.account_number\s*,\s*entry\.id\s*\?\?\s*entry\.qbo_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    bad: /display_id\s*\?\?\s*invoice\.id/,
    good: /entityLabel\(\s*invoice\.display_id\s*,\s*invoice\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
    bad: /display_id\s*\?\?\s*"—"|label=\{row\.display_id\s*\?\?/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Settlement"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx",
    bad: /driver_display_id\s*\?\?\s*settlement\.id/,
    good: /entityLabel\(\s*settlement\.display_id\s*,\s*settlement\.id\s*,\s*"Settlement"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    bad: /factoring_display_id\s*\?\?\s*"a factoring batch"/,
    good: /entityLabel\(\s*invoice\.factoring_display_id\s*,\s*invoice\.factoring_advance_id\s*,\s*"Factoring batch"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /categorization_unit_number\s*\|\|\s*"Unit"|categorization_load_number\s*\|\|\s*"Trip"/,
    good: /entityLabel\(\s*tx\.categorization_unit_number\s*,\s*tx\.categorization_unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /links\.driver_name\s*\|\|\s*"Driver"|draft\.driverName\s*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*links\.driver_name\s*,\s*links\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx",
    bad: /row\.display_id\s*\?\?\s*row\.id/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleDetailPage.tsx",
    bad: /wo\?\.display_id\s*\?\?\s*id/,
    good: /entityLabel\(\s*wo\?\.display_id\s*,\s*id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx",
    bad: /display_id\s*\?\?\s*payload\.wo\.id|card\.unit_number\}|card\.driver_name\s*\?\?\s*"Unassigned"|label=\{card\.load_display_id\}/,
    good: /entityLabel\(\s*card\.load_display_id\s*,\s*card\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/BankReconciliationPage.tsx",
    bad: /account\.account_name\s*\?\?\s*account\.id/,
    good: /entityLabel\(\s*account\.account_name\s*,\s*account\.id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx",
    bad: /row\.driver_name\s*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
    bad: /driver_full_name\s*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*settlement\.driver_full_name\s*,\s*settlement\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
    bad: /driverName\s*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*driverName\s*,\s*id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx",
    bad: /unit_number\?\.trim\(\)\s*\|\|\s*"Unit"/,
    good: /entityLabel\(\s*event\.unit_number\s*,\s*event\.vehicle_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/Documents.tsx",
    bad: /entry\.email\s*\?\?\s*entry\.id/,
    good: /entityLabel\(\s*entry\.email\s*,\s*entry\.id\s*,\s*"User"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
    bad: /driver_name.*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*\(row\.driver_name as string \| undefined\)\?\.trim\(\)\s*,\s*String\(row\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    bad: /driver_name.*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*\(row\.driver_name as string \| undefined\)\?\.trim\(\)\s*,\s*String\(row\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
    bad: /subject_driver_name.*\|\|\s*"Driver"|subject_unit_number.*\|\|\s*"Unit"/,
    good: /entityLabel\(\s*row\.subject_driver_name\s*,\s*id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/AccidentsPage.tsx",
    bad: /driver_name.*\|\|\s*"Driver"|unit_number.*\|\|\s*"Unit"|load_number.*\|\|\s*"Load"/,
    good: /entityLabel\(\s*\(row\.driver_name as string \| undefined\)\?\.trim\(\)\s*,\s*row\.driver_id as string \| undefined\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx",
    bad: /driver_name\?\.trim\(\)\s*\|\|\s*"Driver"/,
    good: /entityLabel\(\s*enrollment\.driver_name\?\.trim\(\)\s*,\s*enrollment\.driver_uuid\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    bad: /unit_display_id\s*\?\?\s*undefined|driver_display_name\s*\?\?\s*undefined|load_display_id\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*claim\.unit_display_id\s*,\s*claim\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/maintenance/DriverWorkOrdersReverseSection.tsx",
    bad: /display_id\s*\?\?\s*wo\.description\s*\?\?\s*id/,
    good: /entityLabel\(\s*wo\.display_id\s*\?\?\s*wo\.description\s*,\s*id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
    bad: /work_order_display_id\s*\?\?\s*"Work order|unit_number\s*\?\?\s*"Unit|vendor_name\s*\?\?\s*"Vendor"/,
    good: /entityLabel\(\s*row\.work_order_display_id\s*,\s*row\.work_order_id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
    bad: /related_unit_number.*\|\|\s*"Unit"|related_load_number.*\|\|\s*"Load"/,
    good: /entityLabel\(\s*fine\.related_unit_number\s*,\s*String\(fine\.related_unit_id\)\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx",
    bad: /unit_number\s*\?\?\s*undefined|driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/BankAccountVisibilityPage.tsx",
    bad: /account\.account_name\s*\?\?\s*account\.display_name\s*\?\?\s*account\.id/,
    good: /entityLabel\(\s*account\.account_name\s*\?\?\s*account\.display_name\s*,\s*account\.id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx",
    bad: /customer_name\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*event\.customer_name\s*,\s*event\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
    bad: /linked_load_number\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.linked_load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    bad: /driver_name.*\|\|\s*undefined|load_number.*\?\?\s*undefined|trailer_number.*\|\|\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
    bad: /invoice_display_id\s*\?\?\s*"Invoice"/,
    good: /entityLabel\(\s*row\.invoice_display_id\s*,\s*row\.invoice_id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx",
    bad: /label=\{issue\.load_display_id\s*\?\?\s*undefined\}|label=\{issue\.driver_full_name\s*\|\|\s*undefined\}/,
    good: /entityLabel\(\s*issue\.unit_display_id\s*,\s*issue\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx",
    bad: /label=\{card\.driver_name\s*\?\?\s*undefined\}|\{card\.unit_number\}\s*<\/Link>|\{card\.load_display_id\}\s*<\/Link>/,
    good: /entityLabel\(\s*card\.unit_number\s*,\s*card\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx",
    bad: /vendor_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.vendor_name\s*,\s*row\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /String\(suggestion\.id\s*\?\?\s*""\)/,
    good: /entityLabel\(\s*suggestion\.description\s*,\s*suggestion\.id\s*,\s*"Transaction"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/AccidentsPage.tsx",
    bad: /vendor_name.*\|\|\s*"Vendor"/,
    good: /entityLabel\(\s*\(row\.vendor_name as string \| undefined\)\?\.trim\(\)\s*,\s*row\.vendor_id as string \| undefined\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    bad: /unit_number.*\|\|\s*"Unit"/,
    good: /entityLabel\(\s*\(row\.unit_number as string \| undefined\)\?\.trim\(\)\s*,\s*row\.unit_id as string \| undefined\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    bad: /driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*issue\.driver_name\s*,\s*issue\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
    bad: /previous_driver_name\s*\?\?\s*undefined|new_driver_name\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.previous_driver_name\s*,\s*row\.previous_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx",
    bad: /unit_number\s*\?\?\s*undefined|driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
    bad: /unit_number\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
    bad: /load_number\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx",
    bad: /driver_full_name\s*\?\?\s*""|unit_display_id\s*\?\?\s*""|String\(row\.driver_full_name/,
    good: /entityLabel\(\s*row\.driver_full_name\s*,\s*String\(row\.driver_id/,
  },
  {
    rel: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
    bad: /String\(row\.driver_full_name\s*\?\?\s*""\)|String\(row\.unit_display_id\s*\?\?\s*""\)/,
    good: /entityLabel\(\s*row\.driver_full_name\s*,\s*String\(row\.driver_id/,
  },
  {
    rel: "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx",
    bad: /driver_name\s*\|\|\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/FinesPage.tsx",
    bad: /subject_driver_name as string \| undefined\)\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.subject_driver_name\s*,\s*String\(row\.subject_driver_id\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/ArrivingSoonCard.tsx",
    bad: /\{card\.unit_number\}|driver_name\s*\?\?\s*"Unassigned"|label=\{card\.load_display_id\}/,
    good: /entityLabel\(\s*card\.unit_number\s*,\s*card\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx",
    bad: /unit_number\s*\?\?\s*undefined|driver_name\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/TrainingTable.tsx",
    bad: /driver_name as string \| undefined\)\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
    bad: /driver_name as string \| undefined\)\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx",
    bad: /driver_name\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/driver-scheduler/DriverLeaveBalancesPage.tsx",
    bad: /driver_name\s*\|\|\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/DrugAlcoholTable.tsx",
    bad: /driver_name as string \| undefined\)\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id/,
  },
  {
    rel: "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
    bad: /load_number\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/IdvrDetailPage.tsx",
    bad: /unit_number as string \| undefined\)\s*\?\?\s*undefined|submission\.driver_name as string/,
    good: /entityLabel\(\s*submission\.unit_number\s*,\s*submission\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/FleetTable.tsx",
    bad: /unit_number\s*\?\?\s*row\.id/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/ReturnToDuty.tsx",
    bad: /driver_name as string \| undefined\)\s*\|\|\s*undefined/,
    good: /entityLabel\(\s*proc\.driver_name\s*,\s*proc\.driver_id/,
  },
  {
    rel: "apps/frontend/src/pages/safety/RandomTestingPool.tsx",
    bad: /driver_name as string \| undefined\)\s*\|\|\s*undefined/,
    good: /entityLabel\(\s*member\.driver_name\s*,\s*member\.driver_id/,
  },
  {
    rel: "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    bad: /from_bank_name\s*\|\|\s*row\.from_coa_name.*\|\|\s*undefined/,
    good: /entityLabel\(\s*row\.from_bank_name\s*\|\|\s*row\.from_coa_name/,
  },
  {
    rel: "apps/frontend/src/pages/CustomerDetail.tsx",
    bad: /load_number\s*\?\?\s*undefined|label=\{load\.load_number\}/,
    good: /entityLabel\(\s*l\.load_number\s*,\s*l\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchList.tsx",
    bad: /assigned_primary_driver_name\s*\?\?\s*"Unassigned"|assigned_primary_driver_name\s*\?\?\s*undefined|>\{load\.load_number\}<|load\.customer_name\s*\?\?\s*"-"/,
    good: /entityLabel\(\s*load\.assigned_primary_driver_name\s*,\s*load\.assigned_primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
    bad: /unit_number\s*\?\?\s*""\)\s*\|\|\s*undefined|linked_load_number\s*\?\?\s*""/,
    good: /entityLabel\(\s*workOrder\.unit_number\s*,\s*workOrder\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    bad: /customerNameById\.get\(String\(detail\.claimant_customer_id\)\)\s*\?\?\s*undefined|loadNumberById\.get\(String\(detail\.load_id\)\)\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*customerNameById\.get\(String\(detail\.claimant_customer_id\)\)\s*,\s*detail\.claimant_customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
    bad: /editWorkOrder\.display_id\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*editWorkOrder\.display_id\s*,\s*editWorkOrder\.id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/IdvrPage.tsx",
    bad: /driver_name as string \| undefined|unit_number as string \| undefined/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
    bad: /load_number\s*\?\?\s*load\.id|driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx",
    bad: /label=\{row\.unit_number\}|driver_name\s*\?\?\s*"-"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
    bad: /assigned_unit_number\s*\?\?\s*"—"|assigned_primary_driver_name\s*\?\?\s*"Unassigned"|trailer_number\s*\?\?\s*"—"|load\.customer_name\s*\?\?\s*"—"|label=\{load\.customer_name\}|label=\{load\.load_number\}/,
    good: /entityLabel\(\s*load\.assigned_unit_number\s*,\s*load\.assigned_unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx",
    bad: /unit_number\s*\?\?\s*"—"|driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*t\.unit_number\s*,\s*t\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx",
    bad: />\{row\.customer_name\}</,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    bad: /label=\{row\.driverName\}/,
    good: /entityLabel\(\s*row\.driverName\s*,\s*row\.driverId\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx",
    bad: /label=\{row\.unit_number\}/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx",
    bad: /label=\{row\.unit_display_id\}/,
    good: /entityLabel\(\s*row\.unit_display_id\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
    bad: /label=\{row\.load_number\}/,
    good: /entityLabel\(\s*row\.load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
    bad: /nb_load_number\s*\?\?\s*"—"|sb_load_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.nb_load_number\s*,\s*row\.nb_load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
    bad: /doc\.driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*doc\.driver_name\s*,\s*doc\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
    bad: /label=\{row\.driver_name\}/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    bad: /complainant_driver_name \? String\(row\.complainant_driver_name\) : "Driver"/,
    good: /entityLabel\(\s*[\s\S]*complainant_driver_name[\s\S]*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
    bad: /label=\{row\.driver_full_name\}/,
    good: /entityLabel\(\s*row\.driver_full_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/drivers/EarningsTab.tsx",
    bad: /vendor\.name\s*\?\?\s*apVendorQuery\.data\.vendor\.id/,
    good: /entityLabel\(\s*apVendorQuery\.data\.vendor\.name\s*,\s*apVendorQuery\.data\.vendor\.id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
    bad: /label=\{row\.unit_code\}/,
    good: /entityLabel\(\s*row\.unit_code\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/compliance/ComplianceTable.tsx",
    bad: /label=\{row\.owner_name\}/,
    good: /entityLabel\(\s*row\.owner_name\s*,\s*row\.owner_id\s*,\s*ownerNoun\(row\.owner_type\)\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx",
    bad: /driver_full_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*[\s\S]*driver_full_name[\s\S]*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
    bad: /driver_full_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*[\s\S]*driver_full_name[\s\S]*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
    bad: /liability\.driver_full_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*[\s\S]*liability\.driver_full_name[\s\S]*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
    bad: /advance\.driver_full_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*[\s\S]*advance\.driver_full_name[\s\S]*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx",
    bad: /load\.driver_name\s*\?\?\s*"—"|label=\{load\.load_number\}/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
    bad: /event\.driver_name\s*\?\?\s*"—"|label=\{event\.load_number\}/,
    good: /entityLabel\(\s*event\.load_number\s*,\s*event\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
    bad: /row\.driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*null\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
    bad: /load\.driver_name\s*\?\?\s*"—"|event\.driver_name\s*\?\?\s*"—"|load\.driver_short_name\s*\?\?\s*"—"|`\$\{load\.load_number\}|load\.unit_number\s*\?\?\s*"—"|load\.customer_name\s*\?\?\s*"—"|event\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/compliance/HosTrackerSection.tsx",
    bad: /driver\.driver_name\s*\?\?\s*"—"|driver\.unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*driver\.driver_name\s*,\s*driver\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
    bad: /entry\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*entry\.customer_name\s*,\s*entry\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx",
    bad: /primary_driver_name\s*\?\?\s*"—"|>\{r\.unit_number\}</,
    good: /entityLabel\(\s*r\.primary_driver_name\s*,\s*r\.primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
    bad: /selected\.driver_name\s*\?\?\s*"—"|row\.unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*selected\.driver_name\s*,\s*null\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx",
    bad: /session\.driver_name\s*\?\?\s*"—"|session\.unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*session\.driver_name\s*,\s*null\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/FaroImportPage.tsx",
    bad: /customer_display_name\s*\?\?\s*row\.customer_name\s*\?\?\s*"—"|label=\{row\.invoice_number\}/,
    good: /entityLabel\(\s*row\.customer_display_name\s*\?\?\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx",
    bad: /row\.driver_name\s*\?\?\s*"—"|selected\.driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
    bad: /load\?\.load_number\s*\?\?\s*loadId|load\.customer_name\s*\?\?\s*"—"|assigned_primary_driver_name\s*\?\?\s*"Unassigned"|assigned_secondary_driver_name\s*\?\?/,
    good: /entityLabel\(\s*load\?\.load_number\s*,\s*load\?\.id\s*\?\?\s*loadId\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/CustomerDetail.tsx",
    bad: /assigned_primary_driver_name\s*\?\?\s*"—"|assigned_unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.assigned_primary_driver_name\s*,\s*load\.assigned_primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    bad: /issue\.load_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*issue\.load_number\s*,\s*null\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
    bad: /row\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    bad: /invoice\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*invoice\.customer_name\s*,\s*invoice\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
    bad: /row\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/RoundTrips.tsx",
    bad: /load\.customer_name\s*\?\?\s*"—"|load\.assigned_primary_driver_name\s*\?\?\s*"Unassigned"|>\{load\.load_number\}<|\$\{pair\.driverName\}/,
    good: /entityLabel\(\s*pair\.driverName\s*,\s*pair\.driverId\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx",
    bad: /load\.customer_name\s*\?\?\s*"—"|>\{load\.load_number\}<|load\.customer_name\s*\?\?\s*"Load"|driver\.unit_number\s*\?\?\s*"No unit"/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
    bad: /item\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*item\.customer_name\s*,\s*item\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx",
    bad: /item\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*item\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx",
    bad: /load\.customer_name\s*\?\?\s*"—"|>\{load\.load_number\}</,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    bad: /first_load_number\s*\?\?\s*"—"|last_load_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*settlement\.first_load_number\s*,\s*settlement\.first_load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx",
    bad: /load\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
    bad: /load\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
    bad: /event\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*event\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
    bad: />\{load\.load_number\}</,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
    bad: /`\$\{load\.load_number\}|>\{load\.load_number\}</,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx",
    bad: /customer_name\s*\?\?\s*"N\/A"/,
    good: /entityLabel\(\s*event\.customer_name\s*,\s*event\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
    bad: /row\.unit_number\s*\?\?\s*"—"|render:\s*\(row\)\s*=>\s*row\.driver_name/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    bad: /subtitle=\{invoice\.customer_name\s*\?\?\s*"Invoice detail"\}/,
    good: /entityLabel\(\s*invoice\.customer_name\s*,\s*invoice\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    bad: /row\.unit_number\s*\?\?\s*"—"|row\.driver_name\s*\?\?\s*"Unknown"/,
    good: /entityLabel\(\s*String\(row\.unit_number\s*\?\?\s*""\)\s*,\s*row\.unit_id/,
  },
  {
    rel: "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx",
    bad: />\{row\.unit_number\}<|row\.driver_name\s*\?\?\s*"Unassigned"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
    bad: />\{suggestedLoad\.load_number\}</,
    good: /entityLabel\(\s*suggestedLoad\.load_number\s*,\s*suggestedLoad\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx",
    bad: /row\.unit_number\s*\?\?\s*"—"|row\.driver_name\s*\?\?\s*"Not assigned"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/compliance/HosTrackerSection.tsx",
    bad: /selectedDriver\.unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*selectedDriver\.unit_number\s*,\s*null\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx",
    bad: /bill\.vendor_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*bill\.vendor_name\s*,\s*bill\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
    bad: /driver_name\s*\?\?\s*"Unknown"/,
    good: /entityLabel\(\s*selectedDriver\.driver_name\s*,\s*selectedDriver\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx",
    bad: /returnEstimate\?\.unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*returnEstimate\?\.unit_number\s*,\s*returnEstimate\?\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
    bad: />\{r\.customer_name\}</,
    good: /entityLabel\(\s*r\.customer_name\s*,\s*r\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/SettlementSummaryPage.tsx",
    bad: />\{r\.driver_name\}</,
    good: /entityLabel\(\s*r\.driver_name\s*,\s*r\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx",
    bad: />\{r\.customer_name\}</,
    good: /entityLabel\(\s*r\.customer_name\s*,\s*r\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/DeadheadReportPage.tsx",
    bad: /best\.unit_number\}|row\.unit_number\}/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx",
    bad: />\{r\.unit_number\}</,
    good: /entityLabel\(\s*r\.unit_number\s*,\s*r\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/assets/AssetListTable.tsx",
    bad: />\{row\.unit_number\}</,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/home/DriverDaySummaryCard.tsx",
    bad: />\{row\.driver_name\}</,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
    bad: />\{row\.customer_name\}</,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/driver-inbox/DriverInbox.tsx",
    bad: /String\(row\.driver_name \?\? "Driver"\)/,
    good: /entityLabel\(\s*String\(row\.driver_name \?\? ""\)\s*,\s*String\(row\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
    bad: /label=\{String\(r\.driver_name \?\? "Driver"\)\}/,
    good: /entityLabel\(\s*String\(r\.driver_name \?\? ""\)\s*,\s*String\(r\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx",
    bad: /\{String\(req\.driver_name \?\? ""\)\}/,
    good: /entityLabel\(\s*String\(req\.driver_name \?\? ""\)\s*,\s*String\(req\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/home/roles/DefaultHome.tsx",
    bad: /\{String\(r\.driver_name \?\? ""\)\}/,
    good: /entityLabel\(\s*String\(r\.driver_name \?\? ""\)\s*,\s*String\(r\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/home/OwnerHome.tsx",
    bad: /\{String\(r\.driver_name \?\? ""\)\}/,
    good: /entityLabel\(\s*String\(r\.driver_name \?\? ""\)\s*,\s*String\(r\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx",
    bad: />\{row\.driver_name\}</,
    good: /entityLabel\(\s*String\(row\.driver_name \?\? ""\)\s*,\s*String\(row\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx",
    bad: /\{leg\.load_number\}|\{settlement\.driver_name\}/,
    good: /entityLabel\(\s*leg\.load_number\s*,\s*leg\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx",
    bad: />\{r\.unit_number\}</,
    good: /entityLabel\(\s*r\.unit_number\s*,\s*r\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver/DriverLoadsPage.tsx",
    bad: /\{load\.customer_name\}/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx",
    bad: /label=\{v\}/,
    good: /entityLabel\(\s*v\s*,\s*driverId\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/OwnerApprovalPortalPage.tsx",
    bad: /\{String\(req\?\.driver_name \?\? ""\)\}/,
    good: /entityLabel\(\s*String\(req\?\.driver_name \?\? ""\)\s*,\s*String\(req\?\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    bad: /\{row\.customer_name\}/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
    bad: /\{item\.customer_name\}/,
    good: /entityLabel\(\s*item\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/samsara-vendor-mapping/HosDriverMapPreviewPage.tsx",
    bad: /\{row\.driver_name\}/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.local_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx",
    bad: /bestCpmTruck\.unit_number\}/,
    good: /entityLabel\(\s*bestCpmTruck\.unit_number\s*,\s*bestCpmTruck\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
    bad: /String\(row\.driver_name \?\? "Unknown"\)/,
    good: /entityLabel\(\s*String\(row\.driver_name \?\? ""\)\s*,\s*row\.driver_id as string \| undefined\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx",
    bad: /`\s*·\s*\$\{row\.unit_number\}`/,
    good: /entityLabel\(String\(row\.unit_number\),\s*String\(row\.unit_id \?\? ""\),\s*"Unit"\)/,
  },
  {
    rel: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
    bad: /`\s*·\s*\$\{s\(row\.driver_name\)\}`/,
    good: /entityLabel\(s\(row\.driver_name\),\s*s\(row\.driver_id\),\s*"Driver"\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx",
    bad: /\{load\.customer_name\}/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx",
    bad: /Escrow Forfeit — \$\{row\.driver_name\}/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx",
    bad: /Link \$\{row\.driver_name\}/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.local_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
    bad: /for \$\{row\.driver_name\}\?/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx",
    bad: /render: \(row\) => row\.driver_name/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_uuid\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/DtcAutoWorkOrdersCard.tsx",
    bad: /\{row\.unit_number \?\? "N\/A"\}/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx",
    bad: /render: \(row\) => row\.unit_number/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*null\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx",
    bad: /render: \(row\) => row\.unit_number \|\| "—"/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx",
    bad: /\{alert\.unit_number\} · \{alert\.schedule_label\}/,
    good: /entityLabel\(\s*alert\.unit_number\s*,\s*alert\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx",
    bad: /`\(\$\{entry\.unit_number\}\)`/,
    good: /entityLabel\(\s*entry\.unit_number\s*,\s*entry\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx",
    bad: /label=\{event\.unit_number\?\.trim\(\) \|\| "Unit"\}/,
    good: /entityLabel\(\s*event\.unit_number\s*,\s*event\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
    bad: /\{driver\.unit_number \?\? "—"\}/,
    good: /entityLabel\(\s*driver\.unit_number\s*,\s*driver\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx",
    bad: /String\(unit\.unit_number \?\? unitId\)/,
    good: /entityLabel\(\s*String\(unit\.unit_number \?\? ""\)\s*,\s*unitId\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/OpeningBalanceRegisterPage.tsx",
    bad: /label=\{row\.account_name\}/,
    good: /entityLabel\(\s*row\.account_name\s*,\s*row\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/PerTruckCpmReport.tsx",
    bad: /label=\{row\.display_id\}/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.unit_uuid\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
    bad: /\{posting\.account_name \|\| "—"\}/,
    good: /entityLabel\(\s*posting\.account_name\s*,\s*posting\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/PostingLineagePage.tsx",
    bad: /\{row\.account_name \?\? "—"\}/,
    good: /entityLabel\(\s*row\.account_name\s*,\s*row\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx",
    bad: /\{f\.customer_name_raw \?\? "—"\}/,
    good: /entityLabel\(\s*f\.customer_name_raw\s*,\s*f\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
    bad: /label=\{claim\.claim_number\}/,
    good: /entityLabel\(\s*claim\.claim_number\s*,\s*claim\.id\s*,\s*"Claim"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
    bad: /label=\{row\.case_number\}/,
    good: /entityLabel\(\s*row\.case_number\s*,\s*row\.id\s*,\s*"Case"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    bad: /key: "customer_name", label: "Customer", sortable: true \},/,
    good: /entityLabel\(\s*invoice\.customer_name\s*,\s*invoice\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/MaintKpiDashboardPage.tsx",
    bad: /\{row\.unit_number\}\s*<\/option>/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.id\s*,\s*"Unit"\s*\)/,
  },
];

export function auditEntityLabel(src) {
  const problems = [];
  if (!/UUID_SHAPE_RE/.test(src)) {
    problems.push(`${TARGET}: must define UUID_SHAPE_RE for uuid-shaped name rejection`);
  }
  if (!/!UUID_SHAPE_RE\.test\(s\)/.test(src)) {
    problems.push(`${TARGET}: entityLabel must reject uuid-shaped name strings (!UUID_SHAPE_RE.test(s))`);
  }
  return problems;
}

export function auditBillsPage(src) {
  const problems = [];
  if (/label=\{bill\.vendor_name\s*\|\|\s*bill\.vendor_id\}/.test(src)) {
    problems.push(
      `${BILLS}: Vendor column still uses bill.vendor_name || bill.vendor_id — paints UUID when name===id`
    );
  }
  if (!/entityLabel\(\s*bill\.vendor_name\s*,\s*bill\.vendor_id\s*,\s*"Vendor"\s*\)/.test(src)) {
    problems.push(`${BILLS}: Vendor EntityLink label must use entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")`);
  }
  return problems;
}

export function auditSibling(rel, src, bad, good) {
  const problems = [];
  if (bad.test(src)) {
    problems.push(`${rel}: still paints name||id (CLS-UUID-LABEL) — use entityLabel`);
  }
  if (!good.test(src)) {
    problems.push(`${rel}: must call entityLabel for display name`);
  }
  return problems;
}

function auditTree() {
  const problems = [
    ...auditEntityLabel(readFileSync(join(ROOT, TARGET), "utf8")),
    ...auditBillsPage(readFileSync(join(ROOT, BILLS), "utf8")),
  ];
  for (const s of SIBLINGS) {
    problems.push(...auditSibling(s.rel, readFileSync(join(ROOT, s.rel), "utf8"), s.bad, s.good));
  }
  return problems;
}

function selftest() {
  const failures = [];
  const goodLabel = `
    const UUID_SHAPE_RE = /^[0-9a-f]{8}-/i;
    if (s !== "" && !UUID_SHAPE_RE.test(s)) return s;
  `;
  if (auditEntityLabel(goodLabel).length !== 0) {
    failures.push(`selftest: good entity-label flagged: ${auditEntityLabel(goodLabel).join(" | ")}`);
  }
  const badLabel = `if (s !== "") return s;`;
  if (auditEntityLabel(badLabel).length < 2) {
    failures.push("selftest: missing UUID reject NOT fully detected");
  }
  const goodBills = `<EntityLink kind="vendor" id={billVendorDrillId(bill)} label={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")} />`;
  if (auditBillsPage(goodBills).length !== 0) {
    failures.push(`selftest: good BillsPage flagged: ${auditBillsPage(goodBills).join(" | ")}`);
  }
  const badBills = `<EntityLink kind="vendor" id={billVendorDrillId(bill)} label={bill.vendor_name || bill.vendor_id} />`;
  if (!auditBillsPage(badBills).some((p) => p.includes("vendor_name ||"))) {
    failures.push("selftest: BillsPage uuid fallback NOT detected");
  }
  const sib = SIBLINGS[0];
  if (
    !auditSibling(sib.rel, "row.driver_name?.trim() || row.driver_id", sib.bad, sib.good).some((p) =>
      p.includes("name||id")
    )
  ) {
    failures.push("selftest: sibling bad pattern NOT detected");
  }

  const real = auditTree();
  if (real.length) failures.push(`selftest: real tree: ${real.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — entityLabel + Bills + sibling drain sites`);
}

main();
