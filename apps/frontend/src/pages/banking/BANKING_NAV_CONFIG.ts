/** Canonical Banking module tab registry — single source for HOME quick-jump count. */
export const BANKING_MODULE_TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "transactions", label: "Transactions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "factoring", label: "Factoring (Faro)" },
  { id: "driver_escrow", label: "Driver Escrow" },
  { id: "relay_card", label: "Relay Card" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const;

export type BankingModuleTabId = (typeof BANKING_MODULE_TABS)[number]["id"];

export const BANKING_HOME_QUICK_JUMP_COUNT = BANKING_MODULE_TABS.length;
