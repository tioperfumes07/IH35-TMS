/** Canonical Banking module tab registry — single source for HOME quick-jump count.
 * ROUND 304 / C-64 (owner-accepted board): 9 tabs — Home · Accounts · Transactions ·
 * Link suggestions · Reconciliation · Driver escrow · Relay card · Reports · Settings.
 * Statement Import + Plaid Connections are + New menu only (paths kept on BANKING_TAB_PATH).
 * Factoring is a summary card, not a tab. id `accounts` stays the Home route (`/banking`). */
export const BANKING_MODULE_TABS = [
  { id: "accounts", label: "Home" },
  { id: "bank_accounts", label: "Accounts" },
  { id: "transactions", label: "Transactions" },
  { id: "link_suggestions", label: "Link suggestions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "driver_escrow", label: "Driver escrow" },
  { id: "relay_card", label: "Relay card" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const;

export type BankingModuleTabId = (typeof BANKING_MODULE_TABS)[number]["id"];

/** Legacy panel ids still routable via + New / deep links (not module tabs). */
export type BankingLegacyPanelId = "statement_import" | "plaid_connections";

export const BANKING_HOME_QUICK_JUMP_COUNT = BANKING_MODULE_TABS.length;
