import { useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getActualVsProjected, type ActualVsProjectedResult, type AvpLineItem } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";

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
  const dollars = (abs / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
    <div className={`flex flex-col items-end ${zero ? "text-gray-500" : pos ? "text-emerald-700" : "text-red-700"}`}>
      <span className="font-semibold">{formatCents(variance_cents, { sign: true })}</span>
      <span className="text-xs">{formatPct(variance_pct)}</span>
    </div>
  );
}

export function ActualVsProjectedTab({ operatingCompanyId }: Props) {
  const [from, setFrom] = useState<string>(sevenDaysAgoIso());
  const [to, setTo] = useState<string>(todayIso());

  const { data, isLoading, isError } = useQuery<ActualVsProjectedResult>({
    queryKey: ["cash-flow-avp", operatingCompanyId, from, to],
    queryFn: () => getActualVsProjected(operatingCompanyId, from, to),
    enabled: !!operatingCompanyId && from <= to,
  });

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
            className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-slate-300 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          To:
          <DatePicker
            value={to}
            onChange={(next) => setTo(next)}
            className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-slate-300 focus:outline-none"
          />
        </label>
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
                <div className={`mt-1 flex items-center gap-1 text-base font-bold ${pos ? "text-emerald-700" : "text-red-700"}`}>
                  {pos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {formatCents(varCents, { sign: true })}
                  <span className="ml-1 text-sm font-medium">{formatPct(card.pct)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load data. Check your connection.
        </div>
      )}

      {/* Per-line table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Projected Income</th>
              <th className="px-4 py-3 text-right">Actual Income</th>
              <th className="px-4 py-3 text-right">Income Variance</th>
              <th className="px-4 py-3 text-right">Projected Exp.</th>
              <th className="px-4 py-3 text-right">Actual Exp.</th>
              <th className="px-4 py-3 text-right">Exp. Variance</th>
              <th className="px-4 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading &&
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && groups.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <Minus className="mx-auto mb-2 size-8 text-gray-300" />
                  <p className="text-sm text-gray-500">No data for the selected date range.</p>
                </td>
              </tr>
            )}
            {!isLoading &&
              groups.map((g) => {
                const netActual = g.net.actual_cents;
                const netPos = netActual >= 0;
                return (
                  <tr key={g.date} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {new Date(g.date + "T00:00:00Z").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCents(g.income.projected_cents)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCents(g.income.actual_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      <VarianceCell variance_cents={g.income.variance_cents} variance_pct={g.income.variance_pct} />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCents(g.expenses.projected_cents)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCents(g.expenses.actual_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      <VarianceCell variance_cents={g.expenses.variance_cents} variance_pct={g.expenses.variance_pct} />
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${netPos ? "text-emerald-700" : "text-red-700"}`}>
                      {formatCents(netActual, { sign: true })}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
