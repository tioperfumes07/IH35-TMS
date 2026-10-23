/**
 * ROUND 443.280-A — Settlements-Deductions board REPLACES the page body.
 * Does NOT mount DriversPage (no Drivers header, 7 KpiCards, DRIVERS_SUBNAV,
 * PendingSettlementDeductionsPanel, or AutoDeductionPoliciesPanel under the board).
 * Board body = KPI strip + By-type Escrow/Advances/Fines/Damages + Schedule + New deduction
 * (SettlementsDeductionsKpiRow — already board-faithful).
 */
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { SettlementsDeductionsKpiRow } from "../drivers/SettlementsDeductionsKpiRow";

export function SettlementsDeductionsBoard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-3" data-testid="settlements-deductions-board" data-settlements-deductions-rebuild="1">
      <PageHeader
        title="Driver Settlements"
        subtitle="List + detail settlement workflow"
        breadcrumb={["Driver Finance", "Deductions"]}
        actions={
          <Button
            size="sm"
            data-testid="settlements-deductions-creator"
            onClick={() => navigate("/driver-finance/settlements?creator=1")}
          >
            + Settlement Creator
          </Button>
        }
      />
      <SettlementsDeductionsKpiRow basePath="/driver-finance/deductions" />
    </div>
  );
}
