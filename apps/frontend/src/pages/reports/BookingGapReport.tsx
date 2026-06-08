import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface DispatcherStats {
  dispatcher_id: string | null;
  dispatcher_label: string;
  loads_counted: number;
  avg_gap_hours: number;
  p50_gap_hours: number;
  p90_gap_hours: number;
  rank: number;
}

type Period = "week" | "month" | "quarter";

function periodDates(p: Period): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  const days = p === "week" ? 7 : p === "month" ? 30 : 90;
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function rowColor(rank: number, total: number): string {
  if (total < 2) return "";
  if (rank === 1) return "bg-green-50";
  if (rank === total) return "bg-amber-50"; // amber — no public shaming
  return "";
}

export function BookingGapReport() {
  const [operatingCompanyId] = useState(
    () => sessionStorage.getItem("operating_company_id") ?? ""
  );
  const [period, setPeriod] = useState<Period>("week");
  const { from, to } = periodDates(period);

  const { data, isLoading } = useQuery<{ data: { dispatchers: DispatcherStats[] } }>({
    queryKey: ["booking-gap", operatingCompanyId, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/dispatch/analytics/booking-gap?operating_company_id=${encodeURIComponent(operatingCompanyId)}&from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load booking gap report");
      return res.json() as Promise<{ data: { dispatchers: DispatcherStats[] } }>;
    },
    enabled: !!operatingCompanyId,
  });

  const dispatchers = data?.data?.dispatchers ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Dispatcher Booking Gap</h1>
        <div className="flex gap-2">
          {(["week", "month", "quarter"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded capitalize ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Average time between load delivery and next truck assignment. Lower is better (driver stays
        productive). Excludes gaps &gt;24h (weekends/planned downtime).
      </p>

      {isLoading && <p className="text-gray-400">Loading...</p>}

      {!isLoading && dispatchers.length === 0 && (
        <p className="text-gray-400">No data available for this period.</p>
      )}

      {dispatchers.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 border-b">Rank</th>
              <th className="text-left px-3 py-2 border-b">Dispatcher</th>
              <th className="text-right px-3 py-2 border-b">Loads</th>
              <th className="text-right px-3 py-2 border-b">Avg Gap (h)</th>
              <th className="text-right px-3 py-2 border-b">P50 (h)</th>
              <th className="text-right px-3 py-2 border-b">P90 (h)</th>
            </tr>
          </thead>
          <tbody>
            {dispatchers.map((d) => (
              <tr
                key={d.dispatcher_id ?? d.dispatcher_label}
                className={`border-b ${rowColor(d.rank, dispatchers.length)}`}
              >
                <td className="px-3 py-2 font-medium">#{d.rank}</td>
                <td className="px-3 py-2">{d.dispatcher_label}</td>
                <td className="px-3 py-2 text-right">{d.loads_counted}</td>
                <td className="px-3 py-2 text-right">{d.avg_gap_hours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">{d.p50_gap_hours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">{d.p90_gap_hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

export default BookingGapReport;
