/**
 * ROUND 443.280-A — Settlements-Deductions board REPLACES the page body.
 * Does NOT mount DriversPage (no Drivers header, 7 KpiCards, DRIVERS_SUBNAV,
 * PendingSettlementDeductionsPanel, or AutoDeductionPoliciesPanel under the board).
 * Board body = KPI strip + By-type Escrow/Advances/Fines/Damages + Schedule + New deduction
 * (SettlementsDeductionsKpiRow — already board-faithful).
 */
import { SettlementsDeductionsKpiRow } from "../drivers/SettlementsDeductionsKpiRow";

/** Board body only — chrome is SettlementsModuleShell / SettlementsSubNavWrapper (443.326). */
export function SettlementsDeductionsBoard() {
  return (
    <div className="space-y-3" data-testid="settlements-deductions-board" data-settlements-deductions-rebuild="1">
      <SettlementsDeductionsKpiRow basePath="/driver-finance/deductions" />
    </div>
  );
}
