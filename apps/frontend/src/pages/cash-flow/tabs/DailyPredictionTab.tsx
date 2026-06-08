import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Plus, BarChart2 } from "lucide-react";
import {
  getDailyPrediction,
  addCashFlowAdjustment,
  type DailyPredictionResult,
  type SevenDayEntry,
} from "../../../api/cashFlow";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = (abs / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

type Props = {
  operatingCompanyId: string;
};

export function DailyPredictionTab({ operatingCompanyId }: Props) {
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

  const handleAddSubmit = useCallback(() => {
    const trimLabel = addLabel.trim();
    const parsedCents = Math.round(parseFloat(addAmount.replace(/[^0-9.-]/g, "")) * 100);
    if (!trimLabel) { setAddError("Label is required."); return; }
    if (isNaN(parsedCents) || parsedCents === 0) { setAddError("Enter a valid dollar amount."); return; }
    setAddError(null);
    mutation.mutate({ label: trimLabel, amount_cents: parsedCents });
  }, [addLabel, addAmount, mutation]);

  const net = data?.predicted_net_cents ?? 0;
  const netPositive = net >= 0;

  return (
    <div className="space-y-4">
      {/* Date Navigator */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setDate((d) => addDays(d, -1))}
          className="flex size-8 items-center justify-center rounded hover:bg-gray-100"
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
              className="text-xs text-blue-600 hover:underline"
            >
              Back to today
            </button>
          )}
          {date === todayIso() && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Today</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate((d) => addDays(d, 1))}
          className="flex size-8 items-center justify-center rounded hover:bg-gray-100"
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
        <div className={`rounded-lg border px-4 py-3 ${netPositive ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Predicted Net</p>
          <div className="mt-1 flex items-center gap-1">
            {netPositive ? (
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )}
            <p className={`text-xl font-bold ${netPositive ? "text-emerald-700" : "text-red-700"}`}>
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
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                <div key={i} className="h-[32px] animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : data?.income_items.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <BarChart2 className="mb-2 size-8 text-gray-300" />
              <p className="text-sm text-gray-500">No deliveries scheduled for this day.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data?.income_items.map((item) => (
                <div key={item.load_id} className="flex items-start justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-900">#{item.load_number}</span>
                    <span className="ml-2 text-gray-600">{item.customer_name}</span>
                    {item.delivery_time && (
                      <span className="ml-2 text-xs text-gray-400">
                        {new Date(item.delivery_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    <span className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      item.basis === "Confirmed"
                        ? "bg-emerald-50 text-emerald-700"
                        : item.basis === "Predicted"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
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
                <div key={i} className="h-[32px] animate-pulse rounded bg-gray-100" />
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
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium mr-2 ${
                          item.kind === "driver_pay"
                            ? "bg-purple-50 text-purple-700"
                            : item.kind === "bill_due"
                            ? "bg-orange-50 text-orange-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {item.kind === "driver_pay" ? "Driver Pay" : item.kind === "bill_due" ? "Bill Due" : "Manual"}
                        </span>
                        <span className="text-gray-700">{item.label}</span>
                      </div>
                      <span className="ml-4 shrink-0 font-semibold text-gray-900">
                        {formatCents(item.amount_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* + Add bill or expense inline input */}
              <div className="border-t border-dashed border-gray-200 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  + Add bill or expense
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Label (e.g. Fuel surcharge)"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="$0.00"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    className="w-24 rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubmit}
                    disabled={mutation.isPending}
                    className="flex items-center gap-1 rounded bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#263452] disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
                {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Predicted Net Bar */}
      {!isLoading && data && (
        <div className={`flex items-center justify-between rounded-lg border px-5 py-4 ${netPositive ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <span className="text-sm font-semibold text-gray-700">Predicted net cash flow for {fmtDate(date)}</span>
          <span className={`text-2xl font-bold ${netPositive ? "text-emerald-700" : "text-red-700"}`}>
            {formatCents(net, { sign: true })}
          </span>
        </div>
      )}

      {/* 7-Day Predicted-Net Strip */}
      {!isLoading && (data?.seven_day_strip?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">7-Day Outlook</p>
          <div className="grid grid-cols-7 gap-1">
            {data?.seven_day_strip.map((entry: SevenDayEntry) => {
              const isToday = entry.date === todayIso();
              const isSelected = entry.date === date;
              const pos = entry.predicted_net_cents >= 0;
              return (
                <button
                  key={entry.date}
                  type="button"
                  onClick={() => setDate(entry.date)}
                  className={`flex flex-col items-center rounded-lg py-2 transition-colors ${
                    isSelected ? "ring-2 ring-[#1f2a44]" : "hover:bg-gray-50"
                  } ${isToday ? "bg-blue-50" : ""}`}
                >
                  <span className="text-xs text-gray-500">
                    {new Date(entry.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(entry.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                  </span>
                  <span className={`mt-1 text-xs font-bold ${pos ? "text-emerald-600" : "text-red-600"}`}>
                    {pos ? "+" : ""}
                    {(entry.predicted_net_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
