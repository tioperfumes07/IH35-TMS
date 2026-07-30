import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { useQuery } from "@tanstack/react-query";
import {
  listExpenses,
  listExpenseDuplicates,
  type ExpenseListRow,
  type ExpenseListStatus,
} from "../../api/accounting";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { RecordExpenseModal } from "../../components/expenses/RecordExpenseModal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { formatDateUS } from "../../lib/formatDate";
import { CollapsedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";

const STATUS_OPTIONS: Array<{ value: "" | ExpenseListStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "void", label: "Void" },
];

function money(cents: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function payeeOf(row: ExpenseListRow): string {
  if (row.vendor_name) return row.vendor_name;
  const name = `${row.driver_first_name ?? ""} ${row.driver_last_name ?? ""}`.trim();
  return name || "—";
}

function StatusPill({ status }: { status: ExpenseListStatus }) {
  // §7: slate tones only — no green/red section coloring on a browse list.
  const cls =
    status === "void"
      ? "bg-gray-200 text-gray-600"
      : status === "posted"
        ? "bg-slate-100 text-slate-700"
        : "bg-gray-100 text-gray-600";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>{status}</span>;
}

function MatchPill({ matched }: { matched: boolean }) {
  // §7-clean: slate for matched, gray for unmatched. No emoji/checkmark, no green.
  return matched ? (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Matched</span>
  ) : (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Unmatched</span>
  );
}

export function ExpensesListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  // BANK-SORT-ROLLOUT-ACCT: every visible column header sorts ASC/DESC; sort persists in the URL
  // (?sort=&dir=) so it survives reload / is shareable, same as the Banking register.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const deepLinkExpenseId = searchParams.get("expense_id");
  const [status, setStatus] = useState<"" | ExpenseListStatus>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(deepLinkExpenseId);

  useEffect(() => {
    if (deepLinkExpenseId) setHighlightedExpenseId(deepLinkExpenseId);
  }, [deepLinkExpenseId]);

  const query = useQuery({
    queryKey: ["accounting", "expenses", companyId, status, fromDate, toDate],
    queryFn: () =>
      listExpenses(companyId, {
        status: status || undefined,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        limit: 200,
      }).then((res) => res.rows),
    enabled: Boolean(companyId),
  });

  const dupQuery = useQuery({
    queryKey: ["accounting", "expense-duplicates", companyId],
    queryFn: () => listExpenseDuplicates(companyId, 25),
    enabled: Boolean(companyId),
  });

  const rows = query.data ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += Number(row.total_amount_cents) || 0;
        if (row.is_reconciled) acc.matched += 1;
        return acc;
      },
      { total: 0, matched: 0 }
    );
  }, [rows]);

  const columns: Array<ParityColumn<ExpenseListRow>> = [
    {
      key: "expense_number",
      label: "Expense #",
      sortable: true,
      render: (r) => <EntityLink kind="expense" id={r.id} label={r.expense_number || r.id.slice(0, 8)} />,
    },
    { key: "transaction_date", label: "Date", sortable: true, render: (r) => <span className="text-gray-700">{formatDateUS(r.transaction_date)}</span> },
    {
      key: "payee",
      label: "Payee",
      sortable: true,
      // Derived display (vendor_name / driver name) — must supply sortValue or header is a no-op.
      sortValue: (r) => payeeOf(r),
      render: (r) =>
        r.vendor_uuid ? (
          <EntityLink kind="vendor" id={r.vendor_uuid} label={r.vendor_name ?? r.vendor_uuid.slice(0, 8)} />
        ) : (
          <span className="font-medium text-gray-900">{payeeOf(r)}</span>
        ),
    },
    {
      key: "line_description",
      label: "Category / Memo",
      sortable: true,
      sortValue: (r) => r.line_description || r.memo || "",
      render: (r) => <span className="text-gray-600">{r.line_description || r.memo || "—"}</span>,
    },
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      render: (r) => <EntityLink kind="load" id={r.load_id} label={r.load_number ?? (r.load_id ? r.load_id.slice(0, 8) : undefined)} />,
    },
    {
      key: "linked_work_order_uuid",
      label: "WO",
      sortable: true,
      sortValue: (r) => r.work_order_display_id ?? r.linked_work_order_uuid ?? "",
      render: (r) => (
        <EntityLink
          kind="work_order"
          id={r.linked_work_order_uuid ?? undefined}
          label={r.work_order_display_id ?? (r.linked_work_order_uuid ? r.linked_work_order_uuid.slice(0, 8) : undefined)}
        />
      ),
    },
    {
      key: "vendor_uuid",
      label: "Vendor",
      sortable: true,
      sortValue: (r) => r.vendor_name ?? "",
      render: (r) => (
        <EntityLink
          kind="vendor"
          id={r.vendor_uuid ?? undefined}
          label={r.vendor_name ?? (r.vendor_uuid ? r.vendor_uuid.slice(0, 8) : undefined)}
        />
      ),
    },
    {
      key: "journal_entry_id",
      label: "JE",
      sortable: true,
      render: (r) => (
        <EntityLink
          kind="journal_entry"
          id={r.journal_entry_id ?? undefined}
          label={r.journal_entry_id ? r.journal_entry_id.slice(0, 8) : undefined}
        />
      ),
    },
    {
      key: "matched_bank_transaction_id",
      label: "Bank txn",
      sortable: true,
      sortValue: (r) => r.matched_bank_transaction_id ?? "",
      render: (r) =>
        r.matched_bank_transaction_id ? (
          <EntityLink
            kind="bank_transaction"
            id={r.matched_bank_transaction_id}
            label={r.matched_bank_transaction_id.slice(0, 8)}
          />
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "total_amount_cents",
      label: "Amount",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      render: (r) => <span className="font-semibold text-gray-900">{money(r.total_amount_cents)}</span>,
    },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusPill status={r.status} /> },
    {
      key: "posting_status",
      label: "GL",
      sortable: true,
      render: (r) => <span className="text-[11px] capitalize text-gray-600">{r.posting_status}</span>,
    },
    { key: "is_reconciled", label: "Bank Match", sortable: true, render: (r) => <MatchPill matched={r.is_reconciled} /> },
  ];

  const expensesActiveFilterCount = (status ? 1 : 0) + (fromDate || toDate ? 1 : 0);

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3">
      <CollapsedListFilters
        activeFilterCount={expensesActiveFilterCount}
        testIdPrefix="expenses"
        dataAttributes={{ "data-expenses-filter-toolbar": "collapsed" }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600">
            Status
            <SelectCombobox
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | ExpenseListStatus)}
              className="h-8 rounded-sm border border-gray-300 px-2 text-[13px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600">
            From date
            <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} className="h-8 rounded-sm border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600">
            To date
            <DatePicker value={toDate} onChange={(next) => setToDate(next)} className="h-8 rounded-sm border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>
      </CollapsedListFilters>
      <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-600">
        <span>Total: {money(totals.total)}</span>
        <span>Matched: {totals.matched}</span>
        <span>Rows: {rows.length}</span>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Expenses"
      subtitle="Recorded expenses (read-only)"
      actions={
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!companyId}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          + Create
        </button>
      }
    >
      {/* Create = QBO-like right ParityDrawer (owner chrome). /accounting/expenses is the canonical
          list; /accounting/expenses/new remains an additive create alias; /list is an additive list alias. */}
      <RecordExpenseModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void query.refetch()}
      />
      <div className="space-y-3">
        {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
        {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}
        {companyId && dupQuery.data && dupQuery.data.group_count > 0 ? (
          <div
            className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
            data-testid="expense-duplicates-panel"
          >
            <div className="mb-1 font-semibold">
              Possible duplicate expenses: {dupQuery.data.group_count.toLocaleString()} groups (
              {dupQuery.data.expense_count.toLocaleString()} rows) — same vendor + date + amount
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {dupQuery.data.groups.slice(0, 8).map((g) => (
                <li key={`${g.vendor_uuid}-${g.transaction_date}-${g.total_amount_cents}`}>
                  <span className="font-medium">{g.vendor_name ?? g.vendor_uuid.slice(0, 8)}</span>
                  {" · "}
                  {formatDateUS(g.transaction_date) || g.transaction_date}
                  {" · "}
                  {money(g.total_amount_cents)}
                  {" · "}
                  {g.count}×
                  {g.members.slice(0, 3).map((m) => (
                    <span key={m.id} className="ml-2 inline-block">
                      <EntityLink kind="expense" id={m.id} label={m.expense_number ?? m.id.slice(0, 8)} />
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {highlightedExpenseId ? (
          <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Deep-link expense <span className="font-mono font-semibold">{highlightedExpenseId.slice(0, 8)}</span>
            {rows.some((r) => r.id === highlightedExpenseId)
              ? " — highlighted in the list below."
              : " — not in the current filter window (widen dates/status or confirm company)."}
          </p>
        ) : null}

        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          onRowClick={(r) => {
            void navigate(`/accounting/expenses/${r.id}`);
          }}
          rowClassName={(r) => (highlightedExpenseId === r.id ? "bg-slate-100" : "")}
          filterBar={filterBar}
          exportFilename="expenses"
          storageKey="expenses-list"
          initialPageSize={50}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          emptyText="No expenses found for the selected filters."
        />
      </div>
    </AccountingSubNavWrapper>
  );
}
