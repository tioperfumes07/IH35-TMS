import { formatDateUS } from "../../lib/formatDate";
import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listPayments, type Payment, type PaymentMethod } from "../../api/accounting";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusPill(payment: Payment) {
  if (payment.voided_at) {
    return <StatusBadge variant="neutral">voided</StatusBadge>;
  }
  if (Number(payment.amount_unapplied_cents) === 0) {
    return <StatusBadge variant="positive">fully applied</StatusBadge>;
  }
  if (Number(payment.amount_applied_cents) > 0) {
    return <StatusBadge variant="warn">partially applied</StatusBadge>;
  }
  return <StatusBadge variant="info">unapplied</StatusBadge>;
}

const METHOD_OPTIONS: Array<{ value: "" | PaymentMethod | "factoring"; label: string }> = [
  { value: "", label: "All methods" },
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "factoring", label: "Factoring" },
  { value: "other", label: "Other" },
];

export function PaymentsListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const [status, setStatus] = useState<"all" | "active" | "voided">("all");
  const [method, setMethod] = useState<"" | PaymentMethod | "factoring">("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);

  const query = useQuery({
    queryKey: ["accounting", "payments", selectedCompanyId, status, method, search, dateFrom, dateTo],
    queryFn: async () => {
      const filters: {
        status: "all" | "active" | "voided";
        payment_method?: PaymentMethod;
        search?: string;
        date_from?: string;
        date_to?: string;
      } = {
        status,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      };
      if (method === "factoring") {
        const [adv, reserve] = await Promise.all([
          listPayments(selectedCompanyId!, { ...filters, payment_method: "factoring_advance" }),
          listPayments(selectedCompanyId!, { ...filters, payment_method: "factoring_reserve" }),
        ]);
        const rows = [...adv.rows, ...reserve.rows].sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)));
        return { rows, total: rows.length };
      }
      if (method) filters.payment_method = method;
      return listPayments(selectedCompanyId!, filters);
    },
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.amount += Number(row.amount_cents ?? 0);
        acc.applied += Number(row.amount_applied_cents ?? 0);
        acc.unapplied += Number(row.amount_unapplied_cents ?? 0);
        return acc;
      },
      { amount: 0, applied: 0, unapplied: 0 }
    );
  }, [rows]);

  const columns = useMemo<ParityColumn<Payment>[]>(
    () => [
      {
        key: "display_id",
        label: "Payment #",
        sortable: true,
        render: (row) => <span className={row.voided_at ? "text-gray-500 line-through" : "text-gray-900"}>{row.display_id}</span>,
      },
      { key: "customer_name", label: "Customer", sortable: true },
      { key: "payment_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.payment_date) },
      { key: "payment_method", label: "Method", sortable: true },
      { key: "reference", label: "Reference", render: (row) => row.reference ?? "-" },
      { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_cents) },
      { key: "amount_applied_cents", label: "Applied", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_applied_cents) },
      { key: "amount_unapplied_cents", label: "Unapplied", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_unapplied_cents) },
      { key: "status", label: "Status", render: (row) => statusPill(row) },
    ],
    [],
  );

  const filterBar = (
    <div className="grid gap-2 md:grid-cols-5 w-full">
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
        Status
        <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as "all" | "active" | "voided")} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="voided">Voided</option>
        </SelectCombobox>
      </label>

      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
        Method
        <SelectCombobox value={method} onChange={(event) => setMethod(event.target.value as "" | PaymentMethod | "factoring")} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
          {METHOD_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectCombobox>
      </label>

      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
        Search by payment # or customer
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          From
          <DatePicker value={dateFrom} onChange={(next) => setDateFrom(next)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          To
          <DatePicker value={dateTo} onChange={(next) => setDateTo(next)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
        </label>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600 md:col-span-5">
        <span>Amount: {money(totals.amount)}</span>
        <span>Applied: {money(totals.applied)}</span>
        <span>Unapplied: {money(totals.unapplied)}</span>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Payments"
      subtitle="Customer payment recording and application"
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/accounting/invoices")}>Invoices</Button>
          <Button onClick={() => setRecordOpen(true)}>+ Record Payment</Button>
        </div>
      }
    >
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        onRowClick={(row) => navigate(`/accounting/payments/${row.id}`)}
        filterBar={filterBar}
        exportFilename="payments"
        storageKey="payments-list"
        initialPageSize={50}
        emptyText="No payments found."
      />

      {selectedCompanyId ? (
        <RecordPaymentModal
          open={recordOpen}
          operatingCompanyId={selectedCompanyId}
          onClose={() => setRecordOpen(false)}
          onRecorded={(paymentId) => {
            setRecordOpen(false);
            navigate(`/accounting/payments/${paymentId}`);
          }}
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
