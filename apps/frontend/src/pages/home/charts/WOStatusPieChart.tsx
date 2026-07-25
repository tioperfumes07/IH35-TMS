import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchHomeWoStatusCountsDetailed, type HomeWoLinkedEconomics, type HomeWoStatusCount } from "../../../api/home";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { formatWoStatusLabel } from "../../../lib/chartLegend";
import { formatUsdCents } from "../../../lib/money";

const STATUS_COLORS: Record<HomeWoStatusCount["status"], string> = {
  draft: "#94a3b8",
  open: "#334155",
  in_progress: "#f59e0b",
  awaiting_parts: "#64748b",
  completed: "#1A7A3C",
  cancelled: "#dc2626",
};
const UNKNOWN_STATUS_COLOR = "#64748b";

function isKnownStatus(value: unknown): value is HomeWoStatusCount["status"] {
  return (
    value === "draft" ||
    value === "open" ||
    value === "in_progress" ||
    value === "awaiting_parts" ||
    value === "completed" ||
    value === "cancelled"
  );
}

type Props = {
  operatingCompanyId: string | null | undefined;
};
type ChartStatus = HomeWoStatusCount["status"] | "unknown";

// ACCT-R-07 (0280-42-wo-to-expense-flow): footer summarizing the accounting.bills/expenses side
// of the WO-to-expense flow — the join the widget previously lacked. `unverifiable` is surfaced
// honestly (never a fabricated $0) with the named reason so a schema gap is visible, not hidden.
function LinkedEconomicsFooter({ linkedEconomics }: { linkedEconomics: HomeWoLinkedEconomics | undefined }) {
  if (!linkedEconomics) return null;
  if (linkedEconomics.status === "unverifiable") {
    return (
      <p className="mt-2 text-xs text-slate-400" title={linkedEconomics.unverifiable_reason}>
        WO → bill/expense linkage: unverifiable ({linkedEconomics.unverifiable_reason})
      </p>
    );
  }
  const { total_linked_bill_amount_cents, total_linked_expense_amount_cents, wo_with_expense_flow_count } = linkedEconomics;
  if (total_linked_bill_amount_cents === 0 && total_linked_expense_amount_cents === 0) {
    return <p className="mt-2 text-xs text-slate-500">No linked bills or expenses yet for these work orders.</p>;
  }
  return (
    <p className="mt-2 text-xs text-slate-600">
      Linked bills {formatUsdCents(total_linked_bill_amount_cents)} · linked expenses{" "}
      {formatUsdCents(total_linked_expense_amount_cents)} · {wo_with_expense_flow_count} WO
      {wo_with_expense_flow_count === 1 ? "" : "s"} with accounting activity
    </p>
  );
}

export function WOStatusPieChart({ operatingCompanyId }: Props) {
  const cid = operatingCompanyId ?? "";

  // ACCT-R-07 (0280-42-wo-to-expense-flow): single fetch returns both the WO status counts AND
  // their linked accounting.bills/accounting.expenses economics (canonical linked_work_order_uuid
  // FK join) — the widget previously showed WO counts with no visibility into whether those WOs
  // had actually produced accounting documents.
  const query = useQuery({
    queryKey: ["home", "wo-status-counts", cid],
    queryFn: () => fetchHomeWoStatusCountsDetailed(cid),
    enabled: Boolean(cid),
  });

  if (!cid) {
    return <div className="text-sm text-slate-500">Select a company to view work order status.</div>;
  }

  if (query.isLoading) {
    return <div className="h-[260px] animate-pulse rounded-sm bg-slate-100" />;
  }

  if (query.isError) {
    const { status, message } = formatQueryErrorDetail(query.error);
    return <ListErrorState title="Couldn't load WO status" status={status} message={message} onRetry={() => void query.refetch()} />;
  }

  const rows = query.data?.counts ?? [];
  const linkedEconomics = query.data?.linked_economics;
  const total = rows.reduce((s, r) => s + r.count, 0);

  if (total === 0) {
    return (
      <div className="home-recharts-print w-full">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Work orders by status</h3>
        <div className="flex h-[260px] items-center justify-center rounded-sm border border-dashed border-slate-200 text-sm text-slate-500">
          No open work orders.
        </div>
        <LinkedEconomicsFooter linkedEconomics={linkedEconomics} />
      </div>
    );
  }

  const data: Array<{ status: ChartStatus; count: number }> = rows
    .filter((r) => r.count > 0)
    .map((r) => ({
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
            formatter={(value) => {
              const count = Number(value);
              const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
              return [`${count} (${pct}%)`, "Count"];
            }}
            labelFormatter={(_, payload) => {
              const st = payload?.[0]?.payload as { status?: unknown } | undefined;
              return formatWoStatusLabel(st?.status);
            }}
          />
          <Legend verticalAlign="middle" align="right" layout="vertical" formatter={(value: string) => formatWoStatusLabel(value)} />
        </PieChart>
      </ResponsiveContainer>
      <LinkedEconomicsFooter linkedEconomics={linkedEconomics} />
    </div>
  );
}
