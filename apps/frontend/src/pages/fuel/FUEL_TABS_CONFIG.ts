/** Canonical Fuel module sub-nav — single source for HOME quick-jump count. */
export const FUEL_SUBNAV = [
  { id: "home", label: "Home" },
  { id: "planner", label: "Planner" },
  { id: "relay_inbox", label: "Relay inbox" },
  { id: "settings", label: "Settings" },
  { id: "expense_mapping", label: "Expense mapping" },
  { id: "history", label: "History & savings" },
  { id: "by_truck", label: "By truck" },
  { id: "questions", label: "Fuel questions" },
  { id: "loves_prices", label: "Loves prices" },
  { id: "compliance", label: "Compliance" },
  { id: "integrity", label: "Integrity" },
  { id: "cards", label: "Cards" },
  { id: "relay_unmatched", label: "Relay — unmatched" },
  { id: "relay_wallet", label: "Relay wallet" },
] as const;

export type FuelTabId = (typeof FUEL_SUBNAV)[number]["id"];

/** ROUND 443.282 / 443.289 — board navy sub-nav; Rule 07 keeps Planner settings + Expense mapping reachable. */
export const FUEL_BOARD_SUBNAV = [
  { id: "home", label: "Home" },
  { id: "history", label: "Fills" },
  { id: "by_truck", label: "By truck" },
  { id: "cards", label: "Cards" },
  { id: "questions", label: "Questions" },
  { id: "integrity", label: "Reconciliation" },
  { id: "settings", label: "Settings" },
  { id: "expense_mapping", label: "Expense mapping" },
] as const satisfies ReadonlyArray<{ id: FuelTabId; label: string }>;

export const FUEL_BOARD_SUBTITLE = "Fills, cards and attribution to loads";

export const FUEL_HOME_QUICK_JUMP_COUNT = FUEL_SUBNAV.length;

/** Full module tabs not on the board strip — RelatedModuleLinks only. */
export const FUEL_OFF_BOARD_TAB_IDS: FuelTabId[] = [
  "planner",
  "relay_inbox",
  "loves_prices",
  "compliance",
  "relay_unmatched",
  "relay_wallet",
];
