import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Plus, BarChart2 } from "lucide-react";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import {
  getDailyPrediction,
  addCashFlowAdjustment,
  type DailyPredictionResult,
  type SevenDayEntry,
} from "../../../api/cashFlow";
import { addDaysIso, companyToday, localDateFromIso } from "../../../lib/businessDate";
import { formatUsdCents } from "../../../lib/money";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

function fmtDate(iso: string): string {
  return localDateFromIso(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// CASHFLOW-1: "today" must be the company business date (America/Chicago), NOT the UTC date —
// after ~7 PM Central UTC is already tomorrow, so the cash-position page was fetching tomorrow's
// prediction and hiding today's real expected revenue. See lib/businessDate.
function todayIso(): string {
  return companyToday();
}

function addDays(iso: string, delta: number): string {
  return addDaysIso(iso, delta);
}

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

// DEFECT (punchlist #194): the 7-Day Outlook strip has 7 fixed columns in a narrow card; a full
// "$1,234.56" figure overflows/wraps at that width. Abbreviate to whole-dollar "$1.2k" here (the
// strip is a directional glance, not a source-of-truth figure — the exact amount is still available
// via the day's own KPI row and the title tooltip below).
function formatCompactUsd(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : cents > 0 ? "+" : "";
  if (dollars >= 10000) return `${sign}$${Math.round(dollars / 1000)}k`;
  if (dollars >= 1000) return `${sign}$${(dollars / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(dollars)}`;
}

type Props = {
  operatingCompanyId: string;
};

export function DailyPredictionTab({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(todayIso());
  const [addLabel, setAddLabel] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const queryKey = ["cash-flow-daily", operatingCompanyId, date];

  const { data, isLoading, isError } = useQuery<DailyPredictionResult>({
    queryKey,
    queryFn: () => getDailyPrediction(operatingCompanyId, date),
    enabled: !!operatingCompanyId,
  });

  const mutation = useMutation({
    mutationFn: (payload: { label: string; amount_cents: number }) =>
      addCashFlowAdjustment({
        operating_company_id: operatingCompanyId,
        entry_date: date,
        label: payload.label,
        amount_cents: payload.amount_cents,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setAddLabel("");
      setAddAmount("");
      setAddError(null);
    },
    onError: () => {
      setAddError("Failed to save. Please try again.");
    },
  });

  const adjustmentReady = useMemo(() => {
    const trimLabel = addLabel.trim();
    if (!trimLabel) return false;
    const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
    if (!Number.isFinite(parsedCents) || parsedCents === 0) return false;
    if (mutation.isPending) return false;
    return true;
  }, [addLabel, addAmount, mutation.isPending]);

  const handleAddSubmit = useCallback(() => {
    if (!adjustmentReady) {
      const trimLabel = addLabel.trim();
      const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
      if (!trimLabel) { setAddError("Label is required."); return; }
      if (!Number.isFinite(parsedCents) || parsedCents === 0) {
        setAddError("Enter a valid nonzero dollar amount.");
        return;
      }
      return;
    }
    const trimLabel = addLabel.trim();
    const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
    setAddError(null);
    mutation.mutate({ label: trimLabel, amount_cents: parsedCents });
  }, [addLabel, addAmount, adjustmentReady, mutation]);

  const net = data?.predicted_net_cents ?? 0;
  const netPositive = net >= 0;

  return (
    <div className="space-y-4">
      {/* Date Navigator */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setDate((d) => addDays(d, -1))}
          className="flex size-8 items-center justify-center rounded-sm hover:bg-gray-100"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-semibold text-gray-900">{fmtDate(date)}</span>
          {date !== todayIso() && (
            <button
              type="button"
              onClick={() => setDate(todayIso())}
              className="text-xs text-slate-700 hover:underline"
            >
              Back to today
            </button>
          )}
          {date === todayIso() && (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Today</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate((d) => addDays(d, 1))}
          className="flex size-8 items-center justify-center rounded-sm hover:bg-gray-100"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Expected Income</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {isLoading ? "—" : formatCents(data?.income_subtotal_cents ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Expected Expenses</p>
          <p className="mt-1 text-xl font-bold text-gray-900">
            {isLoading ? "—" : formatCents(data?.expense_subtotal_cents ?? 0)}
          </p>
        </div>
        {/* PUNCHLIST #71: card background is neutral (§7 palette lock — emerald/red backgrounds are
            reserved off-palette); the sign-based color stays on the icon + amount TEXT only. */}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Predicted Net</p>
          <div className="mt-1 flex items-center gap-1">
            {netPositive ? (
              <TrendingUp className="h-5 w-5 text-slate-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )}
            <p className={`text-xl font-bold ${netPositive ? "text-slate-700" : "text-red-700"}`}>
              {isLoading ? "—" : formatCents(net, { sign: true })}
            </p>
          </div>
        </div>
      </div>

      {/* Opening / Closing Balance */}
      {!isLoading && data && (data.opening_cash_cents !== null || data.projected_closing_cash_cents !== null) && (
        <div className="flex gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <span className="text-gray-600">
            Opening cash:{" "}
            <strong className="text-gray-900">
              {data.opening_cash_cents !== null ? formatCents(data.opening_cash_cents) : "—"}
            </strong>
          </span>
          <span className="text-gray-400">→</span>
          <span className="text-gray-600">
            Projected closing:{" "}
            <strong className={data.projected_closing_cash_cents !== null && data.projected_closing_cash_cents < 0 ? "text-red-700" : "text-gray-900"}>
              {data.projected_closing_cash_cents !== null ? formatCents(data.projected_closing_cash_cents) : "—"}
            </strong>
          </span>
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load prediction. Check your connection and try again.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Income Panel */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Expected Income</h3>
            <span className="text-sm font-bold text-gray-700">
              {isLoading ? "—" : formatCents(data?.income_subtotal_cents ?? 0)}
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[32px] animate-pulse rounded-sm bg-gray-100" />
              ))}
            </div>
          ) : data?.income_items.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <BarChart2 className="mb-2 size-8 text-gray-300" />
              <p className="text-sm text-gray-500">No deliveries scheduled for this day.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* DEFECT: rows showed the load number/customer as inert text with no way to drill
                  into the load — the load_id is already returned by the API, it just wasn't wired
                  to a link. Same pattern as ExpensesListPage.tsx (`navigate('/dispatch/loads/${id}')`). */}
              {data?.income_items.map((item) => (
                <div
                  key={item.load_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dispatch/loads/${item.load_id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") navigate(`/dispatch/loads/${item.load_id}`);
                  }}
                  className="flex cursor-pointer items-start justify-between px-4 py-2.5 text-sm hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <EntityLinkOrTombstone
                      kind="load"
                      id={item.load_id}
                      name={item.load_number}
                      noun="Load"
                      className="font-medium text-gray-900"
                      data-testid="cash-flow-predicted-load-link"
                      onClick={(event) => event.stopPropagation()}
                    />
                    {item.customer_id ? (
                      <EntityLinkOrTombstone
                        kind="customer"
                        id={item.customer_id}
                        name={item.customer_name}
                        noun="Customer"
                        className="ml-2 text-gray-600 hover:underline"
                        data-testid="cash-flow-predicted-customer-link"
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span className="ml-2 text-gray-600">{entityLabel(item.customer_name, null, "Customer")}</span>
                    )}
                    {item.delivery_time && (
                      <span className="ml-2 text-xs text-gray-400">
                        {new Date(item.delivery_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    <span className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      item.basis === "Confirmed"
                        ? "bg-slate-100 text-slate-700"
                        : item.basis === "Predicted"
                        ? "bg-slate-100 text-slate-700"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                      {item.basis}
                    </span>
                  </div>
                  <span className="ml-4 shrink-0 font-semibold text-gray-900">
                    {formatCents(item.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses Panel */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Expected Expenses</h3>
            <span className="text-sm font-bold text-gray-700">
              {isLoading ? "—" : formatCents(data?.expense_subtotal_cents ?? 0)}
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[32px] animate-pulse rounded-sm bg-gray-100" />
              ))}
            </div>
          ) : (
            <>
              {data?.expense_items.length === 0 && (
                <div className="flex flex-col items-center py-6 text-center">
                  <Minus className="mb-2 size-8 text-gray-300" />
                  <p className="text-sm text-gray-500">No expenses for this day yet.</p>
                </div>
              )}
              {(data?.expense_items.length ?? 0) > 0 && (
                <div className="divide-y divide-gray-50">
                  {data?.expense_items.map((item, idx) => (
                    <div key={item.adjustment_id ?? item.load_id ?? idx} className="flex items-start justify-between px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        {/* PUNCHLIST #70: 'Bill Due' pill recolored off-palette orange -> slate. */}
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium mr-2 ${
                          item.kind === "driver_pay"
                            ? "bg-slate-100 text-slate-700"
                            : item.kind === "bill_due"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {item.kind === "driver_pay" ? "Driver Pay" : item.kind === "bill_due" ? "Bill Due" : "Manual"}
                        </span>
                        {item.load_id ? (
                          <EntityLinkOrTombstone
                            kind="load"
                            id={item.load_id}
                            name={item.label}
                            noun="Load"
                            className="text-gray-700 hover:underline"
                            data-testid="cash-flow-predicted-expense-load-link"
                          />
                        ) : item.settlement_id ? (
                          // LINK-F5187 (cash-flow:tab.daily_prediction) -- driver-pay rows without
                          // a first_load_id still have a real settlement to drill into.
                          <EntityLinkOrTombstone
                            kind="settlement"
                            id={item.settlement_id}
                            name={item.label}
                            noun="Settlement"
                            className="text-gray-700 hover:underline"
                            data-testid="cash-flow-predicted-expense-settlement-link"
                          />
                        ) : item.bill_id ? (
                          // LINK-F5187 (cash-flow:tab.daily_prediction) -- bill_due rows have a
                          // real accounting.bills id.
                          <EntityLinkOrTombstone
                            kind="bill"
                            id={item.bill_id}
                            name={item.label}
                            noun="Bill"
                            className="text-gray-700 hover:underline"
                            data-testid="cash-flow-predicted-expense-bill-link"
                          />
                        ) : (
                          <span className="text-gray-700">{item.label}</span>
                        )}
                      </div>
                      <span className="ml-4 shrink-0 font-semibold text-gray-900">
                        {formatCents(item.amount_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Projection-only cash-flow adjustment (does NOT create accounting bill/expense). */}
              <div className="border-t border-dashed border-gray-200 px-4 py-3" data-testid="cash-flow-adjustment-create">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Add cash-flow adjustment
                </p>
                <p className="mb-2 text-[11px] text-gray-500">
                  Projection only — does not create an accounting bill or expense.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Label (e.g. Fuel surcharge)"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className="flex-1 rounded-sm border border-gray-200 px-2 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
                  />
                  {/* M-1: dollars-mode; seam Math.round(parseFloat(addAmount...)*100)=amount_cents byte-for-byte. */}
                  <MoneyInput
                    valueDollars={addAmount ? Number(addAmount.replace(/[^0-9.-]/g, "")) || null : null}
                    onChangeDollars={(d) => setAddAmount(d == null ? "" : String(d))}
                    ariaLabel="Projection amount (USD)"
                    className="w-24"
                  />
                  {/* CLS-CHROME-LAW-8: icon-+ plus text "Add" reads as the forbidden "+ Add"
                      pattern — relabeled to "Create" (adjustment-line-add pattern, same class as
                      InvoiceDetailPage's "+ Create Line"). */}
                  <button
                    type="button"
                    onClick={handleAddSubmit}
                    disabled={!adjustmentReady}
                    data-testid="cash-flow-adjustment-add"
                    className="flex items-center gap-1 rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#263452] disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    Create
                  </button>
                </div>
                {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Predicted Net Bar — PUNCHLIST #71: neutral background, sign-color kept on the amount text only. */}
      {!isLoading && data && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4">
          <span className="text-sm font-semibold text-gray-700">Predicted net cash flow for {fmtDate(date)}</span>
          <span className={`text-2xl font-bold ${netPositive ? "text-slate-700" : "text-red-700"}`}>
            {formatCents(net, { sign: true })}
          </span>
        </div>
      )}

      {/* 7-Day Predicted-Net Strip — ORPH-004 / AUD-F016: single outer section frame with flat
          divide-x day cells (no nested rounded-lg tiles inside the bordered card). PUNCHLIST #194:
          compact whole-dollar format + horizontal scroll so wide values never clip. */}
      {!isLoading && (data?.seven_day_strip?.length ?? 0) > 0 && (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">7-Day Outlook</p>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[420px] grid-cols-7 divide-x divide-gray-100">
              {data?.seven_day_strip.map((entry: SevenDayEntry) => {
                const isToday = entry.date === todayIso();
                const isSelected = entry.date === date;
                const pos = entry.predicted_net_cents >= 0;
                return (
                  <button
                    key={entry.date}
                    type="button"
                    onClick={() => setDate(entry.date)}
                    title={`${pos ? "+" : ""}${formatUsdCents(entry.predicted_net_cents)}`}
                    className={`flex flex-col items-center py-2 transition-colors ${
                      isSelected ? "bg-slate-100" : isToday ? "bg-gray-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xs text-gray-500">
                      {localDateFromIso(entry.date).toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span className="text-xs text-gray-400">
                      {localDateFromIso(entry.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                    </span>
                    <span className={`mt-1 text-xs font-bold ${pos ? "text-slate-600" : "text-red-600"}`}>
                      {formatCompactUsd(entry.predicted_net_cents)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
