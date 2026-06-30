import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchHomeFleetUtilization } from "../../../api/home";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";

/** @internal Exported for unit tests (threshold colors + print-safe grays). */
export function gaugeFillForUtilization(pct: number): { active: string; rest: string } {
  if (pct < 50) return { active: "#dc2626", rest: "#e5e7eb" };
  if (pct <= 75) return { active: "#ca8a04", rest: "#e5e7eb" };
  return { active: "#1A7A3C", rest: "#e5e7eb" };
}

type Props = {
  operatingCompanyId: string | null | undefined;
};

export function FleetUtilizationGauge({ operatingCompanyId }: Props) {
  const cid = operatingCompanyId ?? "";

  const query = useQuery({
    queryKey: ["home", "fleet-utilization", cid],
    queryFn: () => fetchHomeFleetUtilization(cid),
    enabled: Boolean(cid),
  });

  if (!cid) {
    return <div className="text-sm text-slate-500">Select a company to view fleet utilization.</div>;
  }

  if (query.isLoading) {
    return <div className="h-[260px] animate-pulse rounded bg-slate-100" />;
  }

  if (query.isError) {
    const { status, message } = formatQueryErrorDetail(query.error);
    return (
      <ListErrorState title="Couldn't load fleet utilization" status={status} message={message} onRetry={() => void query.refetch()} />
    );
  }

  const d = query.data ?? { active_units: 0, total_units: 0, percentage: 0 };

  if (Number(d.total_units) <= 0) {
    return (
      <div className="home-recharts-print w-full">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Fleet utilization</h3>
        <div className="flex h-[260px] items-center justify-center rounded border border-dashed border-slate-200 text-sm text-slate-500">
          No active units for this company.
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, Number(d.percentage) || 0));
  const rest = Math.max(0, 100 - pct);
  const { active: fillActive, rest: fillRest } = gaugeFillForUtilization(pct);
  const pieData = [
    { name: "active", value: pct },
    { name: "idle", value: rest },
  ];

  return (
    <div className="home-recharts-print relative w-full">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Fleet utilization</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={68} outerRadius={92} startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={fillActive} />
            <Cell fill={fillRest} />
          </Pie>
          <Tooltip formatter={(v: number, name: string) => [`${v}%`, name === "active" ? "Utilized" : "Available capacity"]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-7 text-center">
        <div className="text-2xl font-bold tabular-nums text-slate-900">{pct.toFixed(1)}%</div>
        <div className="text-xs text-slate-600">
          {d.active_units} / {d.total_units} units
        </div>
      </div>
    </div>
  );
}
