import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listSettlementDeductions } from "../../api/driverFinance";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { EntityLink } from "../../components/shared/EntityLink";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";

/**
 * FAIL-DD2 — pending rows from driver_finance.driver_settlement_deductions.
 * Auto-deduction policies are a different table; without this panel a $100 cash-advance
 * recovery stays invisible on /drivers/deductions while the ledger row is correct.
 */
export function PendingSettlementDeductionsPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [searchParams] = useSearchParams();
  const driverIdFilter = searchParams.get("driver_id") ?? undefined;

  const query = useQuery({
    queryKey: ["driver-finance", "settlement-deductions", selectedCompanyId, driverIdFilter],
    queryFn: () =>
      listSettlementDeductions(selectedCompanyId!, {
        driver_id: driverIdFilter,
        // Open recoveries only — applied/voided stay out of the working queue.
        status: "pending",
        limit: 200,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data?.deductions ?? [];

  if (!selectedCompanyId) {
    return <p className="px-2 py-2 text-xs text-gray-500">Select an operating company to view pending deductions.</p>;
  }

  return (
    <div data-testid="drivers-pending-settlement-deductions">
      <DataPanel title="Pending settlement deductions" accentColor={colors.crit.strong}>
        {query.isLoading ? <p className="px-2 py-2 text-xs text-gray-500">Loading…</p> : null}
        {query.isError ? (
          <p className="px-2 py-2 text-xs text-red-700">Could not load pending deductions.</p>
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <p className="px-2 py-2 text-xs text-gray-500">No pending settlement deductions.</p>
        ) : null}
        {rows.map((row) => (
          <DataPanelRow key={row.id}>
            <span className="min-w-0">
              <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
              {" · "}
              <span className="text-slate-700">{row.reason?.trim() || row.deduction_type}</span>{" "}
              <StatusBadge status={row.status} />
            </span>
            <span className="shrink-0 font-semibold text-red-700">
              {formatUsdCents(row.remaining_balance_cents ?? row.amount_cents)}
            </span>
          </DataPanelRow>
        ))}
      </DataPanel>
    </div>
  );
}
