import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { companyToday, monthBoundsIso } from "../../lib/businessDate";
import { ListErrorState } from "../ListErrorState";

type LateArrivalEntityDetail = {
  entity_id: string;
  entity_label: string;
  late_count: number;
  total_count: number;
  late_rate: number;
  chronic_offender: boolean;
  grace_minutes: number;
  from: string;
  to: string;
};

function monthStart() {
  return monthBoundsIso(companyToday()).start;
}

function today() {
  return companyToday();
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function fetchDriverLateArrival(companyId: string, driverId: string) {
  const from = monthStart();
  const to = today();
  const q = new URLSearchParams({ operating_company_id: companyId, from, to });
  return apiRequest<LateArrivalEntityDetail>(
    `/api/v1/dispatch/analytics/late-arrivals/driver/${driverId}?${q.toString()}`
  );
}

type Props = {
  operatingCompanyId: string;
  driverId: string;
};

export function DriverLateArrivalCard({ operatingCompanyId, driverId }: Props) {
  const query = useQuery({
    queryKey: ["late-arrival", "driver", operatingCompanyId, driverId],
    queryFn: () => fetchDriverLateArrival(operatingCompanyId, driverId),
    enabled: Boolean(operatingCompanyId && driverId),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div data-testid="driver-late-arrival-card" className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#6B7280]">
        Loading late-arrival rate…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div data-testid="driver-late-arrival-card" className="rounded-sm border border-[#E5E7EB] bg-white p-3">
        <ListErrorState
          title="Couldn't load late-arrival rate"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div data-testid="driver-late-arrival-card" className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#6B7280]">
        No late-arrival data for this period.
      </div>
    );
  }

  const data = query.data;
  return (
    <div
      data-testid="driver-late-arrival-card"
      className={`rounded-sm border p-3 ${data.chronic_offender ? "border-[#E5E7EB] bg-[#F7F8FA]" : "border-[#E5E7EB] bg-[var(--surface-unselected)]"}`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Late arrival rate (30d)</div>
      <div className="mt-1 text-page-title font-semibold text-[#0F1219]">{pct(data.late_rate)}</div>
      <div className="mt-1 text-xs text-[#4B5563]">
        {data.late_count} late of {data.total_count} stops · {data.grace_minutes}m grace
      </div>
      {data.chronic_offender ? (
        <div className="mt-2 text-xs font-medium text-[#1F2A44]">Chronic offender (&gt;20% late)</div>
      ) : null}
    </div>
  );
}
