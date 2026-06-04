import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchHomeWoStatusCounts, type HomeWoStatusCount } from "../../../api/home";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { formatWoStatusLabel } from "../../../lib/chartLegend";

const STATUS_COLORS: Record<HomeWoStatusCount["status"], string> = {
  draft: "#94a3b8",
  approved: "#3b82f6",
  in_progress: "#f59e0b",
  completed: "#1A7A3C",
  cancelled: "#dc2626",
};
const UNKNOWN_STATUS_COLOR = "#64748b";

function isKnownStatus(value: unknown): value is HomeWoStatusCount["status"] {
  return value === "draft" || value === "approved" || value === "in_progress" || value === "completed" || value === "cancelled";
}

type Props = {
  operatingCompanyId: string | null | undefined;
};
type ChartStatus = HomeWoStatusCount["status"] | "unknown";

export function WOStatusPieChart({ operatingCompanyId }: Props) {
  const cid = operatingCompanyId ?? "";

  const query = useQuery({
    queryKey: ["home", "wo-status-counts", cid],
    queryFn: () => fetchHomeWoStatusCounts(cid),
    enabled: Boolean(cid),
  });

  if (!cid) {
    return <div className="text-sm text-slate-500">Select a company to view work order status.</div>;
  }

  if (query.isLoading) {
    return <div className="h-[260px] animate-pulse rounded bg-slate-100" />;
  }

  if (query.isError) {
    const { status, message } = formatQueryErrorDetail(query.error);
    return <ListErrorState title="Couldn't load WO status" status={status} message={message} onRetry={() => void query.refetch()} />;
  }

  const rows = query.data ?? [];
  const total = rows.reduce((s, r) => s + r.count, 0);
  const data: Array<{ status: ChartStatus; count: number }> =
    total === 0
      ? [{ status: "unknown", count: 0 }]
      : rows.filter((r) => r.count > 0).map((r) => ({
          status: isKnownStatus((r as { status?: unknown }).status) ? r.status : "unknown",
          count: r.count,
        }));

  return (
    <div className="home-recharts-print w-full">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Work orders by status</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            cx="40%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell
                key={`${entry.status}-${entry.count}`}
                fill={total === 0 ? "#e2e8f0" : isKnownStatus(entry.status) ? STATUS_COLORS[entry.status] : UNKNOWN_STATUS_COLOR}
                stroke="#fff"
                strokeWidth={1}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => {
              const count = Number(value);
              const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
              return [`${count} (${pct}%)`, "Count"];
            }}
            labelFormatter={(_, payload) => {
              const st = payload?.[0]?.payload as { status?: unknown } | undefined;
              return formatWoStatusLabel(st?.status);
            }}
          />
          <Legend verticalAlign="middle" align="right" layout="vertical" formatter={(value) => formatWoStatusLabel(value)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
