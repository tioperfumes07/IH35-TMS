#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["driver","unit","connectivity","reverse_link"],"leafRe":"^detail\\.loads$","task":"CLS-CUSTOMER-LOAD-DRIVER-UNIT-LINKS"} */
/** @matrix-built {"modules":["vendors"],"cols":["unit","connectivity","reverse_link"],"leafRe":"^detail\\.profile$","task":"CLS-VENDOR-WO-UNIT-LINK"} */
/** @matrix-built {"modules":["dispatch"],"cols":["customer","driver","unit","load","connectivity","reverse_link"],"leafRe":"^queues\\.detention$","task":"CLS-DISPATCH-DETENTION-FK-LINKS"} */
/** @matrix-built {"modules":["dispatch"],"cols":["driver","unit","load","connectivity","reverse_link"],"leafRe":"^secondary\\.assignments$","task":"CLS-DISPATCH-ASSIGNMENT-HISTORY-UNIT-LINKS"} */
/** @matrix-built {"modules":["dispatch"],"cols":["customer","driver","unit","load","connectivity","reverse_link"],"leafRe":"^home\\.overview$","task":"CLS-DISPATCH-OVERVIEW-ENTITY-LINKS"} */
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
const MAINT_WO_ROUTES = "apps/backend/src/maintenance/work-orders.routes.ts";
const MAINT_WO_TABLE = "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const VENDOR_WORK_ORDERS = "apps/frontend/src/pages/vendors/VendorWorkOrdersReverseSection.tsx";
const DETENTION_BOARD = "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx";

