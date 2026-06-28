import type { NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { COLLECTIONS_SUBNAV_ITEM } from "./subnav-collections";

export type AccountingSubNavItem = {
  label: string;
  path: string;
  section: "bills" | "settlements" | "settings" | "direct";
};

/**
 * C7 — QBO 12-item Accounting module sub-nav (exact live order from QBO walkthrough 2026-06-10).
 * Maps to existing TMS routes where they exist; shells route to /accounting/… stubs.
 */
export type QboSubNavItem = {
  label: string;
  path: string;
  isShell?: boolean;
};

export const QBO_ACCOUNTING_SUBNAV: readonly QboSubNavItem[] = [
  { label: "Bank transactions",        path: "/banking" },
  { label: "Integration transactions", path: "/accounting/integration-transactions" },
  { label: "Receipts",                 path: "/accounting/receipts" },
  { label: "Reconcile",                path: "/banking/reconcile" },
  { label: "Rules",                    path: "/banking/categorization-rules" },
  { label: "Chart of accounts",        path: "/lists/accounting/chart-of-accounts" },
  { label: "Recurring transactions",   path: "/accounting/recurring-transactions" },
  { label: "Revenue recognition",      path: "/accounting/revenue-recognition", isShell: true },
  { label: "Fixed assets",             path: "/accounting/fixed-assets", isShell: true },
  { label: "Prepaid expenses",         path: "/accounting/prepaid-expenses" },
  { label: "My accountant",            path: "/accounting/my-accountant", isShell: true },
] as const;

const GROUP_LABELS: Record<Exclude<AccountingSubNavItem["section"], "direct">, string> = {
  bills: "Bills",
  settlements: "Settlements",
  settings: "Settings",
};

export const SUBNAV_ITEMS: readonly AccountingSubNavItem[] = [
  { label: "Bill", path: "/accounting/bills", section: "bills" },
  { label: "Maintenance bill", path: "/accounting/bills/maintenance", section: "bills" },
  { label: "Repair bill", path: "/accounting/bills/repair", section: "bills" },
  { label: "Fuel bill", path: "/accounting/bills/fuel", section: "bills" },
  { label: "Driver bill", path: "/accounting/bills/driver", section: "bills" },
  { label: "Vendor bill", path: "/accounting/bills/vendor", section: "bills" },
  { label: "Multiple bills", path: "/accounting/bills/multiple", section: "bills" },
  { label: "Expenses", path: "/accounting/expenses", section: "direct" },
  { label: "Bill payment", path: "/accounting/bill-payments", section: "direct" },
  { label: "Maintenance & shop", path: "/accounting/maintenance-shop", section: "direct" },
  { label: "Vendors", path: "/accounting/vendors", section: "direct" },
  { label: "Customers", path: "/accounting/customers", section: "direct" },
  { label: "Reports", path: "/accounting/reports", section: "direct" },
  { label: "AR Aging", path: "/reports/ar-aging", section: "direct" },
  COLLECTIONS_SUBNAV_ITEM,
  { label: "AP Aging", path: "/reports/ap-aging", section: "direct" },
  { label: "Invoices", path: "/accounting/invoices", section: "direct" },
  { label: "Multi-entity", path: "/accounting/multi-entity", section: "direct" },
  { label: "Receive Payment", path: "/accounting/payments", section: "direct" },
  { label: "Dispute queue", path: "/accounting/dispute-queue", section: "settlements" },
  { label: "Abandonment queue", path: "/accounting/abandonment-queue", section: "settlements" },
  { label: "Factoring", path: "/accounting/factoring", section: "direct" },
  { label: "Faro CSV import", path: "/factoring/faro-import", section: "direct" },
  { label: "Factor reconciliation", path: "/accounting/factor-reconciliation", section: "direct" },
  { label: "Sales tax", path: "/accounting/sales-tax", section: "direct" },
  { label: "Month close", path: "/accounting/month-close", section: "direct" },
  { label: "Audit trail", path: "/accounting/audit-trail", section: "direct" },
  { label: "QBO sync drift", path: "/accounting/qbo-sync", section: "direct" },
  { label: "Posting lineage", path: "/accounting/posting-lineage", section: "direct" },
  { label: "Escrow", path: "/accounting/escrow", section: "direct" },
  { label: "Cash forecast", path: "/accounting/cash-forecast", section: "direct" },
  { label: "Period comparison", path: "/accounting/period-comparison", section: "direct" },
  { label: "Pre-settlements", path: "/accounting/pre-settlements", section: "direct" },
  { label: "Vendor balances", path: "/accounting/vendor-balances", section: "direct" },
  { label: "Accounts payable", path: "/accounting/accounts-payable", section: "direct" },
  { label: "Journal entries", path: "/accounting/journal-entries", section: "direct" },
  { label: "All Transactions", path: "/accounting/transactions", section: "direct" },
  { label: "Expense category map", path: "/accounting/settings/expense-category-map", section: "settings" },
  { label: "CoA roles", path: "/accounting/settings/coa-roles", section: "settings" },
] as const;

function bySection(section: AccountingSubNavItem["section"]): AccountingSubNavItem[] {
  return SUBNAV_ITEMS.filter((item) => item.section === section);
}

/** OB1 — canonical QBO-parity accounting tab bar. Rendered identically on every accounting route. */
export const ACCOUNTING_CLEAN_TABS = [
  { label: "Home",             to: "/accounting" },
  { label: "Bills",            to: "/accounting/bills" },
  { label: "Expenses",         to: "/accounting/expenses" },
  { label: "Bill Payment",     to: "/accounting/bill-payments" },
  { label: "Invoices",         to: "/accounting/invoices" },
  { label: "Receive Payment",  to: "/accounting/payments" },
  { label: "Settlements",      to: "/driver-finance/settlements" },
  { label: "Factoring",        to: "/accounting/factoring" },
  { label: "Journal Entries",  to: "/accounting/journal-entries" },
  { label: "Account Register", to: "/accounting/account-register" },
  { label: "A/P Aging",        to: "/accounting/accounts-payable" },
  { label: "All Transactions", to: "/accounting/transactions" },
  { label: "Daily Recon",      to: "/accounting/daily-recon" },
  { label: "Reports",          to: "/reports" },
] as const;

/** Back-office / operator items — shown in a "More ▾" submenu, not top-level tabs. */
export const ACCOUNTING_MORE_TABS = [
  { label: "Month Close",       to: "/accounting/month-close" },
  { label: "Multi-entity",      to: "/accounting/multi-entity" },
  { label: "Audit Trail",       to: "/accounting/audit-trail" },
  { label: "Posting Lineage",   to: "/accounting/posting-lineage" },
  { label: "QBO Sync Drift",    to: "/accounting/qbo-sync" },
  { label: "Account Type Catalog", to: "/accounting/account-type-catalog" },
  { label: "Settings",          to: "/accounting/settings/expense-category-map" },
] as const;

export const ACCOUNTING_SUB_NAV_ITEMS: readonly NavItem[] = [
  {
    label: GROUP_LABELS.bills,
    children: bySection("bills").map((item) => ({ label: item.label, href: item.path })),
  },
  {
    label: GROUP_LABELS.settlements,
    children: bySection("settlements").map((item) => ({ label: item.label, href: item.path })),
  },
  ...bySection("direct").map((item) => ({ label: item.label, href: item.path })),
  {
    label: GROUP_LABELS.settings,
    children: bySection("settings").map((item) => ({ label: item.label, href: item.path })),
  },
];
