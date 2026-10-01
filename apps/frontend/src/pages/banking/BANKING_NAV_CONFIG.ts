/** Canonical Banking module tab registry — single source for HOME quick-jump count.
 * ROUND 304 / C-64 (owner-accepted board): visible subnav is 9 tabs — Home · Accounts ·
 * Transactions · Link suggestions · Reconciliation · Driver escrow · Relay card · Reports ·
 * Settings. Statement Import + Plaid Connections stay in this registry for never-delete deep
 * links / + New only (filtered from NavyPageSubNav via BANKING_SUBNAV_TAB_IDS). Factoring is a
 * summary card, not a tab. id `accounts` stays the Home route (`/banking`). */
export const BANKING_MODULE_TABS = [
  { id: "accounts", label: "Home" },
  { id: "bank_accounts", label: "Accounts" },
  { id: "transactions", label: "Transactions" },
  { id: "link_suggestions", label: "Link suggestions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "driver_escrow", label: "Driver escrow" },
  { id: "relay_card", label: "Relay card" },
  { id: "reports", label: "Reports" },
  // C-64 — reachable from + New and deep links; not shown in the module subnav.
  { id: "statement_import", label: "Statement Import" },
  { id: "plaid_connections", label: "Plaid Connections" },
  { id: "settings", label: "Settings" },
] as const;

export type BankingModuleTabId = (typeof BANKING_MODULE_TABS)[number]["id"];

/** Tabs rendered in NavyPageSubNav (C-64 board order). Statement/Plaid are + New only. */
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
