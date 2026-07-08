/**
 * CoA QBO-parity Account type -> Detail type cascade.
 *
 * PRESENTATION-ONLY, static, client-side (no endpoint). Source of truth for the option lists
 * is the approved screen `docs/approved-screens/preview-coa-qbo.html` (GROUPS/DETAIL vars) and
 * `docs/specs/qbo-parity/QBO_PARITY_UI_SYSTEM_v2_v3.md` A2 CoA panel spec.
 *
 * `catalogs.accounts.account_type` (db/migrations/0010_catalogs_init.sql) is a CHECK-constrained
 * 8-value enum: Asset | Liability | Equity | Income | Expense | CostOfGoodsSold | OtherIncome |
 * OtherExpense. QBO's real "Account type" picker is finer (15 values — Bank, Accounts Receivable
 * (A/R), Other Current Assets, ...). We show the finer QBO type in the UI (matches the approved
 * screen) but always resolve it down to one of the 8 valid enum values before submit — the create/
 * update API payload shape and the `catalogs.accounts` write target are UNCHANGED.
 *
 * `account_subtype` (free text, no FK) carries the QBO "Detail type" value exactly as selected —
 * also unchanged from repo convention.
 */

export type QboTypeGroupLabel = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

export type CoaAccountTypeEnum =
  | "Asset"
  | "Liability"
  | "Equity"
  | "Income"
  | "Expense"
  | "CostOfGoodsSold"
  | "OtherIncome"
  | "OtherExpense";

export type QboTypeMeta = {
  group: QboTypeGroupLabel;
  enumValue: CoaAccountTypeEnum;
  statement: "BS" | "P&L";
  normalBalance: "Debit" | "Credit";
  defaultAction: "view_register" | "run_report";
};

// Group -> ordered QBO account types (optgroup structure for the Account type <select>).
export const QBO_TYPE_GROUPS: { group: QboTypeGroupLabel; types: string[] }[] = [
  {
    group: "Asset",
    types: ["Bank", "Accounts Receivable (A/R)", "Other Current Assets", "Fixed Assets", "Other Assets"],
  },
  {
    group: "Liability",
    types: ["Credit Card", "Accounts Payable (A/P)", "Other Current Liabilities", "Long Term Liabilities"],
  },
  { group: "Equity", types: ["Equity"] },
  { group: "Income", types: ["Income", "Other Income"] },
  { group: "Expense", types: ["Cost of Goods Sold", "Expenses", "Other Expense"] },
];

// QBO account type -> Detail type options (cascades). Mirrors the approved screen's DETAIL map.
export const DETAIL_TYPES: Record<string, string[]> = {
  Bank: ["Cash on hand", "Checking", "Money Market", "Rents Held in Trust", "Savings", "Trust account"],
  "Accounts Receivable (A/R)": ["Accounts Receivable (A/R)"],
  "Other Current Assets": [
    "Employee Cash Advances",
    "Inventory",
    "Loans to Others",
    "Prepaid Expenses",
    "Undeposited Funds",
    "Other Current Assets",
  ],
  "Fixed Assets": [
    "Accumulated Depreciation",
    "Buildings",
    "Furniture & Fixtures",
    "Land",
    "Machinery & Equipment",
    "Vehicles",
    "Other fixed assets",
  ],
  "Other Assets": ["Goodwill", "Intangible Assets", "Licenses", "Security Deposits", "Other Long-term Assets"],
  "Credit Card": ["Credit Card"],
  "Accounts Payable (A/P)": ["Accounts Payable (A/P)"],
  "Other Current Liabilities": [
    "Loan Payable",
    "Payroll Tax Payable",
    "Sales Tax Payable",
    "Direct Deposit Payable",
    "Deferred Revenue",
    "Line of Credit",
    "Other Current Liabilities",
  ],
  "Long Term Liabilities": ["Notes Payable", "Other Long Term Liabilities", "Shareholder Notes Payable"],
  Equity: [
    "Opening Balance Equity",
    "Owner's Equity",
    "Retained Earnings",
    "Partner Contributions",
    "Partner Distributions",
    "Common Stock",
  ],
  Income: ["Sales of Product Income", "Service/Fee Income", "Discounts/Refunds Given", "Unapplied Cash Payment Income"],
  "Other Income": ["Interest Earned", "Dividend Income", "Other Miscellaneous Income", "Tax-Exempt Interest"],
  "Cost of Goods Sold": [
    "Cost of labor - COS",
    "Equipment Rental - COS",
    "Shipping, Freight & Delivery - COS",
    "Supplies & Materials - COGS",
    "Other Costs of Services - COS",
  ],
  Expenses: [
    "Advertising/Promotional",
    "Auto",
    "Bank Charges",
    "Communication",
    "Insurance",
    "Interest Paid",
    "Legal & Professional Fees",
    "Office/General Administrative Expenses",
    "Payroll Expenses",
    "Rent or Lease of Buildings",
    "Repair & Maintenance",
    "Taxes Paid",
    "Travel",
    "Travel Meals",
    "Utilities",
  ],
  "Other Expense": [
    "Amortization",
    "Depreciation",
    "Gas And Fuel",
    "Parking and Tolls",
    "Penalties & Settlements",
    "Vehicle",
    "Vehicle Insurance",
    "Vehicle Registration",
    "Vehicle Repairs",
    "Wash and Road Services",
    "Other Miscellaneous Expense",
  ],
};

