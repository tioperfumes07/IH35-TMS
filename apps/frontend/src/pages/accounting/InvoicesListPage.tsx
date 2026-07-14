import { formatDateUS } from "../../lib/formatDate";
import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { ArrowRightCircle } from "lucide-react";
import { listInvoices, type Invoice, type InvoiceStatus } from "../../api/accounting";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
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
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { useToast } from "../../components/Toast";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

// INVOICE-LISTFILTER-01: real InvoiceStatus values go to the backend `status` param; the pseudo-values
// ("not_sent" / "with_balance") are QBO-style client-side derived filters over already-fetched rows.
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

export function InvoicesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const bulk = useEntityBulkAction();
  const [sentModalOpen, setSentModalOpen] = useState(false);
  const [factoredModalOpen, setFactoredModalOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [batchId, setBatchId] = useState("");
  const [status, setStatus] = useState<InvoiceListFilter>("");
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
    () => [{ value: "", label: "All customers" }, ...customerOptions.map((c) => ({ value: c.id, label: c.name }))],
    [customerOptions]
  );
  const [createType, setCreateType] = useState<"driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual" | "from_load">("from_load");
  const [openModalType, setOpenModalType] = useState<null | "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual">(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [tableResetKey, setTableResetKey] = useState(0);

  const query = useQuery({
    queryKey: ["accounting", "invoices", selectedCompanyId, status, customerId, search, fromDate, toDate],
    queryFn: () =>
      listInvoices(selectedCompanyId!, {
        // Only real statuses hit the backend; pseudo-filters (not_sent/with_balance) apply client-side below.
        status: isRealInvoiceStatus(status) ? status : undefined,
        customer_id: customerId || undefined,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }).then((res) => res.invoices),
    enabled: Boolean(selectedCompanyId),
  });

  const invoices = useMemo(() => {
    const all = query.data ?? [];
    // Client-side QBO pseudo-filters over the fetched page.
    if (status === "not_sent") return all.filter((row) => row.status === "draft" || !row.sent_at);
    if (status === "with_balance") return all.filter((row) => Number(row.amount_open_cents ?? 0) > 0);
    return all;
  }, [query.data, status]);

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
        render: (row) =>
          row.source_load_id ? <EntityLink kind="load" id={row.source_load_id} label={row.source_load_id.slice(0, 8)} /> : "—",
      },
      {
        key: "memo",
        label: "Memo",
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

  const filterBar = (
    <DataPanel title="Filters">
      <div className="grid gap-2 md:grid-cols-6">
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
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
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
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="INV-2026-00001 or customer" className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
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
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
        <span>Total billed: {money(totals.total)}</span>
        <span>Open: {money(totals.open)}</span>
        <span>Rows: {invoices.length}</span>
      </div>
    </DataPanel>
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
            Factoring batch ID
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
              placeholder="UUID of factoring advance batch"
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
