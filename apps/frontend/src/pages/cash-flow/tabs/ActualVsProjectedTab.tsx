import { useState } from "react";
import { localDateFromIso } from "../../../lib/businessDate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { getActualVsProjected, type ActualVsProjectedResult, type AvpLineItem } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";

// CASHFLOW-1: range must end on the company business date (Central), not the UTC date — otherwise the
// "To" defaults to tomorrow after ~7 PM Central. See lib/businessDate.
function todayIso(): string {
  return companyToday();
}

function sevenDaysAgoIso(): string {
  return addDaysIso(companyToday(), -7);
}

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents > 0) return `+${dollars}`;
  if (opts?.sign && cents < 0) return `−${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

type Props = {
  operatingCompanyId: string;
};

type RowGroup = {
  date: string;
  income: AvpLineItem;
  expenses: AvpLineItem;
  net: AvpLineItem;
};

function groupByDate(lines: AvpLineItem[]): RowGroup[] {
  const map = new Map<string, Partial<RowGroup>>();
  for (const line of lines) {
    const g = map.get(line.date) ?? {};
    if (line.category === "income") g.income = line;
    else if (line.category === "expenses") g.expenses = line;
    else if (line.category === "net") g.net = line;
    g.date = line.date;
    map.set(line.date, g);
  }
  return Array.from(map.values())
    .filter((g): g is RowGroup => !!g.date && !!g.income && !!g.expenses && !!g.net)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function VarianceCell({ variance_cents, variance_pct }: { variance_cents: number; variance_pct: number | null }) {
  const pos = variance_cents > 0;
  const zero = variance_cents === 0;
  return (
    <div className={`flex flex-col items-end ${zero ? "text-gray-500" : pos ? "text-slate-700" : "text-red-700"}`}>
      <span className="font-semibold">{formatCents(variance_cents, { sign: true })}</span>
      <span className="text-xs">{formatPct(variance_pct)}</span>
    </div>
  );
}

// Column order/formatting preserved 1:1 from the former hand-rolled table markup (display-only migration).
const COLUMNS: Array<ParityColumn<RowGroup>> = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    className: "text-left",
    render: (g) => (
      <span className="font-medium text-gray-900">
        {localDateFromIso(g.date).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </span>
    ),
  },
  {
    key: "projected_income",
    label: "Projected Income",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.income.projected_cents,
    render: (g) => <span className="text-gray-700">{formatCents(g.income.projected_cents)}</span>,
  },
  {
    key: "actual_income",
    label: "Actual Income",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.income.actual_cents,
    render: (g) => <span className="text-gray-700">{formatCents(g.income.actual_cents)}</span>,
  },
  {
    key: "income_variance",
    label: "Income Variance",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.income.variance_cents,
    render: (g) => <VarianceCell variance_cents={g.income.variance_cents} variance_pct={g.income.variance_pct} />,
  },
  {
    key: "projected_expenses",
    label: "Projected Exp.",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.expenses.projected_cents,
    render: (g) => <span className="text-gray-700">{formatCents(g.expenses.projected_cents)}</span>,
  },
  {
    key: "actual_expenses",
    label: "Actual Exp.",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.expenses.actual_cents,
    render: (g) => <span className="text-gray-700">{formatCents(g.expenses.actual_cents)}</span>,
  },
  {
    key: "expense_variance",
    label: "Exp. Variance",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.expenses.variance_cents,
    render: (g) => <VarianceCell variance_cents={g.expenses.variance_cents} variance_pct={g.expenses.variance_pct} />,
  },
  {
    key: "net",
    label: "Net",
    sortable: true,
    className: "text-right",
    sortValue: (g) => g.net.actual_cents,
    render: (g) => (
      <span className={`font-bold ${g.net.actual_cents >= 0 ? "text-slate-700" : "text-red-700"}`}>
        {formatCents(g.net.actual_cents, { sign: true })}
      </span>
    ),
  },
];

export function ActualVsProjectedTab({ operatingCompanyId }: Props) {
  // CLS-FILTER-GEAR-APPLY — DatePicker drafts; query only after Apply.
  const [from, setFrom] = useState<string>(sevenDaysAgoIso());
  const [to, setTo] = useState<string>(todayIso());
  const [appliedFrom, setAppliedFrom] = useState<string>(sevenDaysAgoIso());
  const [appliedTo, setAppliedTo] = useState<string>(todayIso());

  const avpQ = useQuery<ActualVsProjectedResult>({
    queryKey: ["cash-flow-avp", operatingCompanyId, appliedFrom, appliedTo],
    queryFn: () => getActualVsProjected(operatingCompanyId, appliedFrom, appliedTo),
    enabled: !!operatingCompanyId && appliedFrom <= appliedTo,
  });
  const { data, isLoading, isError } = avpQ;

  const groups = data ? groupByDate(data.lines) : [];
  const acc = data?.accuracy_summary;

  return (
    <div className="space-y-4">
      {/* Date Range Picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          From:
          <DatePicker
            value={from}
            onChange={(next) => setFrom(next)}
            className=""
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          To:
          <DatePicker
            value={to}
            onChange={(next) => setTo(next)}
            className=""
          />
        </label>
        <button
          type="button"
          className="h-9 rounded-sm border border-gray-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50"
          onClick={() => {
            setAppliedFrom(from);
            setAppliedTo(to);
          }}
          disabled={from === appliedFrom && to === appliedTo}
        >
          Apply
        </button>
        {from > to && (
          <span className="text-xs text-red-600">From date must be before or equal to To date.</span>
        )}
      </div>

      {/* Accuracy Summary */}
      {!isLoading && acc && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              label: "Income Accuracy",
              projected: acc.total_projected_income_cents,
              actual: acc.total_actual_income_cents,
              pct: acc.income_variance_pct,
            },
            {
              label: "Expense Accuracy",
              projected: acc.total_projected_expense_cents,
              actual: acc.total_actual_expense_cents,
              pct: acc.expense_variance_pct,
            },
            {
              label: "Net Variance",
              projected: acc.total_projected_income_cents - acc.total_projected_expense_cents,
              actual: acc.total_actual_income_cents - acc.total_actual_expense_cents,
              pct: acc.income_variance_pct,
            },
          ].map((card) => {
            const varCents = card.actual - card.projected;
            const pos = varCents >= 0;
            return (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Proj: <strong>{formatCents(card.projected)}</strong>
                  </span>
                  <span className="text-sm text-gray-600">
                    Act: <strong>{formatCents(card.actual)}</strong>
                  </span>
                </div>
                <div className={`mt-1 flex items-center gap-1 text-base font-bold ${pos ? "text-slate-700" : "text-red-700"}`}>
                  {pos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {formatCents(varCents, { sign: true })}
                  <span className="ml-1 text-sm font-medium">{formatPct(card.pct)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-line table */}
      {isError ? (
        <ListErrorState
          title="Couldn't load actual vs projected data"
          status={0}
          message={(avpQ.error as Error)?.message}
          onRetry={() => void avpQ.refetch()}
        />
      ) : (
        <ParityTable
          columns={COLUMNS}
          rows={groups}
          rowKey={(g) => g.date}
          loading={isLoading}
          emptyText="No data for the selected date range."
          storageKey="cash-flow-avp"
          tableTestId="cash-flow-avp-table"
        />
      )}
    </div>
  );
}
