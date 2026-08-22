import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle, Download } from "lucide-react";
import { listTransactionRegister, type RegisterTransaction, type TransactionSource } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateUS } from "../../lib/formatDate";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { EntityLink } from "../../components/shared/EntityLink";

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
      r.date ? formatDateUS(r.date) : "",
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
  const staged = useStagedListFilters({ applied: { sources, direction, status, fromDate, toDate }, empty: { sources: [] as TransactionSource[], direction: "all" as const, status: "", fromDate: "", toDate: "" }, onApply: (next) => { setSources(next.sources); setDirection(next.direction); setStatus(next.status); setFromDate(next.fromDate); setToDate(next.toDate); setPage(0); } });
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

  // Display-only ParityTable migration: same columns, same order, same cell renders
  // (badge, formatCurrencyFromCents amounts, em-dash blanks, Open link) as the former
  // hand-rolled table markup. Server-side paging stays outside the table, unchanged.
  const columns = useMemo<ParityColumn<RegisterTransaction>[]>(
    () => [
      {
        key: "source",
        label: "Source",
        sortable: true,
        render: (r) => (
          <span className={`rounded-sm border px-2 py-0.5 text-[11px] ${sourceBadgeClass(r.source)}`}>
            {r.source}
          </span>
        ),
      },
      {
        key: "date",
        label: "Date",
        sortable: true,
        sortValue: (r) => r.date ?? "",
        cellClass: "whitespace-nowrap text-slate-700",
        render: (r) => (r.date ? formatDateUS(r.date) : "—"),
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        sortValue: (r) => r.description ?? "",
        cellClass: "text-slate-800",
        render: (r) => r.description ?? "—",
      },
      { key: "type", label: "Type", sortable: true, cellClass: "text-slate-600" },
      {
        key: "counterparty",
        label: "Customer / Vendor",
        sortable: true,
        sortValue: (r) => r.counterparty ?? "",
        cellClass: "text-slate-700",
        render: (r) => r.counterparty ?? "—",
      },
      {
        key: "amount_in_cents",
        label: "In",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-slate-800",
        render: (r) => (r.amount_in_cents > 0 ? formatCurrencyFromCents(r.amount_in_cents) : "—"),
      },
      {
        key: "amount_out_cents",
        label: "Out",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-slate-800",
        render: (r) => (r.amount_out_cents > 0 ? formatCurrencyFromCents(r.amount_out_cents) : "—"),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (r) => r.status ?? "",
        cellClass: "text-slate-600",
        render: (r) => r.status ?? "—",
      },
      {
        // ACCT-F5982: this leaf's own required column (gl_je) had no forward link at all — every
        // guard tagging it never opened this file. Real link when a source posted (bank/invoice/
        // bill); fuel/settlement rows honestly have no single JE of their own (see the backend's
        // own comment on those UNION arms) rather than an invented one.
        key: "journal_entry",
        label: "GL / JE",
        cellClass: "text-slate-700",
        render: (r) =>
          r.journal_entry_id ? (
            <EntityLink kind="journal_entry" id={r.journal_entry_id} label="View JE →" />
          ) : (
            "—"
          ),
      },
      {
        key: "link",
        label: "Link",
        alwaysVisible: true,
        render: (r) =>
          r.detail_path ? (
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
          ),
      },
    ],
    [navigate],
  );

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
    <AccountingSubNavWrapper
      title="All Transactions"
      subtitle="Every bank, fuel, invoice, bill & settlement transaction in one reviewable register"
      actions={
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex h-9 items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 text-[12px] text-slate-700 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      }
    >

      <div className="space-y-2" data-transaction-register-filter-toolbar="collapsed">
        <CollapsedListFilters
          activeFilterCount={
            (sources.length > 0 ? 1 : 0) +
            (direction !== "all" ? 1 : 0) +
            (status ? 1 : 0) +
            (fromDate || toDate ? 1 : 0)
          }
          onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
          testIdPrefix="transaction-register"
          searchSlot={
            <input
              value={search}
              onChange={(event) => {
                setPage(0);
                setSearch(event.target.value);
              }}
              placeholder="Description or customer / vendor / driver"
              className="min-h-12 h-12 w-72 rounded-sm border border-slate-300 px-2 text-[13px]"
              aria-label="Search transactions"
            />
          }
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {SOURCE_OPTIONS.map((opt) => {
              const active = staged.draft.sources.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => staged.setDraft({ ...staged.draft, sources: active ? staged.draft.sources.filter((source) => source !== opt.value) : [...staged.draft.sources, opt.value] })}
                  className={`rounded-full border px-3 py-0.5 text-[12px] ${
                    active ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Direction
              <select
                value={staged.draft.direction}
                onChange={(event) => staged.setDraft({ ...staged.draft, direction: event.target.value as "all" | "in" | "out" })}
                className="h-9 rounded-sm border border-slate-300 px-2 text-[13px]"
              >
                <option value="all">All</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Status
              <input
                value={staged.draft.status}
                onChange={(event) => staged.setDraft({ ...staged.draft, status: event.target.value })}
                placeholder="e.g. paid, uncategorized"
                className="h-9 rounded-sm border border-slate-300 px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              From
              <DatePicker value={staged.draft.fromDate} onChange={(next) => staged.setDraft({ ...staged.draft, fromDate: next })} className="h-9" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              To
              <DatePicker value={staged.draft.toDate} onChange={(next) => staged.setDraft({ ...staged.draft, toDate: next })} className="h-9" />
            </label>
          </div>
        </CollapsedListFilters>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>{total.toLocaleString()} transactions</span>
          <span>In (page): {formatCurrencyFromCents(totals.inSum)}</span>
          <span>Out (page): {formatCurrencyFromCents(totals.outSum)}</span>
        </div>
      </div>

      {query.isError ? (
        <ListErrorState {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.source}:${r.id}`}
          loading={query.isLoading}
          emptyText="No transactions for the selected filters."
          storageKey="transaction-register"
          tableTestId="transaction-register-table"
          suppressToolbarSearch
          initialPageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
        />
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
            className="h-9 rounded-sm border border-slate-300 bg-white px-3 disabled:opacity-50"
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
            className="h-9 rounded-sm border border-slate-300 bg-white px-3 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </AccountingSubNavWrapper>
  );
}

export default TransactionRegisterPage;
