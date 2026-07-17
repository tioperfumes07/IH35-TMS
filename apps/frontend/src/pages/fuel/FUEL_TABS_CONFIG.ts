/** Canonical Fuel module sub-nav — single source for HOME quick-jump count. */
export const FUEL_SUBNAV = [
  { id: "home", label: "Home" },
  { id: "planner", label: "Planner" },
  { id: "relay_inbox", label: "Relay inbox" },
  { id: "settings", label: "Settings" },
  { id: "expense_mapping", label: "Expense mapping" },
  { id: "history", label: "History & savings" },
  { id: "loves_prices", label: "Loves prices" },
  { id: "compliance", label: "Compliance" },
] as const;

export type FuelTabId = (typeof FUEL_SUBNAV)[number]["id"];

export const FUEL_HOME_QUICK_JUMP_COUNT = FUEL_SUBNAV.length;
