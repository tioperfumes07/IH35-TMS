import { formatDateUS } from "../../lib/formatDate";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { ArrowRightCircle } from "lucide-react";
import { listInvoices, type Invoice, type InvoiceStatus } from "../../api/accounting";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CustomerAdjustmentModal } from "./modals/CustomerAdjustmentModal";
import { DriverDamageInvoiceModal } from "./modals/DriverDamageInvoiceModal";
import { DriverMiscInvoiceModal } from "./modals/DriverMiscInvoiceModal";
import { ManualInvoiceModal } from "./modals/ManualInvoiceModal";
import { VendorChargebackModal } from "./modals/VendorChargebackModal";
import { InvoiceCreateModal } from "./InvoiceCreateModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { customerFilterReferenceOptions } from "../../components/parity/referenceOptionLabels";
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { useToast } from "../../components/Toast";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";
import { EntityPicker } from "../../components/parity/EntityPicker";

// INVOICE-LISTFILTER-01: real InvoiceStatus values go to the backend `status` param.
// "with_balance" is a UI label for server-side has_balance=true (aging-compatible open AR).
// "not_sent" remains a client-side derived filter over the fetched page (no server contract).
// NOTE: QBO's "Viewed" filter is intentionally NOT offered — accounting.invoices has no read-receipt /
// viewed_at tracking field, so a "Viewed" option would silently return nothing (do not fabricate).
type InvoiceListFilter = "" | InvoiceStatus | "not_sent" | "with_balance";

const REAL_INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "partial", "paid", "void", "factored"];
function isRealInvoiceStatus(value: string): value is InvoiceStatus {
  return (REAL_INVOICE_STATUSES as string[]).includes(value);
}

