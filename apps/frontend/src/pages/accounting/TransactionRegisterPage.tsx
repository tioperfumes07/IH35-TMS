import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle, Download } from "lucide-react";
import { listTransactionRegister, type RegisterTransaction, type TransactionSource } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateQboList } from "../../lib/formatDate";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { DateRangePresets } from "../../components/forms/DateRangePresets";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { TOOLBAR_ICON_SIZE_CLASS } from "../../design/tokens";

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
      return "bg-[#F7F8FA] text-[#1F2A44] border-[#E5E7EB]";
    case "fuel":
      return "bg-[#F7F8FA] text-[#4B5563] border-[#E5E7EB]";
    case "invoice":
      return "bg-[#F7F8FA] text-[#1F2A44] border-[#E5E7EB]";
    case "bill":
      return "bg-[#F7F8FA] text-[#1F2A44] border-[#E5E7EB]";
    case "settlement":
      return "bg-[#F7F8FA] text-[#4B5563] border-[#E5E7EB]";
    default:
      return "bg-[#F7F8FA] text-[#4B5563] border-[#E5E7EB]";
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
      r.date ? formatDateQboList(r.date) : "",
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

  // 432-CUR #1 — MoneyListToolbar always visible; filters commit immediately (no staged Apply).
  const [sources, setSources] = useState<TransactionSource[]>([]);
  const [directionFilter, setDirectionFilter] = useState<Array<"in" | "out">>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  const direction: "all" | "in" | "out" =
    directionFilter.length === 1 ? directionFilter[0]! : "all";

  const bumpPage = () => setPage(0);

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
          <span className={`rounded-sm border px-2 py-0.5 text-xs ${sourceBadgeClass(r.source)}`}>
            {r.source}
          </span>
        ),
      },
      {
        key: "date",
        label: "Date",
        sortable: true,
        sortValue: (r) => r.date ?? "",
        cellClass: "whitespace-nowrap text-[#1F2A44]",
        render: (r) => (r.date ? formatDateQboList(r.date) : "—"),
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        sortValue: (r) => r.description ?? "",
        cellClass: "text-[#1F2A44]",
        render: (r) => r.description ?? "—",
      },
      { key: "type", label: "Type", sortable: true, cellClass: "text-[#4B5563]" },
      {
        key: "counterparty",
        label: "Customer / Vendor",
        sortable: true,
        sortValue: (r) => r.counterparty ?? "",
        cellClass: "text-[#1F2A44]",
        render: (r) => r.counterparty ?? "—",
      },
      {
        key: "amount_in_cents",
        label: "In",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-[#1F2A44]",
        render: (r) => (r.amount_in_cents > 0 ? formatCurrencyFromCents(r.amount_in_cents) : "—"),
      },
      {
        key: "amount_out_cents",
        label: "Out",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-[#1F2A44]",
        render: (r) => (r.amount_out_cents > 0 ? formatCurrencyFromCents(r.amount_out_cents) : "—"),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (r) => r.status ?? "",
        cellClass: "text-[#4B5563]",
        render: (r) => r.status ?? "—",
      },
      {
        // ACCT-F5982: this leaf's own required column (gl_je) had no forward link at all — every
        // guard tagging it never opened this file. Real link when a source posted (bank/invoice/
        // bill); fuel/settlement rows honestly have no single JE of their own (see the backend's
        // own comment on those UNION arms) rather than an invented one.
        key: "journal_entry",
        label: "GL / JE",
        cellClass: "text-[#1F2A44]",
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
              className="inline-flex items-center gap-1 text-xs text-[#4B5563] hover:text-[#1F2A44]"
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
        // UI CONTROL LAW — was a hand-rolled Export button at its own ad-hoc size. Now the shared
        // Button primitive + the locked 16px toolbar icon size.
        (
          <Button type="button" variant="tertiary" size="md" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className={TOOLBAR_ICON_SIZE_CLASS} /> Export CSV
          </Button>
        )
      }
    >

      <div className="space-y-2" data-transaction-register-filter-toolbar="visible">
        <MoneyListToolbar
          search={search}
          onSearchChange={(next) => {
            bumpPage();
            setSearch(next);
          }}
          searchPlaceholder="Description or customer / vendor / driver"
          searchTestId="transaction-register-search"
          testIdPrefix="transaction-register"
          activeFilterCount={
            (sources.length > 0 ? 1 : 0) +
            (directionFilter.length > 0 ? 1 : 0) +
            (status ? 1 : 0) +
            (fromDate || toDate ? 1 : 0)
          }
          onClearAll={() => {
            setSources([]);
            setDirectionFilter([]);
            setStatus("");
            setFromDate("");
            setToDate("");
            setSearch("");
            bumpPage();
          }}
        >
          <MultiSelectDropdown
            label="Source"
            options={SOURCE_OPTIONS}
            selected={sources}
            onChange={(next) => {
              bumpPage();
              setSources(next as TransactionSource[]);
            }}
            allLabel="All sources"
            data-testid="transaction-register-filter-source"
          />
          <MultiSelectDropdown
            label="Direction"
            options={[
              { value: "in", label: "Money in" },
              { value: "out", label: "Money out" },
            ]}
            selected={directionFilter}
            onChange={(next) => {
              bumpPage();
              setDirectionFilter(next as Array<"in" | "out">);
            }}
            allLabel="All directions"
            data-testid="transaction-register-filter-direction"
          />
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#4B5563]">
            Status
            <input
              value={status}
              onChange={(event) => {
                bumpPage();
                setStatus(event.target.value);
              }}
              placeholder="e.g. paid, uncategorized"
              className="h-9 rounded-sm border border-[#E5E7EB] px-2 text-xs"
              data-testid="transaction-register-filter-status"
            />
          </label>
          <DateRangePresets
            from={fromDate}
            to={toDate}
            onChange={(next) => {
              bumpPage();
              setFromDate(next.from);
              setToDate(next.to);
            }}
            data-testid="transaction-register-date-range"
          />
        </MoneyListToolbar>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#4B5563]">
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
          suppressToolbarRange
          // ACCT-F-PARITYTABLE-DOUBLE-PAGINATION: `rows` is already one server page (limit=
          // PAGE_SIZE of the real `total`, offset-driven). Without pageSize+hidePager,
          // ParityTable's own uncontrolled pager re-derives "total" from rows.length and renders
          // a second, contradictory "1-100 of 100 / Page 1 of 1" pager (all nav disabled)
          // directly above the real "Page {page+1} of {pageCount}" pager below -- live-confirmed
          // 427 real transactions / 5 real pages vs the fake pager's "100". Same class as the
          // already-fixed REPORTS-F6363 / DOCS-F-PARITYTABLE-DOUBLE-PAGINATION /
          // ADMIN-F-PARITYTABLE-DOUBLE-PAGINATION. Per ParityTable's own documented "caller
          // pre-pages" combo: pageSize = server page size + hidePager -- no double slicing.
          pageSize={PAGE_SIZE}
          hidePager
        />
      )}

      <div className="flex items-center justify-between text-xs text-[#4B5563]">
        <span>
          {total === 0 ? "0" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`} of {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="h-9 rounded-sm border border-[#E5E7EB] bg-white px-3 disabled:opacity-50"
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
            className="h-9 rounded-sm border border-[#E5E7EB] bg-white px-3 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </AccountingSubNavWrapper>
  );
}

export default TransactionRegisterPage;
