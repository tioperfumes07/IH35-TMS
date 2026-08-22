import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { entityLabel } from "../../lib/entity-label";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import { listCashAdvances } from "../../api/cashAdvances";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  operatingCompanyId: string;
  driverId: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

function money(cents: unknown) {
  const n = Number(cents ?? 0);
  return `$${n.toFixed(2)}`;
}

/**
 * LINK-F5171/LINK-F5185 (settlements:cash_advances, settlements:drawer.advance_detail,
 * settlements:modal.mark_disbursed) — driver_finance.cash_advance_requests.driver_id and
 * views.cash_advances_with_context.driver_id are both real FKs; both backend list endpoints
 * already accept a driver_id filter (cash-advances.routes.ts's did before this change, the
 * pending-requests one did not), but neither had a reverse section anywhere on the driver's own
 * profile.
 *
 * Disbursed advance rows link via kind="cash_advance" -> /cash-advances?advance_id=<id>, which
 * CashAdvancesHome.tsx already opens as AdvanceDetailDrawer with an onMarkDisbursed handler wired
 * to MarkDisbursedModal -- so reaching a specific advance also reaches Mark Disbursed, closing
 * settlements:drawer.advance_detail and settlements:modal.mark_disbursed at the same root cause.
 */
export function DriverCashAdvancesReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-cash-advances-reverse-section",
}: Props) {
  const enabled = Boolean(operatingCompanyId) && Boolean(driverId);

  const pendingQuery = useQuery({
    queryKey: ["cash-advance-requests", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => cashAdvanceRequestsOfficeApi.listPending(operatingCompanyId, driverId),
    enabled,
  });

  const advancesQuery = useQuery({
    queryKey: ["cash-advances", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => listCashAdvances(operatingCompanyId, { driver_id: driverId }).then((r) => r.advances),
    enabled,
  });

  const pending = pendingQuery.data?.requests ?? [];
  const advances = (advancesQuery.data ?? []).slice(0, 5);
  const isLoading = pendingQuery.isLoading || advancesQuery.isLoading;
  const pendingFailed = pendingQuery.isError;
  const advancesFailed = advancesQuery.isError;
  const total = pending.length + (advancesQuery.data?.length ?? 0);

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Cash advances</h3>
        <Link
          to={`/driver-finance/cash-advance-requests?driver_id=${encodeURIComponent(driverId)}`}
          className="text-xs font-semibold text-slate-700 underline"
          data-testid="driver-cash-advances-view-requests"
        >
          Open Pending Requests
        </Link>
      </div>
      <p className="text-sm text-gray-600">Pending requests and disbursed cash advances for this driver.</p>

      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {pendingFailed ? <p className="text-sm text-red-600">Failed to load pending requests.</p> : null}
      {advancesFailed ? <p className="text-sm text-red-600">Failed to load cash advances.</p> : null}
      {!isLoading && !pendingFailed && !advancesFailed && total === 0 ? (
        <p className="text-sm text-gray-500">No pending requests or cash advances for this driver.</p>
      ) : null}

      {pending.length > 0 ? (
        <div data-testid="driver-cash-advance-requests-pending">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending requests</h4>
          <ul className="mt-1 space-y-2">
            {pending.map((r) => {
              const id = String((r as Record<string, unknown>).id ?? "");
              return (
                <li key={id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                  <EntityLink
                    kind="cash_advance_request"
                    id={id}
                    label={entityLabel((r as Record<string, unknown>).display_id as string | null, id, "Request")}
                    className="font-semibold text-slate-700"
                  />
                  <span className="ml-2 text-gray-600">
                    {money((r as Record<string, unknown>).requested_amount_cents)} — {String((r as Record<string, unknown>).status ?? "pending")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {advances.length > 0 ? (
        <div data-testid="driver-cash-advances-disbursed">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Advances</h4>
            <Link
              to={`/cash-advances?driver_id=${encodeURIComponent(driverId)}`}
              className="text-xs font-semibold text-slate-700 underline"
              data-testid="driver-cash-advances-view-all"
            >
              View all
            </Link>
          </div>
          <ul className="mt-1 space-y-2">
            {advances.map((a) => {
              const id = String((a as Record<string, unknown>).id ?? "");
              const row = a as Record<string, unknown>;
              return (
                <li key={id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                  <EntityLink
                    kind="cash_advance"
                    id={id}
                    label={entityLabel(row.display_id as string | null, id, "Advance")}
                    className="font-semibold text-slate-700"
                  />
                  <span className="ml-2 text-gray-600">
                    {money(row.amount)} — {String(row.disbursement_status ?? "pending_approval")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
