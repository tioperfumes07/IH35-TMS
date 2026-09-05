import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listSettlementDeductions } from "../../api/driverFinance";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { StatusBadge } from "../StatusBadge";

type Props = {
  operatingCompanyId: string;
  driverId: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

/**
 * Owner order (CC-1 item 3): "Driver Profile > Deductions: list BY DRIVER". The backend list route
 * (GET /api/v1/driver-finance/deductions?driver_id=...) and its API client fn
 * (listSettlementDeductions) already existed and already accepted driver_id — the gap was purely
 * that nothing rendered it on the driver's own profile page (the only existing consumer,
 * PendingSettlementDeductionsPanel, lives on the company-wide /drivers/deductions list and only
 * shows status=pending). This section shows the driver's most recent deductions across every
 * status (pending/partial/applied/deferred, plus voided since ACCT-F5861), matching this file's own
 * sibling reverse sections (DriverCashAdvancesReverseSection) in shape and pattern.
 */
export function DriverDeductionsReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-deductions-reverse-section",
}: Props) {
  const enabled = Boolean(operatingCompanyId) && Boolean(driverId);

  const query = useQuery({
    queryKey: ["driver-finance", "deductions", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => listSettlementDeductions(operatingCompanyId, { driver_id: driverId, limit: 10 }).then((r) => r.deductions),
    enabled,
  });

  const rows = query.data ?? [];
  const isLoading = query.isLoading;
  const isError = query.isError;

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">Deductions</h3>
        <Link
          to={`/drivers/deductions?driver_id=${encodeURIComponent(driverId)}`}
          className="text-xs font-semibold text-slate-700 underline"
          data-testid="driver-deductions-view-all"
        >
          View all
        </Link>
      </div>
      <p className="text-xs text-gray-600">Settlement deductions charged to this driver, most recent first.</p>

      {isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {isError ? <ListErrorBanner message="Failed to load deductions." onRetry={() => void query.refetch()} /> : null}
      {!isLoading && !isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No settlement deductions for this driver.</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2" data-testid="driver-deductions-list">
          {rows.map((row) => (
            <li key={row.id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-semibold text-slate-700">{row.reason?.trim() || row.deduction_type}</span>{" "}
                  <StatusBadge status={row.status} />
                  {row.load_id ? (
                    <>
                      {" · "}
                      <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
                    </>
                  ) : null}
                  {row.applied_to_settlement_id ? (
                    <>
                      {" · "}
                      <EntityLink
                        kind="settlement"
                        id={row.applied_to_settlement_id}
                        label={entityLabel(row.applied_to_settlement_display_id, row.applied_to_settlement_id, "Settlement")}
                      />
                    </>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-slate-900">
                  {formatUsdCents(row.remaining_balance_cents ?? row.amount_cents)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
