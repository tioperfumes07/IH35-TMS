import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle, Download } from "lucide-react";
import { listTransactionRegister, type RegisterTransaction, type TransactionSource } from "../../api/accounting";
import { DataPanel } from "../../components/layout/DataPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNav } from "./AccountingSubNav";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";

const PAGE_SIZE = 100;

const SOURCE_OPTIONS: { value: TransactionSource; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "fuel", label: "Fuel" },
  { value: "invoice", label: "Invoice (AR)" },
  { value: "bill", label: "Bill (AP)" },
  { value: "settlement", label: "Settlement" },
];

function sourceBadgeClass(source: string): string {
  // §7 palette: slate tones only — no blue/green/purple section bands.
  switch (source) {
    case "bank":
      return "bg-slate-100 text-slate-700 border-slate-300";
    case "fuel":
      return "bg-slate-50 text-slate-600 border-slate-200";
    case "invoice":
      return "bg-slate-100 text-slate-800 border-slate-300";
    case "bill":
      return "bg-slate-50 text-slate-700 border-slate-200";
    case "settlement":
      return "bg-slate-100 text-slate-600 border-slate-300";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

function toCsv(rows: RegisterTransaction[]): string {
  const header = ["Source", "Date", "Description", "Type", "Counterparty", "In", "Out", "Status"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.source,
      r.date ?? "",
      r.description ?? "",
      r.type,
      r.counterparty ?? "",
      (r.amount_in_cents / 100).toFixed(2),
      (r.amount_out_cents / 100).toFixed(2),
      r.status ?? "",
    ]
      .map(esc)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export function TransactionRegisterPage() {
  const { selectedCompanyId } = useCompanyContext();
  const navigate = useNavigate();

  const [sources, setSources] = useState<TransactionSource[]>([]);
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["accounting", "transaction-register", selectedCompanyId, sources, direction, status, search, fromDate, toDate, page],
    queryFn: () =>
      listTransactionRegister(selectedCompanyId!, {
        source: sources.length > 0 ? sources : undefined,
        status: status ? [status] : undefined,
        direction,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        q: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const r of rows) {
      inSum += r.amount_in_cents;
      outSum += r.amount_out_cents;
    }
    return { inSum, outSum };
  }, [rows]);

  function toggleSource(value: TransactionSource) {
    setPage(0);
    setSources((current) => (current.includes(value) ? current.filter((s) => s !== value) : [...current, value]));
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaction-register-page-${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title="All Transactions"
        subtitle="Every bank, fuel, invoice, bill & settlement transaction in one reviewable register"
        actions={
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[12px] text-slate-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        }
      />

      <DataPanel title="Filters">
        <div className="flex flex-wrap items-center gap-1.5">
          {SOURCE_OPTIONS.map((opt) => {
            const active = sources.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleSource(opt.value)}
                className={`rounded-full border px-3 py-0.5 text-[12px] ${
                  active ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
            Search
            <input
              value={search}
              onChange={(event) => {
                setPage(0);
                setSearch(event.target.value);
              }}
              placeholder="Description or customer / vendor / driver"
              className="h-9 rounded border border-slate-300 px-2 text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Direction
            <select
              value={direction}
              onChange={(event) => {
                setPage(0);
                setDirection(event.target.value as "all" | "in" | "out");
              }}
              className="h-9 rounded border border-slate-300 px-2 text-[13px]"
            >
              <option value="all">All</option>
              <option value="in">Money in</option>
              <option value="out">Money out</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Status
            <input
              value={status}
              onChange={(event) => {
                setPage(0);
                setStatus(event.target.value);
              }}
              placeholder="e.g. paid, uncategorized"
              className="h-9 rounded border border-slate-300 px-2 text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            From
            <DatePicker value={fromDate} onChange={(next) => { setPage(0); setFromDate(next); }} className="h-9 rounded border border-slate-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            To
            <DatePicker value={toDate} onChange={(next) => { setPage(0); setToDate(next); }} className="h-9 rounded border border-slate-300 px-2 text-[13px]" />
          </label>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>{total.toLocaleString()} transactions</span>
          <span>In (page): {formatCurrencyFromCents(totals.inSum)}</span>
          <span>Out (page): {formatCurrencyFromCents(totals.outSum)}</span>
        </div>
      </DataPanel>

      {query.isError ? (
        <ListErrorState {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50">
              <tr className="text-slate-600">
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Customer / Vendor</th>
                <th className="px-3 py-2 text-right font-semibold">In</th>
                <th className="px-3 py-2 text-right font-semibold">Out</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Link</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    No transactions for the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.source}:${r.id}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${sourceBadgeClass(r.source)}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.date ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-800">{r.description ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.type}</td>
                    <td className="px-3 py-2 text-slate-700">{r.counterparty ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {r.amount_in_cents > 0 ? formatCurrencyFromCents(r.amount_in_cents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {r.amount_out_cents > 0 ? formatCurrencyFromCents(r.amount_out_cents) : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.status ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.detail_path ? (
                        <button
                          type="button"
                          onClick={() => navigate(r.detail_path!)}
                          className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-[#1f2a44]"
                          aria-label="Open source record"
                        >
                          Open <ArrowRightCircle className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          {total === 0 ? "0" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`} of {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-8 rounded border border-slate-300 bg-white px-3 disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
            disabled={page + 1 >= pageCount}
            className="h-8 rounded border border-slate-300 bg-white px-3 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default TransactionRegisterPage;
