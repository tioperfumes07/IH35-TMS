import { formatDateUS } from "../../lib/formatDate";
import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listPayments, type Payment, type PaymentMethod } from "../../api/accounting";
import { Button } from "../../components/Button";
import { BulkProgressDialog } from "../../components/bulk";
import { bulkRowLabelsFromRows, paymentBulkRowLabel } from "../../components/bulk/bulkRowLabels";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function paymentStatusSortKey(payment: Payment): string {
  if (payment.voided_at) return "voided";
  if (Number(payment.amount_unapplied_cents) === 0) return "fully applied";
  if (Number(payment.amount_applied_cents) > 0) return "partially applied";
  return "unapplied";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const bulk = useEntityBulkAction();
  const [pendingVoidIds, setPendingVoidIds] = useState<string[]>([]);
  const [pendingVoidLabels, setPendingVoidLabels] = useState<Record<string, string>>({});
  const [batchVoidOpen, setBatchVoidOpen] = useState(false);
  // BANK-SORT-ROLLOUT-ACCT: every visible column header sorts ASC/DESC; sort persists in the URL
  // (?sort=&dir=) so it survives reload / is shareable, same as Bills / Expenses.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [status, setStatus] = useState<"all" | "active" | "voided">("all");
  const [method, setMethod] = useState<"" | PaymentMethod | "factoring">("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const staged = useStagedListFilters({ applied: { status, method, dateFrom, dateTo }, empty: { status: "all" as const, method: "" as const, dateFrom: "", dateTo: "" }, onApply: (next) => { setStatus(next.status); setMethod(next.method); setDateFrom(next.dateFrom); setDateTo(next.dateTo); } });
  // ACCT-F5055 — Topbar Create→Receive payment uses ?create=1 (Bills/Expenses/Invoices parity).
  const recordOpen = searchParams.get("create") === "1";
  function setRecordOpen(next: boolean) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("create", "1");
        else params.delete("create");
        return params;
      },
      { replace: true }
    );
  }

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
        render: (row) => <span className={row.voided_at ? "text-gray-500 line-through" : "text-gray-900"}>{entityLabel(row.display_id, row.id, "Payment")}</span>,
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        sortValue: (row) => row.customer_name ?? "",
        render: (row) => (
          <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />
        ),
      },
      { key: "payment_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.payment_date) },
      { key: "payment_method", label: "Method", sortable: true },
      {
        key: "reference",
        label: "Reference",
        sortable: true,
        sortValue: (row) => row.reference ?? "",
        render: (row) => row.reference ?? "-",
      },
      { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_cents) },
      { key: "amount_applied_cents", label: "Applied", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_applied_cents) },
      {
        key: "amount_unapplied_cents",
        label: "Unapplied",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => money(row.amount_unapplied_cents),
      },
      {
        key: "matched_bank_transaction_id",
        label: "Bank txn",
        sortable: true,
        sortValue: (row) => row.matched_bank_transaction_id ?? "",
        render: (row) =>
          row.matched_bank_transaction_id ? (
            <EntityLink
              kind="bank_transaction"
              id={row.matched_bank_transaction_id}
              label={
                row.matched_bank_transaction_date
                  ? `${formatDateUS(row.matched_bank_transaction_date)}${
                      row.matched_bank_transaction_description ? ` — ${row.matched_bank_transaction_description}` : ""
                    }`
                  : entityLabel(row.matched_bank_transaction_description ?? null, row.matched_bank_transaction_id, "Bank transaction")
              }
            />
          ) : (
            "-"
          ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => paymentStatusSortKey(row),
        render: (row) => statusPill(row),
      },
    ],
    [],
  );

  const paymentsActiveFilterCount =
    (status !== "all" ? 1 : 0) + (method ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);

  const filterBar = (
    <div className="space-y-2 w-full">
      <CollapsedListFilters
        activeFilterCount={paymentsActiveFilterCount}
        onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
        testIdPrefix="payments"
        dataAttributes={{ "data-payments-filter-toolbar": "collapsed" }}
        searchSlot={
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Payment # or customer"
            className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-2 text-[13px]"
            aria-label="Search payments"
          />
        }
      >
        <div className="grid gap-2 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <SelectCombobox value={staged.draft.status} onChange={(event) => staged.setDraft({ ...staged.draft, status: event.target.value as "all" | "active" | "voided" })} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="voided">Voided</option>
            </SelectCombobox>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Method
            <SelectCombobox value={staged.draft.method} onChange={(event) => staged.setDraft({ ...staged.draft, method: event.target.value as "" | PaymentMethod | "factoring" })} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
              {METHOD_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            From
            <DatePicker value={staged.draft.dateFrom} onChange={(next) => staged.setDraft({ ...staged.draft, dateFrom: next })} className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            To
            <DatePicker value={staged.draft.dateTo} onChange={(next) => staged.setDraft({ ...staged.draft, dateTo: next })} className="h-9" />
          </label>
        </div>
      </CollapsedListFilters>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        {/* CLS-MONEY-KPI-FAKE-ZERO-REMAINDER-PAYMENTS — Amount/Applied/Unapplied used to render
            money(totals.*) with no isError awareness next to ListErrorBanner (ACCT-F5038). */}
        <span>Amount: {query.isError ? "—" : money(totals.amount)}</span>
        <span>Applied: {query.isError ? "—" : money(totals.applied)}</span>
        <span>Unapplied: {query.isError ? "—" : money(totals.unapplied)}</span>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Payments"
      subtitle="Customer payment recording and application"
      actions={<Button variant="secondary" onClick={() => navigate("/accounting/invoices")}>Invoices</Button>}
      createControl={<Button onClick={() => setRecordOpen(true)}>+ Record Payment</Button>}
    >
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        onRowClick={(row) => navigate(`/accounting/payments/${row.id}`)}
        filterBar={filterBar}
        suppressToolbarSearch
        exportFilename="payments"
        storageKey="payments-list"
        initialPageSize={50}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() => pushToast("You can select up to 200 payments at once.", "error")}
        batchActions={(selected) => (
          <Button
            size="sm"
            variant="danger"
            type="button"
            onClick={() => {
              const voidable = selected.filter((row) => !row.voided_at);
              setPendingVoidIds(voidable.map((row) => row.id));
              setPendingVoidLabels(bulkRowLabelsFromRows(voidable, paymentBulkRowLabel));
              setBatchVoidOpen(true);
            }}
          >
            Void
          </Button>
        )}
        emptyText="No payments found."
      />

      <VoidReasonModal
        open={batchVoidOpen}
        title="Void payments"
        entityRef={`${pendingVoidIds.length} selected`}
        minLength={10}
        onClose={() => setBatchVoidOpen(false)}
        onSubmit={async (reason) => {
          if (!selectedCompanyId || pendingVoidIds.length === 0) return;
          setBatchVoidOpen(false);
          await bulk.runBulk(
            {
              domain: "accounting",
              resource: "payments",
              ids: pendingVoidIds,
              action: "void",
              reason,
              operatingCompanyId: selectedCompanyId,
              invalidateKeys: [["accounting", "payments", selectedCompanyId]],
              rowLabels: pendingVoidLabels,
            },
            () => {
              setPendingVoidIds([]);
              setPendingVoidLabels({});
            }
          );
        }}
      />
      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
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
