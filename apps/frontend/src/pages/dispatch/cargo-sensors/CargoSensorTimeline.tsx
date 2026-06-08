import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type Props = {
  loadId: string;
  operatingCompanyId?: string;
};

type TimelineRow = {
  reading_at: string;
  temp_celsius: number | null;
  humidity_pct: number | null;
  threshold_status: "green" | "amber" | "red";
  out_of_range: boolean;
  door_status: "open" | "closed" | "unknown";
};

type TimelineResponse = {
  load_uuid: string;
  threshold: {
    min_temp_c: number;
    max_temp_c: number;
    min_humidity_pct: number | null;
    max_humidity_pct: number | null;
  };
  rows: TimelineRow[];
};

function formatTick(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function statusText(status: "green" | "amber" | "red") {
  if (status === "red") return "Out of range";
  if (status === "amber") return "Near edge";
  return "In range";
}

export function CargoSensorTimeline({ loadId, operatingCompanyId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = operatingCompanyId ?? selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["cargo-sensor-timeline", companyId, loadId],
    queryFn: () =>
      apiRequest<TimelineResponse>(
        `/api/v1/dispatch/cargo-sensors/load/${encodeURIComponent(loadId)}/timeline?operating_company_id=${encodeURIComponent(
          companyId
        )}&limit=240`
      ),
    enabled: Boolean(companyId && loadId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const chartData = useMemo(() => {
    const rows = query.data?.rows ?? [];
    return [...rows]
      .sort((a, b) => Date.parse(a.reading_at) - Date.parse(b.reading_at))
      .map((row) => ({
        at: formatTick(row.reading_at),
        temp_celsius: row.temp_celsius,
        humidity_pct: row.humidity_pct,
        threshold_status: row.threshold_status,
      }));
  }, [query.data?.rows]);

  const latest = query.data?.rows?.[0];

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500">Select an operating company.</div>;
  }

  if (query.isLoading) {
    return <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500">Loading cargo sensor timeline…</div>;
  }

  if (query.isError || !query.data) {
    return <div className="rounded border border-gray-200 bg-white p-3 text-sm text-red-700">Failed to load cargo sensor timeline.</div>;
  }

  if (query.data.rows.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500" data-testid="cargo-sensor-timeline-empty">
        No cargo sensor readings for this load yet.
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded border border-gray-200 bg-white p-3" data-testid="cargo-sensor-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Cargo sensor timeline</h3>
        {latest ? (
          <div className="text-xs text-gray-600">
            Latest: {statusText(latest.threshold_status)}{" "}
            {latest.temp_celsius != null ? `(${latest.temp_celsius.toFixed(1)}C)` : ""}
          </div>
        ) : null}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="at" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="temp" tick={{ fontSize: 10 }} label={{ value: "C", angle: -90, position: "insideLeft", fontSize: 10 }} />
            <YAxis yAxisId="humidity" orientation="right" tick={{ fontSize: 10 }} label={{ value: "%", angle: 90, position: "insideRight", fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine yAxisId="temp" y={query.data.threshold.min_temp_c} stroke="#f59e0b" strokeDasharray="4 4" label="Min C" />
            <ReferenceLine yAxisId="temp" y={query.data.threshold.max_temp_c} stroke="#f59e0b" strokeDasharray="4 4" label="Max C" />
            <Line yAxisId="temp" type="monotone" dataKey="temp_celsius" name="Temp C" stroke="#0284c7" strokeWidth={2} dot={false} />
            <Line yAxisId="humidity" type="monotone" dataKey="humidity_pct" name="Humidity %" stroke="#16a34a" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default CargoSensorTimeline;
