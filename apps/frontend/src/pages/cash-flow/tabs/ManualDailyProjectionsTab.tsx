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

function fmtCents(c: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((c || 0) / 100);
}

const REF_KINDS: ForecastRefKind[] = ["account", "unit", "driver", "truck", "trailer"];

type FormState = {
  id: string | null;
  entry_date: string;
  direction: "income" | "expense";
  amount: string;
  party_name: string;
  invoice_no: string;
  category: string;
  memo: string;
  ref_kind: "" | ForecastRefKind;
  ref_label: string;
  ref_external_id: string;
};

const emptyForm = (): FormState => ({
  id: null,
  entry_date: "",
  direction: "income",
  amount: "",
  party_name: "",
  invoice_no: "",
  category: "",
  memo: "",
  ref_kind: "",
  ref_label: "",
  ref_external_id: "",
});

export function ManualDailyProjectionsTab({ operatingCompanyId }: { operatingCompanyId: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [openingInput, setOpeningInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const entriesKey = ["forecast", "entries", operatingCompanyId, from || "all", to || "all"];
  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: () => listForecastEntries(operatingCompanyId, from || undefined, to || undefined),
    enabled: Boolean(operatingCompanyId),
  });
  const openingQuery = useQuery({
    queryKey: ["forecast", "opening", operatingCompanyId],
    queryFn: () => getForecastOpeningBalance(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["forecast", "entries", operatingCompanyId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(Number(form.amount || 0) * 100);
      if (!form.entry_date) throw new Error("Date is required");
      if (!Number.isFinite(amountCents) || amountCents < 0) throw new Error("Amount must be ≥ 0");
      const payload = {
        operating_company_id: operatingCompanyId,
        entry_date: form.entry_date,
        direction: form.direction,
        amount_cents: amountCents,
        party_name: form.party_name || null,
        invoice_no: form.invoice_no || null,
        category: form.category || null,
        memo: form.memo || null,
        ref_kind: form.ref_kind || null,
        ref_label: form.ref_label || null,
        ref_external_id: form.ref_external_id || null,
      };
      if (form.id) await updateForecastEntry(form.id, payload);
      else await createForecastEntry(payload);
    },
    onSuccess: () => {
      setForm(emptyForm());
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteForecastEntry(id, operatingCompanyId),
    onSuccess: invalidate,
  });

  const openingMutation = useMutation({
    mutationFn: () =>
      putForecastOpeningBalance({
        operating_company_id: operatingCompanyId,
        amount_cents: Math.round(Number(openingInput || 0) * 100),
      }),
    onSuccess: () => {
      setOpeningInput("");
      void qc.invalidateQueries({ queryKey: ["forecast", "opening", operatingCompanyId] });
    },
  });

  const openingCents = openingQuery.data?.amount_cents ?? 0;
  const entries = useMemo(() => entriesQuery.data?.entries ?? [], [entriesQuery.data?.entries]);

  // Group by day, compute day net + running projected balance from the opening balance.
  const days = useMemo(() => {
    const byDay = new Map<string, ForecastEntry[]>();
    for (const e of entries) {
      const arr = byDay.get(e.entry_date) ?? [];
      arr.push(e);
      byDay.set(e.entry_date, arr);
    }
    const sortedDates = [...byDay.keys()].sort();
    let running = openingCents;
    return sortedDates.map((date) => {
      const rows = byDay.get(date) ?? [];
      const income = rows.filter((r) => r.direction === "income").reduce((s, r) => s + r.amount_cents, 0);
      const expense = rows.filter((r) => r.direction === "expense").reduce((s, r) => s + r.amount_cents, 0);
      const net = income - expense;
      running += net;
      return { date, rows, income, expense, net, running };
    });
  }, [entries, openingCents]);

  const editRow = (e: ForecastEntry) =>
    setForm({
      id: e.id,
      entry_date: e.entry_date,
      direction: e.direction,
      amount: String((e.amount_cents || 0) / 100),
      party_name: e.party_name ?? "",
      invoice_no: e.invoice_no ?? "",
      category: e.category ?? "",
      memo: e.memo ?? "",
      ref_kind: e.ref_kind ?? "",
      ref_label: e.ref_label ?? "",
      ref_external_id: e.ref_external_id ?? "",
    });

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded border border-gray-200 bg-white p-2">
        <span className="text-[11px] font-semibold text-gray-600">Opening cash (current): </span>
        <span className="font-semibold">{fmtCents(openingCents)}</span>
        <span className="ml-3 inline-flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            placeholder="Set opening $"
            className="h-7 w-32 rounded border border-gray-300 px-2"
            value={openingInput}
            onChange={(e) => setOpeningInput(e.target.value)}
          />
          <button
            type="button"
            className="h-7 rounded border border-gray-300 bg-white px-2 font-semibold hover:bg-gray-50"
            disabled={openingMutation.isPending || openingInput === ""}
            onClick={() => openingMutation.mutate()}
          >
            Save
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2">
        <label className="font-semibold text-gray-600">From</label>
        <input type="date" className="h-7 rounded border border-gray-300 px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="font-semibold text-gray-600">To</label>
        <input type="date" className="h-7 rounded border border-gray-300 px-2" value={to} onChange={(e) => setTo(e.target.value)} />
        {(from || to) && (
          <button type="button" className="h-7 rounded border border-gray-300 bg-white px-2 hover:bg-gray-50" onClick={() => { setFrom(""); setTo(""); }}>
            Clear
          </button>
        )}
      </div>

      {/* Inline create / edit */}
      <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-4 lg:grid-cols-6">
        <input type="date" className="h-7 rounded border border-gray-300 px-2" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
        <select className="h-7 rounded border border-gray-300 px-2" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "income" | "expense" })}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input type="number" step="0.01" placeholder="Amount $" className="h-7 rounded border border-gray-300 px-2" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input placeholder="Party (free text)" className="h-7 rounded border border-gray-300 px-2" value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} />
        <input placeholder="Invoice #" className="h-7 rounded border border-gray-300 px-2" value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
        <input placeholder="Category" className="h-7 rounded border border-gray-300 px-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <select className="h-7 rounded border border-gray-300 px-2" value={form.ref_kind} onChange={(e) => setForm({ ...form, ref_kind: e.target.value as FormState["ref_kind"] })}>
          <option value="">Link (none)</option>
          {REF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input placeholder="Link label (snapshot)" className="h-7 rounded border border-gray-300 px-2" value={form.ref_label} onChange={(e) => setForm({ ...form, ref_label: e.target.value })} />
        <input placeholder="Memo" className="col-span-2 h-7 rounded border border-gray-300 px-2 md:col-span-3" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        <button type="button" className="h-7 rounded bg-slate-700 px-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-50" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {form.id ? "Save" : "+ Create"}
        </button>
        {form.id && (
          <button type="button" className="h-7 rounded border border-gray-300 bg-white px-3 hover:bg-gray-50" onClick={() => setForm(emptyForm())}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="text-red-600">{error}</p>}

      {/* By-day view */}
      {entriesQuery.isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : days.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-gray-700">No projections yet — add lines above.</div>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date} className="rounded border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-2 py-1 font-semibold">
                <span>{d.date}</span>
                <span className="flex gap-3">
                  <span className="text-emerald-700">+{fmtCents(d.income)}</span>
                  <span className="text-red-700">-{fmtCents(d.expense)}</span>
                  <span>Net {fmtCents(d.net)}</span>
                  <span>Projected {fmtCents(d.running)}</span>
                </span>
              </div>
              <table className="w-full">
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-2 py-1">{r.direction === "income" ? "▲" : "▼"}</td>
                      <td className="px-2 py-1 font-semibold">{fmtCents(r.amount_cents)}</td>
                      <td className="px-2 py-1">{r.party_name ?? "—"}</td>
                      <td className="px-2 py-1 text-gray-500">{r.invoice_no ?? ""}</td>
                      <td className="px-2 py-1 text-gray-500">{r.category ?? ""}</td>
                      <td className="px-2 py-1 text-gray-500">{r.ref_kind ? `${r.ref_kind}: ${r.ref_label ?? ""}` : ""}</td>
                      <td className="px-2 py-1 text-gray-500">{r.memo ?? ""}</td>
                      <td className="px-2 py-1 text-right">
                        <button type="button" className="mr-2 text-slate-600 hover:underline" onClick={() => editRow(r)}>Edit</button>
                        <button type="button" className="text-red-600 hover:underline" onClick={() => deleteMutation.mutate(r.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