const STATUS_OPTIONS: Array<{ value: InvoiceListFilter; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
  { value: "factored", label: "Factored" },
  { value: "not_sent", label: "Not sent" },
  { value: "with_balance", label: "With balance" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function invoiceFilterFromSearchParams(searchParams: URLSearchParams): {
  customerId: string;
  status: InvoiceListFilter;
  hasBalance: boolean;
} {
  const customerId = searchParams.get("customer_id") ?? "";
  const hasBalanceParam = searchParams.get("has_balance") === "true";
  const statusRaw = searchParams.get("status") ?? "";
  // Legacy deep-link status=with_balance → treat as has_balance (UI still shows "With balance").
  const hasBalance = hasBalanceParam || statusRaw === "with_balance";
  let status: InvoiceListFilter = "";
  if (hasBalance) status = "with_balance";
  else if (statusRaw === "not_sent") status = "not_sent";
  else if (isRealInvoiceStatus(statusRaw)) status = statusRaw;
  return { customerId, status, hasBalance };
}

export function InvoicesListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const bulk = useEntityBulkAction();
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [sentModalOpen, setSentModalOpen] = useState(false);
  const [factoredModalOpen, setFactoredModalOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [batchId, setBatchId] = useState("");
  // Bidirectional URL sync: customer_id / status / has_balance are searchParams-driven so
  // same-route updates and browser back/forward stay truthful (no local-only stale seed).
  const { customerId, status, hasBalance } = invoiceFilterFromSearchParams(searchParams);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // One-shot migrate legacy ?status=with_balance → ?has_balance=true (replace, no history spam).
  useEffect(() => {
    if (searchParams.get("status") !== "with_balance") return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("status");
        next.set("has_balance", "true");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  function setCustomerId(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("customer_id", next);
        else params.delete("customer_id");
        return params;
      },
      { replace: true }
    );
  }

  function setStatus(next: InvoiceListFilter) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("status");
        params.delete("has_balance");
        if (next === "with_balance") {
          params.set("has_balance", "true");
        } else if (next) {
          params.set("status", next);
        }
        return params;
      },
      { replace: true }
    );
  }

  // Customer picker options — pass limit:200 (endpoint defaults to 50, would silently truncate).
  const customersQuery = useQuery({
    queryKey: ["mdata", "customers", "invoice-filter", selectedCompanyId],
    queryFn: () => listCustomers({ operating_company_id: selectedCompanyId!, limit: 200 }),
    enabled: Boolean(selectedCompanyId),
  });
  const customerOptions = customersQuery.data?.customers ?? [];
  // FIX-06: ReferenceSelect options for the filter dropdown — "All customers" (empty value clears
  // the server-side filter) plus the canonical customer list ReferenceSelect reads/writes.
  const customerFilterOptions = useMemo<ReferenceOption[]>(
    () => customerFilterReferenceOptions(customerOptions),
    [customerOptions]
  );
  const [createType, setCreateType] = useState<"driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual" | "from_load">("from_load");
  const [openModalType, setOpenModalType] = useState<null | "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual">(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [tableResetKey, setTableResetKey] = useState(0);

  const query = useQuery({
    queryKey: ["accounting", "invoices", selectedCompanyId, status, hasBalance, customerId, search, fromDate, toDate],
    queryFn: () =>
      listInvoices(selectedCompanyId!, {
        status: isRealInvoiceStatus(status) ? status : undefined,
        has_balance: hasBalance || undefined,
        customer_id: customerId || undefined,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const invoices = useMemo(() => {
    const all = query.data?.invoices ?? [];
    // Client-side QBO pseudo-filter only for not_sent (no server contract).
    // with_balance / has_balance is server-filtered before LIMIT — do not re-slice a page.
    if (status === "not_sent") return all.filter((row) => row.status === "draft" || !row.sent_at);
    return all;
  }, [query.data?.invoices, status]);

  const listMeta = useMemo(
    () => ({
      total: query.data?.total,
      hasMore: query.data?.has_more,
    }),
    [query.data?.total, query.data?.has_more]
  );

  const runInvoiceBulk = async (action: "mark_sent" | "mark_factored", payload?: Record<string, unknown>) => {
    if (!selectedCompanyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    try {
      await bulk.runBulk(
        {
          domain: "accounting",
          resource: "invoices",
          ids: pendingIds,
          action,
          payload,
          operatingCompanyId: selectedCompanyId,
          invalidateKeys: [["accounting", "invoices", selectedCompanyId]],
        },
        () => {
          setPendingIds([]);
          setTableResetKey((k) => k + 1);
          void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
        }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Bulk invoice update failed", "error");
    }
  };

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, row) => {
        acc.total += Number(row.total_cents ?? 0);
        acc.open += Number(row.amount_open_cents ?? 0);
        return acc;
      },
      { total: 0, open: 0 }
    );
  }, [invoices]);

  const columns = useMemo<ParityColumn<Invoice>[]>(
    () => [
      {
        key: "display_id",
        label: "Invoice",
        sortable: true,
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            <EntityLink kind="invoice" id={row.id} label={row.display_id} />
            {row.factoring_advance_id ? <ArrowRightCircle className="h-3.5 w-3.5 text-slate-600" /> : null}
          </span>
        ),
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        sortValue: (row) => row.customer_name ?? row.customer_id,
        render: (row) => (
          <span title={row.customer_name ?? undefined} className="single-line-name">
            <EntityLink kind="customer" id={row.customer_id} label={row.customer_name ?? row.customer_id} />
          </span>
        ),
      },
      { key: "issue_date", label: "Issue", sortable: true, render: (row) => formatDateUS(row.issue_date) },
      { key: "due_date", label: "Due", sortable: true, render: (row) => formatDateUS(row.due_date) },
      { key: "status", label: "Status", sortable: true },
      {
        key: "source_load_chargeback_requested",
        label: "Chargeback flag",
        sortable: true,
        sortValue: (row) => (row.source_load_chargeback_requested ? 1 : 0),
        render: (row) =>
          row.source_load_chargeback_requested ? (
            <span className="rounded-sm border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
              flagged
            </span>
          ) : (
            "—"
          ),
      },
      { key: "total_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.total_cents) },
      { key: "amount_open_cents", label: "Open", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_open_cents) },
      {
        key: "source_load_id",
        label: "Load #",
        sortable: true,
        sortValue: (row) => row.source_load_id ?? "",
        render: (row) =>
          row.source_load_id ? <EntityLink kind="load" id={row.source_load_id} label={row.source_load_id.slice(0, 8)} /> : "—",
      },
      {
        key: "memo",
        label: "Memo",
        sortable: true,
        sortValue: (row) => row.internal_notes ?? row.customer_notes ?? "",
        render: (row) => {
          const memo = row.internal_notes ?? row.customer_notes;
          return (
            <span title={memo ?? undefined} className="single-line-name">
              {memo || "—"}
            </span>
          );
        },
      },
    ],
    [],
  );

  const invoicesActiveFilterCount =
    (status ? 1 : 0) + (customerId ? 1 : 0) + (fromDate || toDate ? 1 : 0);

  const filterBar = (
    <div className="space-y-2">
      {customersQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load customer filters: ${(customersQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void customersQuery.refetch()}
        />
      ) : null}
      <CollapsedListFilters
        activeFilterCount={invoicesActiveFilterCount}
        testIdPrefix="invoices"
        dataAttributes={{ "data-invoices-filter-toolbar": "collapsed" }}
        searchSlot={
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="INV-2026-00001 or customer"
            className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-2 text-[13px]"
            aria-label="Search invoices"
          />
        }
      >
        <div className="grid gap-2 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as InvoiceListFilter)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
            Customer
            {/* A3/FIX-06: shared ReferenceSelect gives the customer FILTER the inline "+ Add new
                customer" row too (writes to canonical mdata.customers — same table customerOptions
                reads from). */}
            <ReferenceSelect
              value={customerId || null}
              onChange={(next) => setCustomerId(next ?? "")}
              options={customerFilterOptions}
              createKind="customer"
              operatingCompanyId={selectedCompanyId ?? ""}
              placeholder="All customers"
              disabled={!selectedCompanyId}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            From issue date
            <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            To issue date
            <DatePicker value={toDate} onChange={(next) => setToDate(next)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>
      </CollapsedListFilters>
      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span>Total billed: {money(totals.total)}</span>
        <span>Open: {money(totals.open)}</span>
        <span>
          Rows: {invoices.length}
          {typeof listMeta.total === "number" ? ` of ${listMeta.total}` : ""}
          {listMeta.hasMore ? " (more available)" : ""}
        </span>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Invoices"
      subtitle="Accounts receivable invoice list"
      actions={
        <div className="flex items-center gap-2">
          <SelectCombobox
            value={createType}
            onChange={(event) => setCreateType(event.target.value as typeof createType)}
            className="h-8 rounded-sm border border-gray-300 bg-white px-2 text-[12px]"
          >
            <option value="from_load">From load</option>
            <option value="driver_damage">Driver damage</option>
            <option value="driver_misc">Driver misc</option>
            <option value="vendor_chargeback">Vendor chargeback</option>
            <option value="customer_adjustment">Customer adjustment</option>
            <option value="manual">Manual</option>
          </SelectCombobox>
          <Button
            onClick={() => {
              if (createType === "from_load") { setCreateFlowOpen(true); return; }
              setOpenModalType(createType);
            }}
          >
            + Create
          </Button>
        </div>
      }
    >
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <ParityTable
        key={tableResetKey}
        columns={columns}
        rows={invoices}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && invoices.length === 0)}
        onRowClick={(row) => navigate(`/accounting/invoices/${row.id}`)}
        filterBar={filterBar}
        exportFilename="invoices"
        storageKey="invoices-list"
        initialPageSize={50}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() => pushToast("You can select up to 200 invoices at once.", "error")}
        batchActions={(selected) => (
          <>
            <button
              type="button"
              className="rounded-sm border border-gray-300 px-1.5 py-0.5"
              onClick={() => {
                setPendingIds(selected.map((row) => row.id));
                setSentModalOpen(true);
              }}
            >
              Mark sent
            </button>
            <button
              type="button"
              className="rounded-sm border border-gray-300 px-1.5 py-0.5"
              onClick={() => {
                setPendingIds(selected.map((row) => row.id));
                setFactoredModalOpen(true);
              }}
            >
              Mark factored
            </button>
          </>
        )}
        emptyText="No invoices found for the selected filters."
      />

      <BulkActionModal
        open={sentModalOpen}
        actionLabel="Mark sent"
        affectedCount={pendingIds.length}
        description="Mark selected draft invoices as sent."
        onCancel={() => setSentModalOpen(false)}
        onConfirm={() => {
          setSentModalOpen(false);
          void runInvoiceBulk("mark_sent");
        }}
      />

      <BulkActionModal
        open={factoredModalOpen}
        actionLabel="Mark factored"
        affectedCount={pendingIds.length}
        description="Attach selected invoices to a factoring batch."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Factoring batch
            {/* C1 PICKER LAW: was a raw-UUID box on a BULK action — one mistyped id attaches every
                selected invoice to the wrong factoring batch. Read-only pick: creating an advance is
                a money document submitted to the factor, never an inline dropdown act. */}
            <EntityPicker
              kind="factoring_advance"
              operatingCompanyId={selectedCompanyId ?? ""}
              value={batchId || null}
              onChange={(next) => setBatchId(next ?? "")}
              enabled={factoredModalOpen}
              placeholder="Select factoring batch"
              className="mt-1"
            />
          </label>
        }
        onCancel={() => setFactoredModalOpen(false)}
        onConfirm={() => {
          setFactoredModalOpen(false);
          void runInvoiceBulk("mark_factored", { batch_id: batchId.trim() });
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
        resolveRowHref={(id) => `/accounting/invoices/${encodeURIComponent(id)}`}
      />

      {selectedCompanyId ? (
        <>
          <DriverDamageInvoiceModal
            open={openModalType === "driver_damage"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <DriverMiscInvoiceModal
            open={openModalType === "driver_misc"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <VendorChargebackModal
            open={openModalType === "vendor_chargeback"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <CustomerAdjustmentModal
            open={openModalType === "customer_adjustment"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <ManualInvoiceModal
            open={openModalType === "manual"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <InvoiceCreateModal open={createFlowOpen} operatingCompanyId={selectedCompanyId} onClose={() => setCreateFlowOpen(false)} />
        </>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
