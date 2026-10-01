/** Canonical Banking module tab registry — single source for HOME quick-jump count.
 * ROUND 304 / C-64: visible subnav is 9 tabs via BANKING_SUBNAV_TAB_IDS. Statement Import +
 * Plaid Connections stay registered for never-delete deep links but are filtered from the
 * NavyPageSubNav; they open from + New (labels intentionally not exact tab-label duplicates).
 * Factoring is a summary card, not a tab. id `accounts` = Home route `/banking`. */
export const BANKING_MODULE_TABS = [
  { id: "accounts", label: "Home" },
  { id: "bank_accounts", label: "Accounts" },
  { id: "transactions", label: "Transactions" },
  { id: "link_suggestions", label: "Link suggestions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "driver_escrow", label: "Driver escrow" },
  { id: "relay_card", label: "Relay card" },
  { id: "reports", label: "Reports" },
  { id: "statement_import", label: "Statement Import" },
  { id: "plaid_connections", label: "Plaid Connections" },
  { id: "settings", label: "Settings" },
] as const;

export type BankingModuleTabId = (typeof BANKING_MODULE_TABS)[number]["id"];

/** Visible NavyPageSubNav order (C-64 board). Statement/Plaid = + New only. */
export const BANKING_SUBNAV_TAB_IDS: readonly BankingModuleTabId[] = [
  "accounts",
  "bank_accounts",
  "transactions",
  "link_suggestions",
  "reconciliation",
  "driver_escrow",
  "relay_card",
  "reports",
  "settings",
] as const;

export const BANKING_HOME_QUICK_JUMP_COUNT = BANKING_MODULE_TABS.length;
