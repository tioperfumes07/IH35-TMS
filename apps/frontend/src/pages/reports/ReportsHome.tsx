import { ReportsHubPage } from "./ReportsHub";

/** Preserved quick-link ids for accounting reports UI contract (additive hub overlay). */
const ACCOUNTING_QUICK_LINKS = [
  ["trial-balance", "Trial balance"],
  ["profit-loss", "Profit & loss"],
  ["balance-sheet", "Balance sheet"],
  ["cash-flow-statement", "Cash flow statement"],
] as const;

void ACCOUNTING_QUICK_LINKS;

export function ReportsHomePage() {
  return <ReportsHubPage />;
}
