import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchHomeWoStatusCounts, type HomeWoStatusCount } from "../../../api/home";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";

const STATUS_COLORS: Record<HomeWoStatusCount["status"], string> = {
  draft: "#94a3b8",
  approved: "#3b82f6",
  in_progress: "#f59e0b",
  completed: "#1A7A3C",
  cancelled: "#dc2626",
};

type Props = {
  operatingCompanyId: string | null | undefined;
};

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
  const data = total === 0 ? [{ status: "draft" as const, count: 0 }] : rows.filter((r) => r.count > 0);

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
                key={entry.status}
                fill={total === 0 ? "#e2e8f0" : STATUS_COLORS[entry.status]}
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
              const st = payload?.[0]?.payload as HomeWoStatusCount | undefined;
              return st ? String(st.status).replace(/_/g, " ") : "";
            }}
          />
          <Legend verticalAlign="middle" align="right" layout="vertical" formatter={(value) => String(value).replace(/_/g, " ")} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
