/**
 * ExpensesListPage — READ-ONLY browse of accounting.expenses (GAP-EXPENSES browse side).
 *
 * The Record-Expense flow (ExpenseCreatePage) had no list/browse counterpart; recorded expenses
 * were invisible. This screen lists them via GET /api/v1/expenses using the shared ParityTable
 * (sortable / resizable / sticky / CSV export). Strictly read-only — no create/edit/void here.
 *
 * The "Bank Match" column is derived server-side from bank.reconciliation_matches (read-only,
 * additive), following the #1755 precedent for Bills/Bill-Payments. §7 palette only (navy/slate,
 * no blue/green/emojis).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listExpenses, type ExpenseListRow, type ExpenseListStatus } from "../../api/accounting";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

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
  const [status, setStatus] = useState<"" | ExpenseListStatus>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
      render: (r) => <span className="code-cell text-gray-900">{r.expense_number || r.id.slice(0, 8)}</span>,
    },
    { key: "transaction_date", label: "Date", sortable: true, render: (r) => <span className="text-gray-700">{r.transaction_date}</span> },
    { key: "payee", label: "Payee", sortable: true, render: (r) => <span className="font-medium text-gray-900">{payeeOf(r)}</span> },
    {
      key: "line_description",
      label: "Category / Memo",
      sortable: true,
      render: (r) => <span className="text-gray-600">{r.line_description || r.memo || "—"}</span>,
    },
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      render: (r) => <span className="text-gray-600">{r.load_number || (r.load_id ? r.load_id.slice(0, 8) : "—")}</span>,
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

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600">
        Status
        <SelectCombobox
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | ExpenseListStatus)}
          className="h-8 rounded border border-gray-300 px-2 text-[13px]"
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
        <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} className="h-8 rounded border border-gray-300 px-2 text-[13px]" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600">
        To date
        <DatePicker value={toDate} onChange={(next) => setToDate(next)} className="h-8 rounded border border-gray-300 px-2 text-[13px]" />
      </label>
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
        <Link
          to="/accounting/expenses"
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          + Record expense
        </Link>
      }
    >
      <div className="space-y-3">
        {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
        {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          onRowClick={(r) => (r.load_id ? navigate(`/dispatch/loads/${r.load_id}`) : undefined)}
          filterBar={filterBar}
          exportFilename="expenses"
          storageKey="expenses-list"
          initialPageSize={50}
          emptyText="No expenses found for the selected filters."
        />
      </div>
    </AccountingSubNavWrapper>
  );
}
