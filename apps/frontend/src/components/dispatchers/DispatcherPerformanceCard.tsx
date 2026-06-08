import React from "react";
import { useQuery } from "@tanstack/react-query";

interface DispatcherGapStats {
  dispatcher_id: string | null;
  dispatcher_label: string;
  loads_counted: number;
  avg_gap_hours: number;
  p50_gap_hours: number;
  p90_gap_hours: number;
  rank: number;
}

interface Props {
  dispatcherId: string;
  operatingCompanyId: string;
}

export function DispatcherPerformanceCard({ dispatcherId, operatingCompanyId }: Props) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data } = useQuery<DispatcherGapStats | null>({
    queryKey: ["booking-gap-dispatcher", dispatcherId, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/dispatch/analytics/booking-gap/dispatcher/${encodeURIComponent(dispatcherId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}&from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: DispatcherGapStats };
      return json.data ?? null;
    },
    enabled: !!dispatcherId && !!operatingCompanyId,
  });

  if (!data) return null;

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Booking Gap (Last 30 Days)</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {data.avg_gap_hours?.toFixed(1) ?? "—"}
          </div>
          <div className="text-xs text-gray-500">Avg hours</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {data.p50_gap_hours?.toFixed(1) ?? "—"}
          </div>
          <div className="text-xs text-gray-500">P50 hours</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">#{data.rank ?? "—"}</div>
          <div className="text-xs text-gray-500">Rank</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-400">Based on {data.loads_counted ?? 0} loads</div>
    </div>
  );
}