/** Batch-2/3 drain sites — name||id / name??id paints (CLS-UUID-LABEL). */
const SIBLINGS = [
  {
    rel: "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx",
    bad: /driver_name\?\.trim\(\)\s*\|\|\s*row\.driver_id/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/VendorDetailPage.tsx",
    bad: />\{vendor\.mdata_vendor_id\}</,
    good: /entityLabel\(\s*vendor\.mdata_vendor_name\s*,\s*vendor\.mdata_vendor_id\s*,\s*"Vendor"\s*\)/,
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
    rel: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    bad: /selectedEquipmentLoan\?\.equipment_number\s*\|\|\s*selectedEquipmentLoan\?\.equipment_id/,
    good: /entityLabel\(\s*selectedEquipmentLoan\?\.equipment_number\s*,\s*selectedEquipmentLoan\?\.equipment_id\s*,\s*"Equipment"\s*\)/,
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
    // Either the raw entityLabel() call, or the canonical EntityLinkOrTombstone component (which
    // calls entityLabel/isUnresolvedEntityTombstone internally) wired to the same id/name pair —
    // both are equally honest; the page migrated to the shared component after this entry was written.
    good: /entityLabel\(\s*selectedPending\.driver_name\s*,\s*selectedPending\.driver_id\s*,\s*"Driver"\s*\)|id=\{selectedPending\.driver_id\}\s*name=\{selectedPending\.driver_name\}/,
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
    bad: /label=\{row\.vendor_name\s*\?\?\s*row\.vendor_id\}|vendorName=\{selectedBill\?\.vendor_name\s*\?\?\s*selectedBill\?\.vendor_id/,
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
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)|EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
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
    good: /entityLabel\(\s*row\.unit_display_id\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)|EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_display_id\} noun="Unit"/,
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
    good: /entityLabel\(\s*issue\.load_number\s*,\s*issue\.load_id\s*,\s*"Load"\s*\)|EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/,
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
    // BILL-EXPENSE-CATEGORY-PICKER-RAW-UUID-FALLBACK — the separate bill-mode expense-category
    // fallback on the same file/component; the CoA entry above only covered the non-bill path.
    rel: "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx",
    bad: /\.trim\(\)\s*\|\|\s*String\(row\.id\s*\?\?\s*""\)/,
    good: /entityLabel\(\s*row\.display_name\s*\?\?\s*row\.code\s*,\s*row\.id\s*,\s*"Category"\s*\)/,
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
    good: /entityLabel\(\s*\(row\.driver_name as string \| undefined\)\?\.trim\(\)\s*,\s*String\(row\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)|name=\{row\.driver_name\}/,
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
    good: /entityLabel\(\s*row\.work_order_display_id\s*,\s*row\.work_order_id\s*,\s*"Work order"\s*\)|name=\{row\.work_order_display_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
    bad: /related_unit_number.*\|\|\s*"Unit"|related_load_number.*\|\|\s*"Load"/,
    good: /entityLabel\(\s*fine\.related_unit_number\s*,\s*String\(fine\.related_unit_id\)\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx",
    bad: /unit_number\s*\?\?\s*undefined|driver_name\s*\?\?\s*"—"/,
    good: /name=\{row\.unit_number\} noun="Unit"|entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
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
    good: /entityLabel\(\s*row\.linked_load_number\s*,\s*row\.load_id\s*,\s*"Load"\s*\)|EntityLinkOrTombstone kind="load" id=\{row\.load_id\} name=\{row\.linked_load_number\} noun="Load"/,
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
    good: /entityLabel\(\s*\(row\.unit_number as string \| undefined\)\?\.trim\(\)\s*,\s*row\.unit_id as string \| undefined\s*,\s*"Unit"\s*\)|name=\{row\.unit_number\}/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    bad: /driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*issue\.driver_name\s*,\s*issue\.driver_id\s*,\s*"Driver"\s*\)|EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
    bad: /previous_driver_name\s*\?\?\s*undefined|new_driver_name\s*\?\?\s*undefined/,
    good: /entityLabel\(\s*row\.previous_driver_name\s*,\s*row\.previous_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
    bad: /previous_unit_number\s*\?\?\s*undefined/,
    good: /entityLabel\(row\.previous_unit_number, row\.previous_unit_id, "Unit"\)|id=\{row\.previous_unit_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
    bad: /new_unit_number\s*\?\?\s*undefined/,
    good: /entityLabel\(row\.new_unit_number, row\.new_unit_id, "Unit"\)|id=\{row\.new_unit_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx",
    bad: /unit_number\s*\?\?\s*undefined|driver_name\s*\?\?\s*"—"/,
    good: /name=\{row\.unit_number\} noun="Unit"|entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
    bad: /unit_number\s*\?\?\s*undefined/,
    good: /name=\{row\.unit_number\}\s+noun="Unit"/,
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
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)|EntityLinkOrTombstone kind="driver" id=\{row\.driver_id as string \| undefined\} name=\{row\.driver_name\} noun="Driver"/,
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
    good: /entityLabel\(\s*l\.load_number\s*,\s*l\.id\s*,\s*"Load"\s*\)|name=\{l\.load_number\}|name=\{load\.load_number\}/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchList.tsx",
    bad: /\{\s*load\.assigned_primary_driver_name\s*(?:\?\?|\|\|)\s*load\.assigned_primary_driver_id\s*\}|assigned_primary_driver_name\s*\?\?\s*"Unassigned"|>\{load\.load_number\}<|load\.customer_name\s*\?\?\s*"-"/,
    good: /entityLabel\(\s*load\.assigned_primary_driver_name\s*,\s*load\.assigned_primary_driver_id\s*,\s*"Driver"\s*\)[\s\S]*entityLabel\(\s*load\.assigned_primary_driver_name\s*,\s*load\.assigned_primary_driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
    bad: /unit_number\s*\?\?\s*""\)\s*\|\|\s*undefined|linked_load_number\s*\?\?\s*""/,
    // Migrated to EntityLinkOrTombstone for unit/load — accept either shape.
    good: /entityLabel\(\s*workOrder\.unit_number\s*,\s*workOrder\.unit_id\s*,\s*"Unit"\s*\)|kind="unit"[\s\S]*?name=\{workOrder\.unit_number\}/,
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
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)|name=\{row\.driver_name\}/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
    bad: /load_number\s*\?\?\s*load\.id|driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)|EntityLinkOrTombstone kind="load" id=\{load\.id\} name=\{load\.load_number\} noun="Load"/,
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
    good: /entityLabel\(\s*t\.unit_number\s*,\s*t\.unit_id\s*,\s*"Unit"\s*\)|EntityLinkOrTombstone kind="unit" id=\{t\.unit_id\} name=\{t\.unit_number\} noun="Unit"/,
  },
  {
    rel: "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx",
    bad: />\{row\.customer_name\}</,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    bad: /label=\{row\.driverName\}/,
    good: /entityLabel\(\s*row\.driverName\s*,\s*row\.driverId\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx",
    bad: /label=\{row\.unit_number\}/,
    // Migrated to EntityLinkOrTombstone — accept either shape.
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)|name=\{row\.unit_number\}/,
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
    // Trailing-comma tolerant: this call site's args wrap onto their own lines with a trailing
    // comma before the closing paren (this repo's Prettier default), which the bare \) here missed.
    good: /entityLabel\(\s*[\s\S]*driver_full_name[\s\S]*"Driver"\s*,?\s*\)/,
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
    good: /entityLabel\(\s*event\.load_number\s*,\s*event\.load_id\s*,\s*"Load"\s*\)|EntityLinkOrTombstone kind="load" id=\{event\.load_id\} name=\{event\.load_number\} noun="Load"/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
    bad: /row\.driver_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.driver_name\s*,\s*row\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
    bad: /load\.driver_name\s*\?\?\s*"—"|event\.driver_name\s*\?\?\s*"—"|load\.driver_short_name\s*\?\?\s*"—"|`\$\{load\.load_number\}|load\.unit_number\s*\?\?\s*"—"|load\.customer_name\s*\?\?\s*"—"|event\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
    bad: /entityLabel\(\s*load\.unit_number\s*,\s*null\s*,\s*"Unit"\s*\)/,
    good: /<(?:EntityLink|EntityLinkOrTombstone) kind="unit" id=\{load\.(?:assigned_unit_id|unit_id)\}/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
    bad: /entityLabel\(\s*load\.(?:driver_short_name|driver_name)\s*,\s*null\s*,\s*"Driver"\s*\)/,
    good: /<(?:EntityLink|EntityLinkOrTombstone) kind="driver" id=\{load\.(?:assigned_primary_driver_id|driver_id)\}/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
    bad: /entityLabel\(\s*load\.customer_name\s*,\s*null\s*,\s*"Customer"\s*\)/,
    good: /<(?:EntityLink|EntityLinkOrTombstone) kind="customer" id=\{load\.customer_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/compliance/HosTrackerSection.tsx",
    bad: /driver\.driver_name\s*\?\?\s*"—"|driver\.unit_number\s*\?\?\s*"—"/,
    // Migrated to EntityLinkOrTombstone — accept either shape.
    good: /entityLabel\(\s*driver\.driver_name\s*,\s*driver\.driver_id\s*,\s*"Driver"\s*\)|kind="driver"\s+id=\{driver\.driver_id\}\s+name=\{driver\.driver_name\}/,
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
    good: /entityLabel\(\s*selected\.driver_name\s*,\s*selected\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx",
    bad: /session\.driver_name\s*\?\?\s*"—"|session\.unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*session\.driver_name\s*,\s*session\.driver_uuid\s*,\s*"Driver"\s*\)/,
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
    good: /entityLabel\(\s*load\?\.load_number\s*,\s*load\?\.id\s*\?\?\s*loadId\s*,\s*"Load"\s*\)|name=\{load\?\.load_number\}/,
  },
  {
    rel: "apps/frontend/src/pages/CustomerDetail.tsx",
    bad: /assigned_primary_driver_name\s*\?\?\s*"—"|assigned_unit_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.assigned_primary_driver_name\s*,\s*load\.assigned_primary_driver_id\s*,\s*"Driver"\s*\)|name=\{load\.assigned_primary_driver_name\}/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    bad: /issue\.load_number\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*issue\.load_number\s*,\s*null\s*,\s*"Load"\s*\)|EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
    bad: /row\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    bad: /invoice\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*invoice\.customer_name\s*,\s*invoice\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
    bad: /row\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)/,
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
    good: /entityLabel\(\s*item\.customer_name\s*,\s*item\.customer_id\s*,\s*"Customer"\s*\)/,
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
    good: /entityLabel\(\s*load\.customer_name\s*,\s*load\.customer_id\s*,\s*"Customer"\s*\)|EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
    bad: /load\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*load\.customer_id\s*,\s*"Customer"\s*\)|EntityLinkOrTombstone kind="customer" id=\{load\.customer_id\} name=\{load\.customer_name\} noun="Customer"/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx",
    bad: /event\.customer_name\s*\?\?\s*"—"/,
    good: /entityLabel\(\s*event\.customer_name\s*,\s*event\.customer_id\s*,\s*"Customer"\s*\)|EntityLinkOrTombstone kind="customer" id=\{event\.customer_id\} name=\{event\.customer_name\} noun="Customer"/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
    bad: />\{load\.load_number\}</,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
    bad: /`\$\{load\.load_number\}|>\{load\.load_number\}</,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)|EntityLinkOrTombstone kind="load" id=\{load\.id\} name=\{load\.load_number\} noun="Load"/,
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
    good: /entityLabel\(\s*String\(row\.unit_number\s*\?\?\s*""\)\s*,\s*row\.unit_id|name=\{row\.unit_number\}/,
  },
  {
    rel: "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx",
    bad: />\{row\.unit_number\}<|row\.driver_name\s*\?\?\s*"Unassigned"/,
    // Migrated to EntityLinkOrTombstone (calls entityLabel internally) — accept either shape.
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)|kind="unit"\s+id=\{row\.unit_id\}\s+name=\{row\.unit_number\}/,
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
    // Migrated to EntityLinkOrTombstone — accept either shape.
    good: /entityLabel\(\s*selectedDriver\.unit_number\s*,\s*selectedDriver\.unit_id\s*,\s*"Unit"\s*\)|kind="unit"\s+id=\{selectedDriver\.unit_id\}\s+name=\{selectedDriver\.unit_number\}/,
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
    // The inline entityLabel(r.customer_name, ...) call was extracted into a shared
    // customerDisplayLabel(row) helper (param renamed r -> row) reused by both the cell render and
    // the tombstone check — same call, different variable name.
    rel: "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx",
    bad: />\{r\.customer_name\}</,
    good: /entityLabel\(\s*\w+\.customer_name\s*,\s*\w+\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/DeadheadReportPage.tsx",
    bad: /best\.unit_number\}|row\.unit_number\}/,
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx",
    bad: />\{r\.unit_number\}</,
    // Migrated to EntityLinkOrTombstone — accept either shape.
    good: /entityLabel\(\s*r\.unit_number\s*,\s*r\.unit_id\s*,\s*"Unit"\s*\)|name=\{r\.unit_number\}/,
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
    good: /entityLabel\(\s*String\(r\.driver_name \?\? ""\)\s*,\s*String\(r\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)|name=\{r\.driver_name\}/,
  },
  {
    rel: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx",
    bad: /\{String\(req\.driver_name \?\? ""\)\}/,
    good: /entityLabel\(\s*String\(req\.driver_name \?\? ""\)\s*,\s*String\(req\.driver_id \?\? ""\)\s*,\s*"Driver"\s*\)|name=\{req\.driver_name\}/,
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
    // Both raw paints migrated to governed EntityLinkOrTombstone `name=` props
    // (id={leg.load_id} name={leg.load_number}, id={settlement.driver_id} name={settlement.driver_name}) —
    // same shape as ManagementReportPackagePage.tsx / DailyPredictionTab.tsx above.
    rel: "apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx",
    bad: /(?<!=)\{leg\.load_number\}|(?<!=)\{settlement\.driver_name\}/,
    good: /entityLabel\(\s*leg\.load_number\s*,\s*leg\.load_id\s*,\s*"Load"\s*\)|id=\{leg\.load_id\}\s*name=\{leg\.load_number\}/,
  },
  {
    rel: "apps/frontend/src/pages/reports/MaintenanceCostPerUnitPage.tsx",
    bad: />\{r\.unit_number\}</,
    // Migrated to EntityLinkOrTombstone — accept either shape.
    good: /entityLabel\(\s*r\.unit_number\s*,\s*r\.unit_id\s*,\s*"Unit"\s*\)|name=\{r\.unit_number\}/,
  },
  {
    rel: "apps/frontend/src/pages/driver/DriverLoadsPage.tsx",
    bad: /\{load\.customer_name\}/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*load\.customer_id\s*,\s*"Customer"\s*\)/,
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
    // The row's customer_name/customer_id are now forwarded as props
    // (customerId={row.customer_id} customerName={row.customer_name}) to a ManagementCustomerCell
    // component that internally calls entityLabel(customerName, customerId, "Customer") — the
    // literal "bad" pattern below falsely matches the safe prop-forwarding JSX
    // `customerName={row.customer_name}`, and the literal "good" pattern never matches because the
    // entityLabel call uses the destructured prop names, not `row.customer_name`/`row.customer_id`
    // directly. Excludes a preceding `=` so "bad" only matches a bare `{row.customer_name}`
    // display, not `customerName={row.customer_name}` prop forwarding, and accepts the
    // component-delegate entityLabel call shape too.
    rel: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    bad: /(?<!=)\{row\.customer_name\}/,
    good: /entityLabel\(\s*row\.customer_name\s*,\s*row\.customer_id\s*,\s*"Customer"\s*\)|entityLabel\(\s*customerName\s*,\s*customerId\s*,\s*"Customer"\s*\)/,
  },
  {
    // Same shape as ManagementReportPackagePage.tsx above: `{item.customer_name}` is a legitimate
    // `name={item.customer_name}` prop value on the governed EntityLinkOrTombstone component when
    // item.customer_id exists — only a bare (non-prop) paint is the violation.
    rel: "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
    bad: /(?<!=)\{item\.customer_name\}/,
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
    good: /entityLabel\(\s*String\(row\.driver_name \?\? ""\)\s*,\s*row\.driver_id as string \| undefined\s*,\s*"Driver"\s*\)|name=\{row\.driver_name\}/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx",
    bad: /`\s*·\s*\$\{row\.unit_number\}`/,
    good: /entityLabel\(String\(row\.unit_number\),\s*String\(row\.unit_id \?\? ""\),\s*"Unit"\)|name=\{row\.unit_number \?\? null\}|name=\{String\(row\.unit_number\)\}/,
  },
  {
    rel: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
    bad: /`\s*·\s*\$\{s\(row\.driver_name\)\}`/,
    good: /entityLabel\(s\(row\.driver_name\),\s*s\(row\.driver_id\),\s*"Driver"\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx",
    bad: /\{load\.customer_name\}/,
    good: /entityLabel\(\s*load\.customer_name\s*,\s*load\.customer_id\s*,\s*"Customer"\s*\)/,
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
    good: /entityLabel\(\s*row\.unit_number\s*,\s*row\.unit_id\s*,\s*"Unit"\s*\)/,
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
    good: /entityLabel\(\s*driver\.unit_number\s*,\s*driver\.unit_id\s*,\s*"Unit"\s*\)|EntityLinkOrTombstone kind="unit" id=\{driver\.unit_id\} name=\{driver\.unit_number\} noun="Unit"/,
  },
  {
    rel: "apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx",
    bad: /String\(unit\.unit_number \?\? unitId\)/,
    // Migrated to EntityLinkOrTombstone — accept either shape.
    good: /entityLabel\(\s*String\(unit\.unit_number \?\? ""\)\s*,\s*unitId\s*,\s*"Unit"\s*\)|kind="unit"\s+id=\{unitId\}\s+name=\{String\(unit\.unit_number \?\? ""\)\}/,
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
    good: /entityLabel\(\s*f\.customer_name_raw\s*,\s*f\.customer_id\s*,\s*"Customer"\s*\)|EntityLinkOrTombstone kind="customer" id=\{f\.customer_id\} name=\{f\.customer_name_raw\} noun="Customer"/,
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
    bad: /<select[\s\S]*?value=\{unitId\}/,
    good: /<EntityPicker[\s\S]*?kind="unit"[\s\S]*?allowCreate=\{false\}/,
  },
  {
    rel: "apps/frontend/src/pages/reports/APAgingPage.tsx",
    bad: />\{r\.vendor_name\}</,
    good: /entityLabel\(\s*r\.vendor_name\s*,\s*r\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
    bad: /aria-label=\{\`Open invoices for \$\{r\.customer_name\}\`\}/,
    good: /entityLabel\(\s*r\.customer_name\s*,\s*r\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
    bad: /r\.customer_name \|\| "—"|r\.vendor_name \|\| "—"/,
    good: /entityLabel\(\s*r\.customer_name\s*,\s*r\.customer_id\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
    bad: /return load\.assigned_unit_number \|\| load\.load_number;/,
    good: /entityLabel\(\s*load\.assigned_unit_number\s*,\s*load\.assigned_unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
    bad: /label=\{row\.display_id\}/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    bad: /label=\{row\.display_id\}/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    bad: /label=\{row\.display_id\}/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Advance"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactorReserveCard.tsx",
    bad: /label=\{event\.display_id\}/,
    good: /entityLabel\(\s*event\.display_id\s*,\s*event\.factoring_advance_id\s*,\s*"Advance"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    bad: /label=\{invoice\.display_id\}/,
    good: /entityLabel\(\s*invoice\.display_id\s*,\s*invoice\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/Customers.tsx",
    bad: /label=\{r\.display_id\}/,
    good: /entityLabel\(\s*r\.display_id\s*,\s*r\.id\s*,\s*"Invoice"\s*\)|name=\{r\.display_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/CustomerDetail.tsx",
    bad: /label=\{inv\.display_id\}/,
    good: /entityLabel\(\s*inv\.display_id\s*,\s*inv\.id\s*,\s*"Invoice"\s*\)|name=\{inv\.display_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/CustomerDetail.tsx",
    bad: /label=\{invoice\.display_id\}/,
    good: /entityLabel\(\s*invoice\.display_id\s*,\s*invoice\.id\s*,\s*"Invoice"\s*\)|name=\{invoice\.display_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/TriageModal.tsx",
    bad: /label=\{issue\.unit_display_id\}/,
    good: /entityLabel\(\s*issue\.unit_display_id\s*,\s*issue\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/components/InTransitTriageBand.tsx",
    bad: /label=\{issue\.unit_display_id\}/,
    good: /entityLabel\(\s*issue\.unit_display_id\s*,\s*issue\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver/DriverLoadDetailPage.tsx",
    bad: /label=\{load\.display_id\}/,
    good: /entityLabel\(\s*load\.display_id\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
    bad: /label=\{wo\.display_id\}/,
    good: /entityLabel\(\s*wo\.display_id\s*,\s*wo\.id\s*,\s*"Work order"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    bad: /work_order_display_id as string \| undefined\)\?\.trim\(\)\s*\|\|\s*"Work order"/,
    good: /entityLabel\(\s*\(row\.work_order_display_id as string \| undefined\)\?\.trim\(\)\s*,\s*row\.auto_spawned_wo_id as string\s*,\s*"Work order"\s*\)|name=\{\(row\.work_order_display_id/,
  },
  {
    rel: "apps/frontend/src/pages/fuel/components/ActiveTripStrip.tsx",
    bad: /label=\{route\?\.load_display_id \?\? "—"\}/,
    good: /entityLabel\(\s*route\?\.load_display_id\s*,\s*route\?\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/fuel/components/ActiveTripStrip.tsx",
    bad: /route\?\.unit_display_id \?\? "—"/,
    good: /entityLabel\(\s*route\.unit_display_id\s*,\s*route\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/LoadCreateModal.tsx",
    bad: /work_order_display_id \?\? availabilityQuery\.data\?\.work_order_id/,
    good: /entityLabel\(\s*availabilityQuery\.data\?\.work_order_display_id/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /label=\{typeof wo\.linked_load_number === "string" \? wo\.linked_load_number : undefined\}/,
    good: /entityLabel\(\s*typeof wo\.linked_load_number === "string" \? wo\.linked_load_number : null\s*,\s*wo\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /label=\{typeof wo\.roadside_breakdown_load_number === "string" \? wo\.roadside_breakdown_load_number : undefined\}/,
    good: /entityLabel\(\s*typeof wo\.roadside_breakdown_load_number === "string" \? wo\.roadside_breakdown_load_number : null\s*,\s*wo\.roadside_breakdown_load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
    bad: /const displayId = String\(workOrder\.display_id/,
    good: /entityLabel\(workOrder\.display_id, workOrder\.id, "Work order"\)/,
  },
  {
    rel: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
    bad: /label=\{linkedWoDisplayId\}/,
    good: /entityLabel\(linkedWoDisplayId, linkedWoId, "Work order"\)/,
  },
  {
    rel: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    bad: /label=\{linkedWoDisplayId\}/,
    good: /entityLabel\(linkedWoDisplayId, workOrderId, "Work order"\)/,
  },
  {
    // RECORD-EXPENSE-SUGGESTED-LOAD-RAW-UUID-LABEL — auto-suggested load: loadLabel is folded into
    // the persisted expense memo (buildRecordExpenseMemo), so a raw load_id fallback here is a
    // permanent unreadable memo, not just a UI glitch.
    rel: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    bad: /loadLabel:\s*suggested\.load_number\s*\|\|\s*suggested\.load_id/,
    good: /loadLabel:\s*entityLabel\(suggested\.load_number,\s*suggested\.load_id,\s*"Load"\)/,
  },
  {
    // RECORD-EXPENSE-SUGGESTED-LOAD-RAW-UUID-LABEL — manual override via EntityPicker hit the same
    // bug: the picker's onChange already resolves a human option.label for the row just clicked.
    rel: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    bad: /loadLabel:\s*next\s*\?\?\s*""/,
    good: /loadLabel:\s*next\s*\?\s*entityLabel\(option\?\.label,\s*next,\s*"Load"\)\s*:\s*""/,
  },
  {
    rel: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
    bad: /const name = String\(dr\.driver_name/,
    good: /entityLabel\(dr\.driver_name, driverId, "Driver"\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx",
    bad: /label=\{driverName\}/,
    good: /entityLabel\(driverName, driverId, "Driver"\)/,
  },
  {
    rel: "apps/frontend/src/components/drivers/OperationsHistoryTable.tsx",
    bad: /const label = labelValue === null \|\| labelValue === undefined \|\| labelValue === "" \? undefined : formatCell\(labelValue\)/,
    good: /entityLabel\(raw, id, linkNoun\(column\.entityKind\)\)/,
  },
  {
    rel: "apps/frontend/src/components/safety/DriverFinesReverseSection.tsx",
    bad: /const label = String\(f\.violation_code/,
    good: /entityLabel\(f\.violation_code \?\? f\.jurisdiction, id, "Fine"\)/,
  },
  {
    rel: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
    bad: /label=\{String\(row\.matter_number/,
    good: /entityLabel\(row\.matter_number, row\.id, "Legal matter"\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    bad: /label=\{m\.matter_number\}/,
    good: /entityLabel\(m\.matter_number, m\.id, "Legal matter"\)/,
  },
  {
    rel: "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
    bad: /label=\{String\(row\.settlement_id/,
    good: /entityLabel\(\s*null\s*,\s*row\.settlement_id/,
  },
  {
    rel: "apps/frontend/src/components/drivers/EarningsTab.tsx",
    bad: /label=\{String\(row\.type/,
    good: /entityLabel\(\s*row\.type/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    bad: /label=\{graph\.claim\.driver_id \? "Driver" : undefined\}/,
    good: /entityLabel\(\s*graph\.claim\.driver_display_name\s*,\s*graph\.claim\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /label=\{typeof wo\.unit_number === "string" \? wo\.unit_number : undefined\}/,
    good: /entityLabel\(\s*typeof wo\.unit_number === "string" \? wo\.unit_number : null\s*,\s*wo\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /label=\{typeof wo\.driver_name === "string" \? wo\.driver_name : undefined\}/,
    good: /entityLabel\(\s*typeof wo\.driver_name === "string" \? wo\.driver_name : null\s*,\s*wo\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /label=\{typeof wo\.resolved_vendor_name === "string" \? wo\.resolved_vendor_name : undefined\}/,
    good: /entityLabel\(\s*typeof wo\.resolved_vendor_name === "string" \? wo\.resolved_vendor_name : null\s*,\s*wo\.resolved_vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/Permits.tsx",
    bad: /label=\{u\.unit_number\?\.trim\(\) \|\| "Unit"\}/,
    good: /entityLabel\(\s*u\.unit_number\s*,\s*u\.unit_id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/factoring/VendorMergeDiffPreview.tsx",
    bad: /label=\{fromVendorId \|\| "—"\}/,
    good: /entityLabel\(\s*fromVendorName\s*,\s*fromVendorId/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx",
    bad: /label=\{detail\.customer_uuid \? undefined : "—"\}/,
    good: /entityLabel\(\s*detail\.customer_name \?\? null\s*,\s*detail\.customer_uuid\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /label=\{draft\.customerProject \|\| "—"\}/,
    good: /entityLabel\(\s*draft\.customerProject\s*,\s*draft\.customerId\s*,\s*"Customer"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /label=\{draft\.payee \|\| "—"\}/,
    good: /entityLabel\(\s*draft\.payee\s*,\s*draft\.vendorId\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    bad: /<EntityLink kind="claim" id=\{String\(wo\.insurance_claim_id\)\} \/>/,
    good: /entityLabel\(wo\.insurance_claim_number, wo\.insurance_claim_id, "Claim"\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
    bad: /label=\{driverNameById\.get\(driverId\)\}/,
    good: /entityLabel\(\s*driverNameById\.get\(driverId\)\s*,\s*driverId\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
    bad: /label=\{driverNameById\.get\(driverId\)\}/,
    good: /entityLabel\(\s*driverNameById\.get\(driverId\)\s*,\s*driverId\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
    bad: /label=\{driverNameById\.get\(driverId\)\}/,
    good: /entityLabel\(\s*driverNameById\.get\((?:driverId|effectiveDriverId)\)\s*,\s*(?:driverId|effectiveDriverId)\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    bad: /return name \|\| driver\.id/,
    good: /entityLabel\(name \|\| null, driver\.id, "Driver"\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    bad: /label=\{\s*\(row\.driver_name as string \| undefined\) \?\?\s*\(row\.driver_id \? driverNameById\.get/,
    good: /entityLabel\(\s*\(row\.driver_name as string \| undefined\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx",
    bad: /<EntityLink kind="account" id=\{detail\.asset_account_id\} \/>/,
    good: /accountHumanLabel\(detail\.asset_account_number, detail\.asset_account_name, detail\.asset_account_id\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    bad: /<EntityLink kind="driver" id=\{row\.holder_id\} \/>/,
    good: /entityLabel\(row\.holder_label \?\? null, row\.holder_id, escrowHolderNoun\(row\.holder_type\)\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
    bad: /<EntityLink kind="vendor" id=\{row\.vendor_id\} \/>/,
    good: /entityLabel\(row\.vendor_name, row\.vendor_id, "Vendor"\)/,
  },
  {
    rel: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
    bad: /<EntityLink kind="vendor" id=\{String\(workOrder\.external_vendor_id\)\} \/>/,
    // EntityLinkOrTombstone with honest name= (entityLabel inside) OR raw entityLabel().
    good: /entityLabel\(\s*typeof workOrder\.external_vendor_name === "string"|kind="vendor"[\s\S]*?name=\{typeof workOrder\.external_vendor_name === "string"/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx",
    bad: /<EntityLink kind=\{anomaly\.subject_type\} id=\{anomaly\.subject_id\} \/>/,
    good: /entityLabel\(\s*null,\s*anomaly\.subject_id,|entityLabel\([\s\S]*anomaly\.subject_id/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx",
    bad: /label="Earn JE"/,
    good: /entityLabel\(row\.earn_journal_entry_memo \?\? null, row\.earn_journal_entry_id, "Journal entry"\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    bad: /Lawsuit \{l\.case_number\}/,
    good: /entityLabel\(l\.case_number, l\.id, "Case"\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactorReserveCard.tsx",
    bad: /\{ key: "customer_name", label: "Customer", sortable: true \},/,
    good: /entityLabel\(row\.customer_name, row\.customer_id, "Customer"\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactorReserveCard.tsx",
    bad: /- \{event\.customer_name\}/,
    good: /entityLabel\(event\.customer_name, event\.customer_id, "Customer"\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
    bad: /entry\.driver_name : "Driver"/,
    good: /entityLabel\(\s*typeof entry\.driver_name === "string"|entityLabel\(\s*entry\.driver_name/,
  },
  {
    rel: "apps/frontend/src/pages/safety/components/FinePaymentLinkBanner.tsx",
    bad: /label="Bank payment"/,
    good: /entityLabel\(null, bankTransactionId, "Bank transaction"\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/BankAccountDetail.tsx",
    bad: /label="Load"/,
    good: /entityLabel\(null, row\.matched_load_id, "Load"\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx",
    bad: /label="Load"/,
    good: /entityLabel\(null, bt\.matched_load_id, "Load"\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /label="Settlement"/,
    good: /entityLabel\(null, tx\.matched_settlement_id, "Settlement"\)/,
  },
  {
    rel: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    bad: /label="Journal Entry"/,
    good: /entityLabel\(null, tx\.matched_journal_entry_id, "Journal entry"\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
    bad: /\{lawsuit\.case_number\}/,
    good: /entityLabel\(\s*lawsuit\.case_number\s*,\s*lawsuit\.id\s*,\s*"Case"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    bad: /\{claim\.claim_number\}/,
    good: /entityLabel\(\s*claim\.claim_number\s*,\s*claim\.id\s*,\s*"Claim"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
    bad: /\{v\.vendor_name\}/,
    good: /entityLabel\(\s*v\.vendor_name\s*,\s*v\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx",
    bad: /(?<!name=)\{row\.vendor_name\}/,
    good: /entityLabel\(\s*row\.vendor_name\s*,\s*row\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
    bad: /\{p\.policy_number\}/,
    good: /entityLabel\(\s*p\.policy_number\s*,\s*p\.id\s*,\s*"Policy"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/VendorBalancesPage.tsx",
    bad: /\{row\.vendor_name\}|\$\{selectedVendor\.vendor_name\}/,
    good: /entityLabel\(\s*row\.vendor_name\s*,\s*row\.vendor_id\s*,\s*"Vendor"\s*\)/,
  },
  {
    // Same ManagementVendorCell delegate class as the customer entry above.
    rel: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
    bad: /(?<!=)\{row\.vendor_name\}/,
    good: /entityLabel\(\s*row\.vendor_name\s*,\s*row\.vendor_id\s*,\s*"Vendor"\s*\)|entityLabel\(\s*vendorName\s*,\s*vendorId\s*,\s*"Vendor"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
    bad: /\{load\.load_number\}/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
    bad: /\{entry\.driver_name\}/,
    good: /entityLabel\(\s*entry\.driver_name\s*,\s*entry\.driver_id\s*,\s*"Driver"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
    bad: /Policy \$\{policy\.policy_number\}|Policies", policy\.policy_number/,
    good: /entityLabel\(\s*policy\.policy_number\s*,\s*policy\.id\s*,\s*"Policy"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
    bad: /\{claim\.claim_number\} —/,
    good: /kind="insurance_claim"/,
  },
  {
    rel: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
    bad: /\{lawsuit\.case_number\} —/,
    good: /kind="insurance_lawsuit"/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
    bad: /\{openPreSettlement\.settlement_number\}/,
    good: /entityLabel\(\s*openPreSettlement\.settlement_number\s*,\s*openPreSettlement\.settlement_id\s*,\s*"Settlement"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchList.tsx",
    bad: /\{openPreSettlement\.settlement_number\}/,
    good: /entityLabel\(\s*openPreSettlement\.settlement_number\s*,\s*openPreSettlement\.settlement_id\s*,\s*"Settlement"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
    bad: /`\s*\$\{editLoad\.load_number\}`/,
    good: /entityLabel\(\s*editLoad\.load_number\s*,\s*editLoad\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
    bad: /return load\.assigned_unit_number \? load\.load_number : null;/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
    bad: /cardPrimaryLabel\(load\)\} · \$\{load\.load_number\}/,
    good: /entityLabel\(\s*load\.load_number\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver/DriverLoadsPage.tsx",
    bad: /\{load\.display_id\}/,
    good: /entityLabel\(\s*load\.display_id\s*,\s*load\.id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    bad: /\(\{bill\.bill_number\}\)/,
    // "Driver bill" (not "Bill") is the correct noun here — driver_finance.driver_bills is a
    // distinct table from accounting.bills; either honest noun satisfies the invariant.
    good: /entityLabel\(\s*bill\.bill_number\s*,\s*bill\.id\s*,\s*"(?:Bill|Driver bill)"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx",
    bad: /\{bill\.bill_number\}/,
    good: /entityLabel\(\s*bill\.bill_number\s*,\s*bill\.id\s*,\s*"(?:Bill|Driver bill)"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    bad: /\{row\.display_id\}/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Payment"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
    bad: /title=\{payment\.display_id\}|label: payment\.display_id/,
    good: /entityLabel\(\s*payment\.display_id\s*,\s*payment\.id\s*,\s*"Payment"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    bad: /title=\{invoice\.display_id\}|label: invoice\.display_id/,
    good: /entityLabel\(\s*invoice\.display_id\s*,\s*invoice\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    bad: /label: row\.display_id \|\| row\.customer_name|left: `\$\{item\.entity_type\} · \$\{item\.display_id\}`/,
    good: /entityLabel\(\s*item\.display_id\s*,\s*item\.entity_id\s*,\s*"Record"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx",
    bad: /label=\{\s*row\.account_name\s*\}/,
    good: /entityLabel\(\s*row\.account_name\s*,\s*row\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/CoaAsymmetryReportPanel.tsx",
    bad: / · \{row\.account_name\} · /,
    good: /entityLabel\(\s*row\.account_name\s*,\s*row\.account_id\s*,\s*"Account"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    bad: /label=\{graph\.claim\.load_id \? "Load"|label=\{graph\.claim\.unit_id \? "Unit"/,
    good: /entityLabel\(\s*graph\.claim\.load_display_id\s*,\s*graph\.claim\.load_id\s*,\s*"Load"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/PaymentApplyModal.tsx",
    bad: /\{invoice\.display_id\} · Open/,
    good: /entityLabel\(\s*invoice\.display_id\s*,\s*invoice\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx",
    bad: /\{invoice\.display_id\} · Open/,
    good: /entityLabel\(\s*invoice\.display_id\s*,\s*invoice\.id\s*,\s*"Invoice"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    bad: /title=\{detail\.display_id\}/,
    good: /entityLabel\(\s*detail\.display_id\s*,\s*detail\.id\s*,\s*"Advance"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
    bad: /render: \(row\) => row\.display_id|title=\{credit\?\.display_id|`\$\{credit\.display_id\} ·/,
    good: /entityLabel\(\s*row\.display_id\s*,\s*row\.id\s*,\s*"Vendor credit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    bad: /\{application\.display_id\}/,
    good: /entityLabel\(\s*application\.display_id\s*,\s*application\.credit_id\s*,\s*"Vendor credit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
    bad: /<span className="text-sm text-gray-900">\{payment\.reference_number\}<\/span>/,
    good: /entityLabel\(\s*payment\.reference_number\s*,\s*payment\.id\s*,\s*"Reference"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
    bad: /<span className="text-sm text-gray-900">\{payment\.check_number\}<\/span>/,
    good: /entityLabel\(\s*payment\.check_number\s*,\s*payment\.id\s*,\s*"Check"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx",
    bad: /\{String\(bill\.display_id\)\}/,
    good: /entityLabel\(\s*bill\.display_id\s*,\s*bill\.id\s*,\s*"Bill"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    bad: /label: row\.reference_number \|\| row\.check_number \|\| row\.memo \|\| "Bill payment"/,
    good: /entityLabel\(\s*row\.reference_number \|\| row\.check_number \|\| row\.memo\s*,\s*row\.id\s*,\s*"Payment"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/VendorDetail.tsx",
    bad: /\{c\.display_id\}/,
    good: /entityLabel\(\s*c\.display_id\s*,\s*c\.id\s*,\s*"Vendor credit"\s*\)/,
  },
  {
    // Migrated to governed EntityLinkOrTombstone: id={linkedInvoice.id} name={linkedInvoice.display_id}.
    rel: "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
    bad: /linkedInvoice\.display_id\s*\?\?\s*linkedInvoice\.id/,
    good: /entityLabel\(\s*linkedInvoice\.display_id\s*,\s*linkedInvoice\.id\s*,\s*"Invoice"\s*\)|id=\{linkedInvoice\.id\}\s*name=\{linkedInvoice\.display_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/driver-finance/OwnerApprovalPortalPage.tsx",
    bad: /\{String\(req\?\.display_id \?\? ""\)\}/,
    good: /entityLabel\(\s*String\(req\?\.display_id \?\? ""\)\s*,\s*String\(req\?\.id \?\? ""\)\s*,\s*"Request"\s*\)/,
  },
  {
    rel: "apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx",
    bad: /Trailer \$\{claim\.trailer_display_id\}/,
    good: /EntityLinkOrTombstone[\s\S]{0,220}?kind="trailer"[\s\S]{0,220}?name=\{claim\.trailer_display_id\}/,
  },
  {
    rel: "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
    bad: /\{row\.unit_display_id\}/,
    good: /entityLabel\(\s*row\.unit_display_id\s*,\s*row\.id\s*,\s*"Unit"\s*\)/,
  },
  {
    rel: "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx",
    bad: /r\.unit_number\.length > 10 \? `\$\{r\.unit_number\.slice\(0, 8\)/,
    good: /entityLabel\(\s*r\.unit_number\s*,\s*r\.unit_id\s*,\s*"Unit"\s*\)/,
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

export function auditMaintenanceWorkOrderLabels(routesSrc, tableSrc) {
  const problems = [];
  const listQuery = routesSrc.match(/SELECT w\.\*, u\.unit_number,[\s\S]*?ORDER BY w\.opened_at DESC NULLS LAST/)?.[0] ?? "";
  if (!/LEFT JOIN mdata\.drivers d ON d\.id = w\.driver_id AND d\.operating_company_id = w\.operating_company_id/.test(listQuery)
    || !/LEFT JOIN mdata\.vendors v ON v\.id = COALESCE\(w\.external_vendor_id, w\.vendor_id\) AND v\.operating_company_id = w\.operating_company_id/.test(listQuery)) {
    problems.push(`${MAINT_WO_ROUTES}: list serializer missing entity-scoped driver/vendor label join`);
  }
  if (!/AS driver_name/.test(listQuery) || !/AS resolved_vendor_id/.test(listQuery) || !/AS resolved_vendor_name/.test(listQuery)) {
    problems.push(`${MAINT_WO_ROUTES}: list payload must ship driver_name and resolved vendor id/name`);
  }
  if (!/entityLabel\(row\.driver_name, row\.driver_id, "Driver"\)/.test(tableSrc)) {
    problems.push(`${MAINT_WO_TABLE}: driver link must consume resolved driver_name`);
  }
  if (!/entityLabel\(row\.resolved_vendor_name, row\.resolved_vendor_id, "Vendor"\)/.test(tableSrc)) {
    problems.push(`${MAINT_WO_TABLE}: vendor link must consume resolved vendor id/name`);
  }
  return problems;
}

export function auditCustomerLoadEntityLinks(src) {
  const problems = [];
  // Accept classic EntityLink+entityLabel OR EntityLinkOrTombstone name= wiring.
  const driverOk =
    /<EntityLink\s+kind="driver"\s+id=\{load\.assigned_primary_driver_id\}\s+label=\{entityLabel\(load\.assigned_primary_driver_name, load\.assigned_primary_driver_id, "Driver"\)\}/.test(src) ||
    /kind="driver"\s+id=\{load\.assigned_primary_driver_id\}\s+name=\{load\.assigned_primary_driver_name\}/.test(src);
  const unitOk =
    /<EntityLink\s+kind="unit"\s+id=\{load\.assigned_unit_id\}\s+label=\{entityLabel\(load\.assigned_unit_number, load\.assigned_unit_id, "Unit"\)\}/.test(src) ||
    /kind="unit"\s+id=\{load\.assigned_unit_id\}\s+name=\{load\.assigned_unit_number\}/.test(src);
  if (!driverOk) {
    problems.push(`${CUSTOMER_DETAIL}: customer load rows must drill through the driver FK`);
  }
  if (!unitOk) {
    problems.push(`${CUSTOMER_DETAIL}: customer load rows must drill through the unit FK`);
  }
  return problems;
}

export function auditVendorWorkOrderUnitLink(src) {
  const problems = [];
  if (!/<EntityLink\s+kind="unit"\s+id=\{workOrder\.unit_id\}\s+label=\{entityLabel\(workOrder\.unit_number, workOrder\.unit_id, "Unit"\)\}/.test(src)) {
    problems.push(`${VENDOR_WORK_ORDERS}: vendor work-order rows must drill through the unit FK`);
  }
  return problems;
}

export function auditDetentionBoardEntityLinks(src) {
  const problems = [];
  for (const [kind, id, name, fallback] of [
    ["customer", "customer_id", "customer_name", "Customer"],
    ["driver", "driver_id", "driver_name", "Driver"],
    ["unit", "unit_id", "unit_number", "Unit"],
  ]) {
    const linkRe = new RegExp(`<(?:EntityLink\\s+kind="${kind}"\\s+id=\\{event\\.${id}\\}\\s+label=\\{entityLabel\\(event\\.${name}, event\\.${id}, "${fallback}"\\)\\}|EntityLinkOrTombstone\\s+kind="${kind}"\\s+id=\\{event\\.${id}\\}\\s+name=\\{event\\.${name}\\}\\s+noun="${fallback}")`);
    if (!linkRe.test(src)) problems.push(`${DETENTION_BOARD}: detention rows must drill through the ${kind} FK`);
  }
  return problems;
}

function auditTree() {
  const problems = [
    ...auditEntityLabel(readFileSync(join(ROOT, TARGET), "utf8")),
    ...auditBillsPage(readFileSync(join(ROOT, BILLS), "utf8")),
    ...auditMaintenanceWorkOrderLabels(
      readFileSync(join(ROOT, MAINT_WO_ROUTES), "utf8"),
      readFileSync(join(ROOT, MAINT_WO_TABLE), "utf8"),
    ),
    ...auditCustomerLoadEntityLinks(readFileSync(join(ROOT, CUSTOMER_DETAIL), "utf8")),
    ...auditVendorWorkOrderUnitLink(readFileSync(join(ROOT, VENDOR_WORK_ORDERS), "utf8")),
    ...auditDetentionBoardEntityLinks(readFileSync(join(ROOT, DETENTION_BOARD), "utf8")),
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
  const goodMaintRoutes = `SELECT w.*, u.unit_number, NULLIF(TRIM('x'), '') AS driver_name, COALESCE(w.external_vendor_id, w.vendor_id)::text AS resolved_vendor_id, v.vendor_name AS resolved_vendor_name
LEFT JOIN mdata.drivers d ON d.id = w.driver_id AND d.operating_company_id = w.operating_company_id
LEFT JOIN mdata.vendors v ON v.id = COALESCE(w.external_vendor_id, w.vendor_id) AND v.operating_company_id = w.operating_company_id
ORDER BY w.opened_at DESC NULLS LAST`;
  const goodMaintTable = `entityLabel(row.driver_name, row.driver_id, "Driver"); entityLabel(row.resolved_vendor_name, row.resolved_vendor_id, "Vendor")`;
  if (auditMaintenanceWorkOrderLabels(goodMaintRoutes, goodMaintTable).length) {
    failures.push("selftest: good maintenance WO label serializer flagged");
  }
  if (!auditMaintenanceWorkOrderLabels(goodMaintRoutes.replace(" AS driver_name", ""), goodMaintTable).length) {
    failures.push("selftest: missing maintenance WO driver label alias NOT detected");
  }
  const goodCustomerLoadLinks = `
    <EntityLink kind="driver" id={load.assigned_primary_driver_id} label={entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")} />
    <EntityLink kind="unit" id={load.assigned_unit_id} label={entityLabel(load.assigned_unit_number, load.assigned_unit_id, "Unit")} />
  `;
  if (auditCustomerLoadEntityLinks(goodCustomerLoadLinks).length) {
    failures.push("selftest: good customer load driver/unit links flagged");
  }
  if (!auditCustomerLoadEntityLinks(goodCustomerLoadLinks.replace('kind="driver"', 'kind="load"')).some((p) => p.includes("driver FK"))) {
    failures.push("selftest: missing customer load driver link NOT detected");
  }
  if (!auditCustomerLoadEntityLinks(goodCustomerLoadLinks.replace('kind="unit"', 'kind="load"')).some((p) => p.includes("unit FK"))) {
    failures.push("selftest: missing customer load unit link NOT detected");
  }
  const goodVendorWorkOrderUnitLink = '<EntityLink kind="unit" id={workOrder.unit_id} label={entityLabel(workOrder.unit_number, workOrder.unit_id, "Unit")} />';
  if (auditVendorWorkOrderUnitLink(goodVendorWorkOrderUnitLink).length) {
    failures.push("selftest: good vendor work-order unit link flagged");
  }
  if (!auditVendorWorkOrderUnitLink(goodVendorWorkOrderUnitLink.replace('id={workOrder.unit_id}', 'id={undefined}')).length) {
    failures.push("selftest: missing vendor work-order unit FK link NOT detected");
  }
  const goodDetentionLinks = `
    <EntityLink kind="customer" id={event.customer_id} label={entityLabel(event.customer_name, event.customer_id, "Customer")} />
    <EntityLink kind="driver" id={event.driver_id} label={entityLabel(event.driver_name, event.driver_id, "Driver")} />
    <EntityLink kind="unit" id={event.unit_id} label={entityLabel(event.unit_number, event.unit_id, "Unit")} />
  `;
  if (auditDetentionBoardEntityLinks(goodDetentionLinks).length) failures.push("selftest: good detention links flagged");
  for (const kind of ["customer", "driver", "unit"]) {
    if (!auditDetentionBoardEntityLinks(goodDetentionLinks.replace(`kind="${kind}"`, 'kind="load"')).some((p) => p.includes(`${kind} FK`))) {
      failures.push(`selftest: missing detention ${kind} FK link NOT detected`);
    }
  }
  const sib = SIBLINGS[0];
  if (
    !auditSibling(sib.rel, "row.driver_name?.trim() || row.driver_id", sib.bad, sib.good).some((p) =>
      p.includes("name||id")
    )
  ) {
    failures.push("selftest: sibling bad pattern NOT detected");
  }
  const dispatchDriverSibling = SIBLINGS.find(
    (entry) => entry.rel.endsWith("DispatchList.tsx") && entry.good.source.includes("assigned_primary_driver_name")
  );
  if (!dispatchDriverSibling) {
    failures.push("selftest: DispatchList driver-label sibling guard missing");
  } else {
    const helper = 'entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")';
    const visibleRawFallback = `{load.assigned_primary_driver_name ?? load.assigned_primary_driver_id}\n${helper}\n${helper}`;
    if (!auditSibling(dispatchDriverSibling.rel, visibleRawFallback, dispatchDriverSibling.bad, dispatchDriverSibling.good).some((p) => p.includes("name||id"))) {
      failures.push("selftest: DispatchList visible driver name??id fallback NOT detected");
    }
    if (!auditSibling(dispatchDriverSibling.rel, helper, dispatchDriverSibling.bad, dispatchDriverSibling.good).some((p) => p.includes("must call entityLabel"))) {
      failures.push("selftest: DispatchList missing second responsive driver label NOT detected");
    }
  }
  const selectedEquipmentSibling = SIBLINGS.find(
    (entry) => entry.rel.endsWith("FactoringHome.tsx") && entry.bad.test("selectedEquipmentLoan?.equipment_number || selectedEquipmentLoan?.equipment_id")
  );
  if (!selectedEquipmentSibling) {
    failures.push("selftest: selected equipment loan sibling guard missing");
  } else {
    const badSelectedEquipment = "selectedEquipmentLoan?.equipment_number || selectedEquipmentLoan?.equipment_id";
    const goodSelectedEquipment = 'entityLabel(selectedEquipmentLoan?.equipment_number, selectedEquipmentLoan?.equipment_id, "Equipment")';
    if (!auditSibling(selectedEquipmentSibling.rel, badSelectedEquipment, selectedEquipmentSibling.bad, selectedEquipmentSibling.good).length) {
      failures.push("selftest: selected equipment loan raw fallback NOT detected");
    }
    if (auditSibling(selectedEquipmentSibling.rel, goodSelectedEquipment, selectedEquipmentSibling.bad, selectedEquipmentSibling.good).length) {
      failures.push("selftest: selected equipment loan entityLabel fixture flagged");
    }
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
