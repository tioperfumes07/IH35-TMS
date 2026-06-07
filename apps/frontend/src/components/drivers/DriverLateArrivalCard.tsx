import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

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
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
      <div data-testid="driver-late-arrival-card" className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500">
        Loading late-arrival rate…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div data-testid="driver-late-arrival-card" className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500">
        No late-arrival data for this period.
      </div>
    );
  }

  const data = query.data;
  return (
    <div
      data-testid="driver-late-arrival-card"
      className={`rounded border p-3 ${data.chronic_offender ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Late arrival rate (30d)</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{pct(data.late_rate)}</div>
      <div className="mt-1 text-xs text-slate-600">
        {data.late_count} late of {data.total_count} stops · {data.grace_minutes}m grace
      </div>
      {data.chronic_offender ? (
        <div className="mt-2 text-xs font-medium text-amber-800">Chronic offender (&gt;20% late)</div>
      ) : null}
    </div>
  );
}
