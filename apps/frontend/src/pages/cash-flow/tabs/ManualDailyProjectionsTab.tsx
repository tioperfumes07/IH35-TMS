import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listForecastEntries,
  createForecastEntry,
  updateForecastEntry,
  deleteForecastEntry,
  getForecastOpeningBalance,
  putForecastOpeningBalance,
  type ForecastEntry,
  type ForecastRefKind,
} from "../../../api/forecast";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";

function fmtCents(c: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((c || 0) / 100);
}

const REF_KINDS: ForecastRefKind[] = ["account", "unit", "driver", "truck", "trailer"];

type Direction = "income" | "expense";

type RowForm = {
  id: string | null;
  entry_date: string;
  amount_cents: number | null;
  party_name: string;
  invoice_no: string;
  category: string;
  memo: string;
  ref_kind: "" | ForecastRefKind;
  ref_label: string;
};

const emptyRow = (): RowForm => ({
  id: null,
  entry_date: "",
  amount_cents: null,
  party_name: "",
  invoice_no: "",
  category: "",
  memo: "",
  ref_kind: "",
  ref_label: "",
});

function ProjectionPanel({
  direction,
  title,
  entries,
  operatingCompanyId,
  onChanged,
}: {
  direction: Direction;
  title: string;
  entries: ForecastEntry[];
  operatingCompanyId: string;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<RowForm>(emptyRow());
  const [error, setError] = useState<string | null>(null);
  const accent = direction === "income" ? "text-emerald-700" : "text-red-700";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.entry_date) throw new Error("Date is required");
      const cents = form.amount_cents ?? 0;
      if (cents < 0) throw new Error("Amount must be ≥ 0");
      const payload = {
        operating_company_id: operatingCompanyId,
        entry_date: form.entry_date,
        direction,
        amount_cents: cents,
        party_name: form.party_name || null,
        invoice_no: form.invoice_no || null,
        category: form.category || null,
        memo: form.memo || null,
        ref_kind: form.ref_kind || null,
        ref_label: form.ref_label || null,
      };
      if (form.id) await updateForecastEntry(form.id, payload);
      else await createForecastEntry(payload);
    },
    onSuccess: () => {
      setForm(emptyRow());
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteForecastEntry(id, operatingCompanyId),
    onSuccess: onChanged,
  });

  const editRow = (e: ForecastEntry) =>
    setForm({
      id: e.id,
      entry_date: e.entry_date,
      amount_cents: e.amount_cents,
      party_name: e.party_name ?? "",
      invoice_no: e.invoice_no ?? "",
      category: e.category ?? "",
      memo: e.memo ?? "",
      ref_kind: e.ref_kind ?? "",
      ref_label: e.ref_label ?? "",
    });

  const total = entries.reduce((s, e) => s + e.amount_cents, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className={`text-sm font-semibold ${accent}`}>{fmtCents(total)}</span>
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-gray-400">No {direction} lines yet.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <span className="w-20 shrink-0 text-gray-500">{e.entry_date}</span>
              <span className="min-w-0 flex-1 truncate">{e.party_name || e.category || "—"}</span>
              <span className={`shrink-0 font-semibold ${accent}`}>{fmtCents(e.amount_cents)}</span>
              <button type="button" className="shrink-0 text-slate-600 hover:underline" onClick={() => editRow(e)}>Edit</button>
              <button type="button" className="shrink-0 text-red-600 hover:underline" onClick={() => deleteMutation.mutate(e.id)}>Del</button>
            </div>
          ))}
        </div>
      )}

      {/* Inline add / edit row */}
      <div className="space-y-1.5 border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs">
        <div className="grid grid-cols-2 gap-1.5">
          <DatePicker value={form.entry_date} onChange={(v) => setForm({ ...form, entry_date: v })} placeholder="Date" />
          <MoneyInput valueCents={form.amount_cents} onChangeCents={(c) => setForm({ ...form, amount_cents: c })} placeholder="Amount" ariaLabel="Amount" />
          <input placeholder="Party" className="h-7 rounded border border-gray-300 px-2" value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} />
          <input placeholder="Invoice #" className="h-7 rounded border border-gray-300 px-2" value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
          <input placeholder="Category" className="h-7 rounded border border-gray-300 px-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <select className="h-7 rounded border border-gray-300 px-2" value={form.ref_kind} onChange={(e) => setForm({ ...form, ref_kind: e.target.value as RowForm["ref_kind"] })}>
            <option value="">Link (none)</option>
            {REF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input placeholder="Link label" className="h-7 rounded border border-gray-300 px-2" value={form.ref_label} onChange={(e) => setForm({ ...form, ref_label: e.target.value })} />
          <input placeholder="Memo" className="h-7 rounded border border-gray-300 px-2" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
        {error ? <p className="text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {form.id ? (
            <button type="button" className="h-7 rounded border border-gray-300 bg-white px-2 hover:bg-gray-50" onClick={() => setForm(emptyRow())}>Cancel</button>
          ) : null}
          <button type="button" className="h-7 rounded bg-slate-700 px-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-50" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {form.id ? "Save" : `+ Add ${direction}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualDailyProjectionsTab({ operatingCompanyId }: { operatingCompanyId: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openingDraft, setOpeningDraft] = useState<number | null>(null);

  const entriesQuery = useQuery({
    queryKey: ["forecast", "entries", operatingCompanyId, from || "all", to || "all"],
    queryFn: () => listForecastEntries(operatingCompanyId, from || undefined, to || undefined),
    enabled: Boolean(operatingCompanyId),
  });
  const openingQuery = useQuery({
    queryKey: ["forecast", "opening", operatingCompanyId],
    queryFn: () => getForecastOpeningBalance(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const openingMutation = useMutation({
    mutationFn: () => putForecastOpeningBalance({ operating_company_id: operatingCompanyId, amount_cents: openingDraft ?? 0 }),
    onSuccess: () => {
      setOpeningDraft(null);
      void qc.invalidateQueries({ queryKey: ["forecast", "opening", operatingCompanyId] });
    },
  });

  const onChanged = () => void qc.invalidateQueries({ queryKey: ["forecast", "entries", operatingCompanyId] });

  const entries = useMemo(() => entriesQuery.data?.entries ?? [], [entriesQuery.data?.entries]);
  const income = useMemo(() => entries.filter((e) => e.direction === "income"), [entries]);
  const expense = useMemo(() => entries.filter((e) => e.direction === "expense"), [entries]);
  const totalIncome = income.reduce((s, e) => s + e.amount_cents, 0);
  const totalExpense = expense.reduce((s, e) => s + e.amount_cents, 0);
  const net = totalIncome - totalExpense;
  const openingCents = openingQuery.data?.amount_cents ?? 0;
  const projectedClosing = openingCents + net;
  const netPositive = net >= 0;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Expected Income</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">{fmtCents(totalIncome)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Expected Expenses</p>
          <p className="mt-1 text-lg font-semibold text-red-700">{fmtCents(totalExpense)}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${netPositive ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Predicted Net</p>
          <p className={`mt-1 text-lg font-semibold ${netPositive ? "text-emerald-700" : "text-red-700"}`}>{fmtCents(net)}</p>
        </div>
      </div>

      {/* Opening → Projected closing + opening editor */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        <span>Opening cash: <strong>{fmtCents(openingCents)}</strong></span>
        <span>
          Projected closing:{" "}
          <strong className={projectedClosing < 0 ? "text-red-700" : "text-gray-900"}>{fmtCents(projectedClosing)}</strong>
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <MoneyInput valueCents={openingDraft} onChangeCents={setOpeningDraft} placeholder="Set opening" ariaLabel="Opening cash" className="w-32" />
          <button type="button" className="h-7 rounded border border-gray-300 bg-white px-2 font-semibold hover:bg-gray-50" disabled={openingMutation.isPending || openingDraft === null} onClick={() => openingMutation.mutate()}>Save</button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs">
        <label className="font-semibold text-gray-600">From</label>
        <DatePicker value={from} onChange={setFrom} className="w-36" placeholder="From date" />
        <label className="font-semibold text-gray-600">To</label>
        <DatePicker value={to} onChange={setTo} className="w-36" placeholder="To date" />
        {(from || to) && (
          <button type="button" className="h-7 rounded border border-gray-300 bg-white px-2 hover:bg-gray-50" onClick={() => { setFrom(""); setTo(""); }}>Clear</button>
        )}
      </div>

      {/* Income (left) / Expenses (right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectionPanel direction="income" title="Expected Income" entries={income} operatingCompanyId={operatingCompanyId} onChanged={onChanged} />
        <ProjectionPanel direction="expense" title="Expected Expenses" entries={expense} operatingCompanyId={operatingCompanyId} onChanged={onChanged} />
      </div>
    </div>
  );
}
