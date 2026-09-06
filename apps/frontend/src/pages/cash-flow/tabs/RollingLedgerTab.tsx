import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRollingLedger, type RollingLedgerResult, type RollingLedgerRow } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { EntityLink } from "../../../components/shared/EntityLink";
import { DatePicker } from "../../../components/forms/DatePicker";

// CASH-FLOW-02 (owner order 2026-09-06 20:1xZ) part (a): read model + rows with real dates +
// carry-forward + the day grid. Part (b) (date presets/type filter/gear/export toolbar +
// overdue notifications) ships in a follow-up PR — this tab still works stand-alone with a plain
// From/To range in the meantime, never blocked on the toolbar landing first.

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL: Record<RollingLedgerRow["status"], string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
};

// §7 palette law — financial UI never uses amber/warning colors, even for an overdue signal.
const STATUS_CLASS: Record<RollingLedgerRow["status"], string> = {
  overdue: "border-slate-300 bg-slate-200 text-slate-800 font-semibold",
  due_today: "border-slate-200 bg-slate-100 text-slate-700",
  upcoming: "border-slate-200 bg-white text-slate-500",
};

type Props = {
  operatingCompanyId: string;
};

export function RollingLedgerTab({ operatingCompanyId }: Props) {
  const today = companyToday();
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(addDaysIso(today, 13));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const queryKey = ["cash-flow-rolling-ledger", operatingCompanyId, from, to];
  const { data, isLoading, isError } = useQuery<RollingLedgerResult>({
    queryKey,
    queryFn: () => getRollingLedger(operatingCompanyId, from, to),
    enabled: !!operatingCompanyId && !!from && !!to && to >= from,
  });

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!selectedDate) return data.rows;
    return data.rows.filter((r) => r.due_date === selectedDate);
  }, [data, selectedDate]);

  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0)),
    [filteredRows]
  );

  return (
    <div className="space-y-4" data-testid="cash-flow-rolling-ledger-tab">
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">From</span>
          <DatePicker value={from} onChange={setFrom} max={to} data-testid="rolling-ledger-from" aria-label="From date" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">To</span>
          <DatePicker value={to} onChange={setTo} min={from} data-testid="rolling-ledger-to" aria-label="To date" />
        </label>
        {selectedDate && (
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            data-testid="rolling-ledger-clear-date"
          >
            Showing {fmtDate(selectedDate)} only — clear
          </button>
        )}
        {data?.opening_cash_cents !== null && data?.opening_cash_cents !== undefined && (
          <span className="ml-auto text-xs text-slate-500">
            Opening cash: <span className="font-semibold text-slate-800">{formatCents(data.opening_cash_cents)}</span>
          </span>
        )}
      </div>

      {isLoading && <div className="rounded-sm border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Loading…</div>}
      {isError && (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-6 text-center text-xs text-slate-700">
          Failed to load the rolling ledger. Please try again.
        </div>
      )}

      {data && (
        <>
          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-xs" data-testid="rolling-ledger-day-grid">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Income due</th>
                  <th className="px-3 py-2 text-right font-medium">Expenses due</th>
                  <th className="px-3 py-2 text-right font-medium">Carry-over (income)</th>
                  <th className="px-3 py-2 text-right font-medium">Carry-over (expenses)</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">Running cash</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((day) => (
                  <tr
                    key={day.date}
                    onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                      day.date === today ? "bg-slate-50 font-medium" : ""
                    } ${day.date === selectedDate ? "bg-slate-100" : ""}`}
                    data-testid={`rolling-ledger-day-${day.date}`}
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {fmtDate(day.date)}
                      {day.date === today && <span className="ml-1 text-xs text-slate-400">(today)</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCents(day.income_due_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCents(day.expenses_due_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{formatCents(day.income_carry_over_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{formatCents(day.expenses_carry_over_cents)}</td>
                    <td className={`px-3 py-2 text-right ${day.net_cents < 0 ? "text-slate-800" : "text-slate-600"}`}>
                      {formatCents(day.net_cents, { sign: true })}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">
                      {day.running_cash_cents === null ? "—" : formatCents(day.running_cash_cents, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-xs" data-testid="rolling-ledger-rows-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Document</th>
                  <th className="px-3 py-2 font-medium">Counterparty</th>
                  <th className="px-3 py-2 font-medium">Origin date</th>
                  <th className="px-3 py-2 font-medium">Due date</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Days overdue</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      {selectedDate ? `No open obligations due ${fmtDate(selectedDate)}.` : "No open obligations."}
                    </td>
                  </tr>
                )}
                {sortedRows.map((row) => (
                  <tr
                    key={`${row.row_kind}-${row.document_kind}-${row.document_id}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700">
                      <span className={row.row_kind === "income" ? "text-slate-700" : "text-slate-600"}>{row.type}</span>
                    </td>
                    <td className="px-3 py-2">
                      <EntityLink kind={row.document_kind} id={row.document_id} label={row.document_label} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.counterparty}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtDate(row.origin_date)}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtDate(row.due_date)}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{formatCents(row.amount_cents)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{row.days_overdue > 0 ? row.days_overdue : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
