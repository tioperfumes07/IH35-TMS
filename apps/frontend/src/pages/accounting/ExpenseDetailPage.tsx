import { formatDateUS } from "../../lib/formatDate";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getExpense, type ExpenseDetailLine } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function money(cents: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusVariant(status: string): "positive" | "neutral" | "crit" | "warn" {
  if (status === "posted") return "positive";
  if (status === "void") return "neutral";
  if (status === "draft") return "warn";
  return "crit";
}

function accountLabel(_number: string | null | undefined, name: string | null | undefined, id: string) {
  if (name) return name;
  return id.slice(0, 8);
} — ${name}`;
  if (name) return name;
  if (number) return number;
  return id.slice(0, 8);
}

export function ExpenseDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();

  const detailQuery = useQuery({
    queryKey: ["accounting", "expense", selectedCompanyId, id],
    queryFn: () => getExpense(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  if (detailQuery.isLoading) return <div className="p-4 text-sm text-slate-500">Loading expense…</div>;
  if (detailQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load expense"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const expense = detailQuery.data?.expense;
  const lines = detailQuery.data?.lines ?? [];
  if (!expense) return <div className="p-4 text-sm text-red-600">Expense not found.</div>;

  const displayId = expense.expense_number ?? expense.id.slice(0, 8);

  const lineColumns: Array<ParityColumn<ExpenseDetailLine>> = [
    { key: "line_sequence", label: "Line", sortable: true, render: (line) => line.line_sequence },
    {
      key: "expense_account_uuid",
      label: "GL account",
      sortable: true,
      sortValue: (line) => line.expense_account_name ?? line.expense_account_uuid ?? "",
      render: (line) =>
        line.expense_account_uuid ? (
          <Link
            to={`/accounting/chart-of-accounts/register/${line.expense_account_uuid}`}
            className="text-slate-700 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {accountLabel(line.expense_account_number, line.expense_account_name, line.expense_account_uuid)}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (line) => line.description || "—",
    },
    {
      key: "amount_cents",
      label: "Amount",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      render: (line) => money(line.amount_cents),
    },
  ];

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={displayId}
        backHref="/accounting/expenses/list"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Expenses", href: "/accounting/expenses/list" },
          { label: displayId },
        ]}
        actions={<StatusBadge variant={statusVariant(expense.status)}>{expense.status}</StatusBadge>}
      />

      <DataPanel title="Expense">
        {expense.vendor_uuid ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor</span>
            <EntityLink kind="vendor" id={expense.vendor_uuid} label={expense.vendor_name ?? expense.vendor_uuid.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Expense #</span>
          <span className="text-sm text-gray-900">{expense.expense_number ?? "—"}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Date</span>
          <span className="text-sm text-gray-900">{formatDateUS(expense.transaction_date)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Amount</span>
          <span className="text-sm text-gray-900">{money(expense.total_amount_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">GL posting</span>
          <span className="text-sm capitalize text-gray-900">{expense.posting_status}</span>
        </DataPanelRow>
        {expense.journal_entry_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Journal entry</span>
            <EntityLink kind="journal_entry" id={expense.journal_entry_id} label={expense.journal_entry_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        {expense.payment_account_uuid ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Payment account</span>
            <Link
              to={`/accounting/chart-of-accounts/register/${expense.payment_account_uuid}`}
              className="text-sm text-slate-700 hover:underline"
            >
              {accountLabel(expense.payment_account_number, expense.payment_account_name, expense.payment_account_uuid)}
            </Link>
          </DataPanelRow>
        ) : null}
        {expense.load_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Load</span>
            <EntityLink kind="load" id={expense.load_id} label={expense.load_number ?? expense.load_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        {expense.unit_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Unit</span>
            <EntityLink kind="unit" id={expense.unit_id} label={expense.unit_display_id ?? expense.unit_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        {expense.linked_work_order_uuid ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Work order</span>
            <EntityLink
              kind="work_order"
              id={expense.linked_work_order_uuid}
              label={expense.work_order_display_id ?? expense.linked_work_order_uuid.slice(0, 8)}
            />
          </DataPanelRow>
        ) : null}
        {expense.driver_uuid ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Driver</span>
            <EntityLink
              kind="driver"
              id={expense.driver_uuid}
              label={
                `${expense.driver_first_name ?? ""} ${expense.driver_last_name ?? ""}`.trim() ||
                expense.driver_uuid.slice(0, 8)
              }
            />
          </DataPanelRow>
        ) : null}
        {expense.memo ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Memo</span>
            <span className="text-sm text-gray-900">{expense.memo}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Created</span>
          <span className="text-sm text-gray-900">{formatDateUS(expense.created_at)}</span>
        </DataPanelRow>
      </DataPanel>

      <DataPanel title="Lines">
        <ParityTable<ExpenseDetailLine>
          columns={lineColumns}
          rows={lines}
          rowKey={(line) => line.id}
          loading={detailQuery.isFetching && !detailQuery.data}
          emptyText="No expense lines."
          density="compact"
          storageKey="expense-detail-lines"
        />
      </DataPanel>
    </AccountingSubNavWrapper>
  );
}
