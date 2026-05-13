import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchHomeWeeklyRevenue } from "../../../api/home";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { formatUsdFromCents } from "../HomeKpiCard";

const LINE_COLOR = "var(--green, #1A7A3C)";

type Props = {
  operatingCompanyId: string | null | undefined;
};

export function WeeklyRevenueChart({ operatingCompanyId }: Props) {
  const cid = operatingCompanyId ?? "";

  const query = useQuery({
    queryKey: ["home", "weekly-revenue", cid],
    queryFn: () => fetchHomeWeeklyRevenue(cid, 7),
    enabled: Boolean(cid),
  });

  if (!cid) {
    return <div className="text-sm text-slate-500">Select a company to view weekly revenue.</div>;
  }

  if (query.isLoading) {
    return <div className="h-[240px] animate-pulse rounded bg-slate-100" />;
  }

  if (query.isError) {
    const { status, message } = formatQueryErrorDetail(query.error);
    return <ListErrorState title="Couldn't load weekly revenue" status={status} message={message} onRetry={() => void query.refetch()} />;
  }

  const data = (query.data ?? []).map((row) => ({
    ...row,
    label: row.date.replace(/^\d{4}-(\d{2})-(\d{2})$/, "$2/$1"),
    revenue_dollars: row.revenue_cents / 100,
  }));

  return (
    <div className="home-recharts-print w-full">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Weekly revenue</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="#64748b"
            tickFormatter={(v) =>
              new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(v))
            }
          />
          <Tooltip
            formatter={(value: number) => [formatUsdFromCents(Math.round(value * 100)), "Revenue"]}
            labelFormatter={(l) => `Day ${l}`}
          />
          <Line type="monotone" dataKey="revenue_dollars" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
