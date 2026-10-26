import { formatDateUS } from "../../lib/formatDate";
import { FILTER_CONTROL_SIZE_CLASS } from "../../design/tokens";
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
import { SelectCombobox } from "../../components/Combobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { useUrlSort } from "../../hooks/useUrlSort";

import { formatUsdCents } from "../../lib/money";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { statusOptions } from "../../lib/statusListParams";
import { moneyListKpiCard } from "./moneyListKpiCard";
import { FORM_LABEL_STACK_CLASS } from "../../components/forms/inputClass";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

function paymentOpenCentsForDisplay(payment: Payment): number {
  if (payment.voided_at) return 0;
  return Number(payment.amount_unapplied_cents ?? 0) || 0;
}

function paymentVarianceCents(payment: Payment): number {
  const total = Number(payment.amount_cents ?? 0) || 0;
  const applied = payment.voided_at ? 0 : Number(payment.amount_applied_cents ?? 0) || 0;
  const open = paymentOpenCentsForDisplay(payment);
  return total - applied - open;
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
  // U12 (owner UI register 2026-10-03) — status is a multi-select; default Active; none picked = every payment.
  // FILTER-MULTI-01 — live apply (no staged Apply/Cancel popover).
  const [status, setStatus] = useState<Array<"active" | "voided">>(["active"]);
  const [method, setMethod] = useState<"" | PaymentMethod | "factoring">("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    queryKey: ["accounting", "payments", selectedCompanyId, status, method, search, dateFrom, dateTo, sortKey, sortDirection],
    queryFn: async () => {
      const filters: {
        status: Array<"all" | "active" | "voided">;
        payment_method?: PaymentMethod;
        search?: string;
        date_from?: string;
        date_to?: string;
        sort?: string;
        dir?: "asc" | "desc";
        limit?: number;
      } = {
        status: status.length ? status : ["all"],
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        // SORT LAW — push URL sort into SQL ORDER BY; never reorder only the silent ≤100 page.
        sort: sortKey || undefined,
        dir: sortKey ? sortDirection : undefined,
        limit: 100,
      };
      if (method === "factoring") {
        const [adv, reserve] = await Promise.all([
          listPayments(selectedCompanyId!, { ...filters, payment_method: "factoring_advance" }),
          listPayments(selectedCompanyId!, { ...filters, payment_method: "factoring_reserve" }),
        ]);
        // Two method slices each SQL-sorted; merge then re-order for the union view.
        const rows = [...adv.rows, ...reserve.rows];
        if (sortKey) {
          const dirMul = sortDirection === "asc" ? 1 : -1;
          rows.sort((a, b) => {
            const av = (a as Record<string, unknown>)[sortKey];
            const bv = (b as Record<string, unknown>)[sortKey];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === "number" && typeof bv === "number") return (av - bv) * dirMul;
            return String(av).localeCompare(String(bv)) * dirMul;
          });
        } else {
          rows.sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)));
        }
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
        acc.total += Number(row.amount_cents ?? 0);
        acc.open += paymentOpenCentsForDisplay(row);
        acc.variance += paymentVarianceCents(row);
        return acc;
      },
      { total: 0, open: 0, variance: 0 }
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
      { key: "amount_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_cents) },
      {
        key: "amount_unapplied_cents",
        label: "Open",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (row) => paymentOpenCentsForDisplay(row),
        render: (row) => money(paymentOpenCentsForDisplay(row)),
      },
      {
        key: "variance_cents",
        label: "Variance",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (row) => paymentVarianceCents(row),
        render: (row) => {
          const variance = paymentVarianceCents(row);
          return (
            <span className={`font-semibold ${variance !== 0 ? "text-red-700" : "text-[#6B7280]"}`}>{money(variance)}</span>
          );
        },
      },
      {
        key: "amount_applied_cents",
        label: "Applied",
        sortable: true,
        defaultHidden: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => money(row.amount_applied_cents),
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
    (status.length === 1 && status[0] === "active" ? 0 : 1) + (method ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);

  const filterBar = (
    <div className="space-y-2 w-full" data-payments-filter-toolbar="visible">
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Payment # or customer"
        searchTestId="payments-search-input"
        onClearAll={() => {
          setSearch("");
          setStatus(["active"]);
          setMethod("");
          setDateFrom("");
          setDateTo("");
        }}
        activeFilterCount={paymentsActiveFilterCount}
        testIdPrefix="payments"
      >
        <MultiSelectDropdown
          label="Status"
          options={statusOptions({ active: "Active", voided: "Voided" })}
          selected={status}
          onChange={(next) => setStatus(next as Array<"active" | "voided">)}
          allLabel="All"
          data-testid="payments-status-filter"
        />
        <label className={FORM_LABEL_STACK_CLASS}>
          Method
          <SelectCombobox
            value={method}
            onChange={(event) => setMethod(event.target.value as "" | PaymentMethod | "factoring")}
            className={`${FILTER_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
          >
            {METHOD_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className={FORM_LABEL_STACK_CLASS}>
          From
          <DatePicker value={dateFrom} onChange={setDateFrom} className={FILTER_CONTROL_SIZE_CLASS} />
        </label>
        <label className={FORM_LABEL_STACK_CLASS}>
          To
          <DatePicker value={dateTo} onChange={setDateTo} className={FILTER_CONTROL_SIZE_CLASS} />
        </label>
      </MoneyListToolbar>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Payments"
      subtitle="Customer payment recording and application"
      actions={<Button variant="secondary" onClick={() => navigate("/accounting/invoices")}>Invoices</Button>}
      createControl={<Button onClick={() => setRecordOpen(true)}>+ Record Payment</Button>}
      kpiStrip={
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" data-testid="payments-kpi-strip">
          {/* Total: {query.isError ? "—" : money(totals.total)} | Open: {query.isError ? "—" : money(totals.open)} | Variance: {query.isError ? "—" : money(totals.variance)} */}
          {query.isError ? (
            <>
              {moneyListKpiCard("Total", "—", "Error loading")}
              {moneyListKpiCard("Open", "—", "Error loading")}
              {moneyListKpiCard("Variance", "—", "Error loading")}
              {moneyListKpiCard("Rows", "—", "Error loading")}
            </>
          ) : (
            <>
              {moneyListKpiCard("Total", money(totals.total), `${rows.length} payments`)}
              {moneyListKpiCard(
                "Open",
                money(totals.open),
                "Unapplied balance",
                totals.open > 0 ? "warn" : "neutral",
              )}
              {moneyListKpiCard(
                "Variance",
                money(totals.variance),
                totals.variance !== 0 ? "Does not tie" : "Tied",
                totals.variance !== 0 ? "danger" : "neutral",
              )}
              {moneyListKpiCard("Rows", String(rows.length), "On this page")}
            </>
          )}
        </div>
      }
    >
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <ParityTable
        title="Customer payments received"
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
        sortMode="external"
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
            {`Void ${selected.filter((row) => !row.voided_at).length} selected`}
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
