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
import { sumCents, toCents, computeProjectionTotals } from "./manualProjectionMath";

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

// MDP-SINGLE-ROW (Phase 7) — each projection line is ONE horizontal row:
//   income  → Unit no. (ref_label) · Invoice customer (party_name) · Total (amount_cents)
//   expense → Vendor/Driver (party_name) · Expense (category) · Total (amount_cents)
// The legacy fields (Invoice #, Category for income, Memo, Link/Link label) are NOT removed —
// ADDITIVE-ONLY — they move behind an optional "more" expander so the default row is the 3 fields
// Jorge named. The entry_date comes from the tab's single Projection date (no From/To range).
function ProjectionPanel({
  direction,
  title,
  entries,
  operatingCompanyId,
  projectionDate,
  onChanged,
}: {
  direction: Direction;
  title: string;
  entries: ForecastEntry[];
  operatingCompanyId: string;
  projectionDate: string;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<RowForm>(emptyRow());
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = direction === "income" ? "text-emerald-700" : "text-red-700";

  // Field 1 label per direction (income = Unit no., expense = Vendor/Driver).
  const field1Label = direction === "income" ? "Unit no." : "Vendor/Driver";
  const field2Label = direction === "income" ? "Invoice customer" : "Expense";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entryDate = form.entry_date || projectionDate;
      if (!entryDate) throw new Error("Pick a Projection date first");
      const cents = form.amount_cents ?? 0;
      if (cents < 0) throw new Error("Total must be ≥ 0");
      // income: Unit no. -> ref_label (ref_kind 'unit'); customer -> party_name.
      // expense: Vendor/Driver -> party_name; Expense -> category.
      const refKind: "" | ForecastRefKind =
        direction === "income" && form.ref_label && !form.ref_kind ? "unit" : form.ref_kind;
      const payload = {
        operating_company_id: operatingCompanyId,
        entry_date: entryDate,
        direction,
        amount_cents: cents,
        party_name: form.party_name || null,
        invoice_no: form.invoice_no || null,
        category: form.category || null,
        memo: form.memo || null,
        ref_kind: refKind || null,
        ref_label: form.ref_label || null,
      };
      if (form.id) await updateForecastEntry(form.id, payload);
      else await createForecastEntry(payload);
    },
    onSuccess: () => {
      setForm(emptyRow());
      setShowMore(false);
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteForecastEntry(id, operatingCompanyId),
    onSuccess: onChanged,
  });

  const editRow = (e: ForecastEntry) => {
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
    setShowMore(Boolean(e.invoice_no || e.memo || (direction === "income" ? e.category : e.ref_label)));
  };

  // Per-direction display of the saved row's first two columns.
  const rowCol1 = (e: ForecastEntry) => (direction === "income" ? e.ref_label : e.party_name) || "—";
  const rowCol2 = (e: ForecastEntry) => (direction === "income" ? e.party_name : e.category) || "—";

  const total = sumCents(entries);
  const field1Value = direction === "income" ? form.ref_label : form.party_name;
  const field2Value = direction === "income" ? form.party_name : form.category;
  const setField1 = (v: string) => setForm(direction === "income" ? { ...form, ref_label: v } : { ...form, party_name: v });
  const setField2 = (v: string) => setForm(direction === "income" ? { ...form, party_name: v } : { ...form, category: v });

  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-mdp-panel={direction}>
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className={`text-sm font-semibold ${accent}`}>{fmtCents(total)}</span>
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-gray-400">No {direction} lines yet.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {/* Column headers (the 3 named fields). */}
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            <span className="w-28 shrink-0">{field1Label}</span>
            <span className="min-w-0 flex-1">{field2Label}</span>
            <span className="w-24 shrink-0 text-right">Total</span>
            <span className="w-16 shrink-0" />
          </div>
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs" data-mdp-row={direction}>
              <span className="w-28 shrink-0 truncate font-medium text-gray-700" title={rowCol1(e)}>{rowCol1(e)}</span>
              <span className="min-w-0 flex-1 truncate" title={rowCol2(e)}>{rowCol2(e)}</span>
              <span className={`w-24 shrink-0 text-right font-semibold ${accent}`}>{fmtCents(e.amount_cents)}</span>
              <span className="flex w-16 shrink-0 justify-end gap-2">
                <button type="button" className="text-slate-600 hover:underline" onClick={() => editRow(e)}>Edit</button>
                <button type="button" className="text-red-600 hover:underline" onClick={() => deleteMutation.mutate(e.id)}>Del</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Single horizontal add / edit row: the 3 named fields, then optional "more". */}
      <div className="space-y-1.5 border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <input
            placeholder={field1Label}
            aria-label={field1Label}
            className="h-7 w-28 shrink-0 rounded border border-gray-300 px-2"
            value={field1Value}
            onChange={(e) => setField1(e.target.value)}
          />
          <input
            placeholder={field2Label}
            aria-label={field2Label}
            className="h-7 min-w-0 flex-1 rounded border border-gray-300 px-2"
            value={field2Value}
            onChange={(e) => setField2(e.target.value)}
          />
          <MoneyInput valueCents={form.amount_cents} onChangeCents={(c) => setForm({ ...form, amount_cents: c })} placeholder="Total" ariaLabel="Total" className="w-24 shrink-0" />
        </div>

        <button type="button" className="text-[11px] text-slate-500 hover:underline" onClick={() => setShowMore((v) => !v)}>
          {showMore ? "− less" : "+ more"}
        </button>

        {showMore ? (
          // Legacy fields preserved (ADDITIVE-ONLY), tucked behind the expander. For income the
          // unit IS the ref (Unit no. above), so income's "more" exposes Category instead of a
          // separate Link; expense exposes the optional Link (kind + label).
          <div className="grid grid-cols-2 gap-1.5 border-t border-gray-100 pt-1.5">
            <input placeholder="Invoice #" className="h-7 rounded border border-gray-300 px-2" value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
            {direction === "income" ? (
              <input placeholder="Category" className="h-7 rounded border border-gray-300 px-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            ) : (
              <>
                <select className="h-7 rounded border border-gray-300 px-2" value={form.ref_kind} onChange={(e) => setForm({ ...form, ref_kind: e.target.value as RowForm["ref_kind"] })}>
                  <option value="">Link (none)</option>
                  {REF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input placeholder="Link label" className="h-7 rounded border border-gray-300 px-2" value={form.ref_label} onChange={(e) => setForm({ ...form, ref_label: e.target.value })} />
              </>
            )}
            <input placeholder="Memo" className="col-span-2 h-7 rounded border border-gray-300 px-2" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </div>
        ) : null}

        {error ? <p className="text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {form.id ? (
            <button type="button" className="h-7 rounded border border-gray-300 bg-white px-2 hover:bg-gray-50" onClick={() => { setForm(emptyRow()); setShowMore(false); }}>Cancel</button>
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
  // MDP-SINGLE-ROW: ONE projection date (daily projections — one day per entry), not a From/To
  // range. It is the default entry_date for new rows on both panels.
  const [projectionDate, setProjectionDate] = useState("");
  const [openingDraft, setOpeningDraft] = useState<number | null>(null);

  const entriesQuery = useQuery({
    queryKey: ["forecast", "entries", operatingCompanyId],
    queryFn: () => listForecastEntries(operatingCompanyId),
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
  // Totals math is UNCHANGED (#1084 summing fix preserved).
  const { incomeCents: totalIncome, expenseCents: totalExpense, netCents: net } = computeProjectionTotals(entries);
  const openingCents = toCents(openingQuery.data?.amount_cents);
  const projectedClosing = openingCents + net;
  const netPositive = net >= 0;

  return (
    <div className="space-y-4">
      {/* KPI cards (kept). */}
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

      {/* Opening → Projected closing + opening editor (kept). */}
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

      {/* SINGLE projection date (replaces the From/To range). */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs" data-mdp-single-date="true">
        <label className="font-semibold text-gray-600">Projection date</label>
        <DatePicker value={projectionDate} onChange={setProjectionDate} className="w-40" placeholder="Pick a day" />
        <span className="text-gray-400">— one day per entry; applies to rows you add below.</span>
      </div>

      {/* Income (left) / Expenses (right). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectionPanel direction="income" title="Expected Income" entries={income} operatingCompanyId={operatingCompanyId} projectionDate={projectionDate} onChanged={onChanged} />
        <ProjectionPanel direction="expense" title="Expected Expenses" entries={expense} operatingCompanyId={operatingCompanyId} projectionDate={projectionDate} onChanged={onChanged} />
      </div>
    </div>
  );
}