// QBO account type -> submit metadata. The enumValue is what actually goes on the wire as
// `account_type` (still one of the 8 CHECK-constrained values on catalogs.accounts).
export const QBO_TYPE_META: Record<string, QboTypeMeta> = {
  Bank: { group: "Asset", enumValue: "Asset", statement: "BS", normalBalance: "Debit", defaultAction: "view_register" },
  "Accounts Receivable (A/R)": {
    group: "Asset",
    enumValue: "Asset",
    statement: "BS",
    normalBalance: "Debit",
    defaultAction: "view_register",
  },
  "Other Current Assets": {
    group: "Asset",
    enumValue: "Asset",
    statement: "BS",
    normalBalance: "Debit",
    defaultAction: "view_register",
  },
  "Fixed Assets": { group: "Asset", enumValue: "Asset", statement: "BS", normalBalance: "Debit", defaultAction: "view_register" },
  "Other Assets": { group: "Asset", enumValue: "Asset", statement: "BS", normalBalance: "Debit", defaultAction: "view_register" },
  "Credit Card": {
    group: "Liability",
    enumValue: "Liability",
    statement: "BS",
    normalBalance: "Credit",
    defaultAction: "view_register",
  },
  "Accounts Payable (A/P)": {
    group: "Liability",
    enumValue: "Liability",
    statement: "BS",
    normalBalance: "Credit",
    defaultAction: "view_register",
  },
  "Other Current Liabilities": {
    group: "Liability",
    enumValue: "Liability",
    statement: "BS",
    normalBalance: "Credit",
    defaultAction: "view_register",
  },
  "Long Term Liabilities": {
    group: "Liability",
    enumValue: "Liability",
    statement: "BS",
    normalBalance: "Credit",
    defaultAction: "view_register",
  },
  Equity: { group: "Equity", enumValue: "Equity", statement: "BS", normalBalance: "Credit", defaultAction: "view_register" },
  Income: { group: "Income", enumValue: "Income", statement: "P&L", normalBalance: "Credit", defaultAction: "run_report" },
  "Other Income": {
    group: "Income",
    enumValue: "OtherIncome",
    statement: "P&L",
    normalBalance: "Credit",
    defaultAction: "run_report",
  },
  "Cost of Goods Sold": {
    group: "Expense",
    enumValue: "CostOfGoodsSold",
    statement: "P&L",
    normalBalance: "Debit",
    defaultAction: "run_report",
  },
  Expenses: { group: "Expense", enumValue: "Expense", statement: "P&L", normalBalance: "Debit", defaultAction: "run_report" },
  "Other Expense": {
    group: "Expense",
    enumValue: "OtherExpense",
    statement: "P&L",
    normalBalance: "Debit",
    defaultAction: "run_report",
  },
};

/** First QBO fine type belonging to a given coarse `account_type` enum value (stable default). */
export function defaultQboTypeForEnum(enumValue: string): string | null {
  for (const group of QBO_TYPE_GROUPS) {
    for (const type of group.types) {
      if (QBO_TYPE_META[type]?.enumValue === enumValue) return type;
    }
  }
  return null;
}

/**
 * Reverse-lookup: given the persisted coarse enum + free-text detail (account_subtype), find the
 * QBO fine type whose Detail-type list contains that text (so editing an existing account
 * pre-selects the right Account type in the two-tier picker). Falls back to the enum's default type.
 */
export function findQboTypeForDetail(enumValue: string, detailText: string | null | undefined): string | null {
  if (detailText && detailText.trim()) {
    for (const [type, details] of Object.entries(DETAIL_TYPES)) {
      if (QBO_TYPE_META[type]?.enumValue !== enumValue) continue;
      if (details.includes(detailText.trim())) return type;
    }
  }
  return defaultQboTypeForEnum(enumValue);
}

export const GROUP_DISPLAY_LABELS: Record<QboTypeGroupLabel, string> = {
  Asset: "Assets",
  Liability: "Liabilities",
  Equity: "Equity",
  Income: "Income",
  Expense: "Expenses",
};
