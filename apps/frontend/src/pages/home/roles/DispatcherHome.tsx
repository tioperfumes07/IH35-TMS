/**
 * GAP-66 — DispatcherHome
 *
 * Dispatcher-specific home view: active loads, pending detention approvals,
 * booking gap analytics. Rendered by HomePage when auth.role === "Dispatcher".
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthMeResponse } from "../../../types/api";
import { apiRequest } from "../../../api/client";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  DispatcherActiveLoadsPanel,
  type DispatcherActiveLoadRow,
} from "../../../components/home/DispatcherActiveLoadsPanel";
import { DispatcherKpiBar } from "../../../components/home/DispatcherKpiBar";
import { DispatcherPendingActionsPanel } from "../../../components/home/DispatcherPendingActionsPanel";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type DispatcherHomeData = {
  generated_at: string;
  kpis: {
    active_loads: number;
    late_loads: number;
    today_pickups: number;
    today_deliveries: number;
  };
  active_loads: DispatcherActiveLoadRow[];
  pending_actions: {
    detention_approvals: number;
    incoming_message_queue: number;
    booking_gap_open: number;
  };
  booking_gap_analytics: {
    loads_booked_7d: number;
    unresolved_dispatch_gaps_7d: number;
    exception_loads_7d: number;
    gap_rate_pct: number;
  };
};

type Props = {
  auth: AuthMeResponse["user"];
};

function buildPath(companyId?: string | null) {
  if (!companyId) return "/api/v1/dispatcher-board/home";
  return `/api/v1/dispatcher-board/home?operating_company_id=${encodeURIComponent(companyId)}`;
}

export function DispatcherHome({ auth }: Props) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const dispatcherLabel = auth.email ?? "Dispatcher";
  const homeQuery = useQuery({
    queryKey: ["dispatcher-home", selectedCompanyId],
    queryFn: () => apiRequest<DispatcherHomeData>(buildPath(selectedCompanyId)),
  });

  const data = homeQuery.data;

  return (
    <div data-testid="dispatcher-home-view" className="flex flex-col gap-4">
      <PageHeader
        title="Dispatcher Home"
        subtitle={`Live queue snapshot for ${dispatcherLabel}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["dispatcher-home"] });
              void homeQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />

      <DispatcherKpiBar
        activeLoads={data?.kpis.active_loads ?? 0}
        lateLoads={data?.kpis.late_loads ?? 0}
        todayPickups={data?.kpis.today_pickups ?? 0}
        todayDeliveries={data?.kpis.today_deliveries ?? 0}
      />

      <DispatcherActiveLoadsPanel
        rows={data?.active_loads ?? []}
        isLoading={homeQuery.isLoading}
        isError={homeQuery.isError}
        onRetry={() => {
          void homeQuery.refetch();
        }}
      />

      {homeQuery.isError ? (
        <section className="rounded border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          Unable to load dispatcher queue details. Retry once backend route is available.
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DispatcherPendingActionsPanel
            detentionApprovals={data?.pending_actions.detention_approvals ?? 0}
            incomingMessageQueue={data?.pending_actions.incoming_message_queue ?? 0}
            bookingGapOpen={data?.pending_actions.booking_gap_open ?? 0}
          />
          <section data-testid="dispatcher-booking-gap-panel" className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">
              Booking gap analytics (7d)
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
                <div className="text-xs text-slate-500">Booked loads</div>
                <div className="text-xl font-semibold text-slate-900">{data?.booking_gap_analytics.loads_booked_7d ?? 0}</div>
              </div>
              <div className="rounded border border-red-200 bg-red-50 px-2 py-2">
                <div className="text-xs text-red-700">Open gaps</div>
                <div className="text-xl font-semibold text-red-900">
                  {data?.booking_gap_analytics.unresolved_dispatch_gaps_7d ?? 0}
                </div>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2">
                <div className="text-xs text-amber-700">Exceptions</div>
                <div className="text-xl font-semibold text-amber-900">{data?.booking_gap_analytics.exception_loads_7d ?? 0}</div>
              </div>
              <div className="rounded border border-slate-300 bg-slate-100 px-2 py-2">
                <div className="text-xs text-slate-700">Gap rate</div>
                <div className="text-xl font-semibold text-slate-700">{data?.booking_gap_analytics.gap_rate_pct ?? 0}%</div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
