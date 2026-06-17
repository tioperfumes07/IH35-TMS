import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle } from "lucide-react";
import { listInvoices, type InvoiceStatus } from "../../api/accounting";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CustomerAdjustmentModal } from "./modals/CustomerAdjustmentModal";
import { DriverDamageInvoiceModal } from "./modals/DriverDamageInvoiceModal";
import { DriverMiscInvoiceModal } from "./modals/DriverMiscInvoiceModal";
import { ManualInvoiceModal } from "./modals/ManualInvoiceModal";
import { VendorChargebackModal } from "./modals/VendorChargebackModal";
import { InvoiceCreateModal } from "./InvoiceCreateModal";
import { AccountingSubNav } from "./AccountingSubNav";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  TableSelection,
  TableSelectionHeader,
  useBulkSelection,
} from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { useToast } from "../../components/Toast";

const STATUS_OPTIONS: Array<{ value: "" | InvoiceStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
  { value: "factored", label: "Factored" },
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
  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });
  const [sentModalOpen, setSentModalOpen] = useState(false);
  const [factoredModalOpen, setFactoredModalOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [status, setStatus] = useState<"" | InvoiceStatus>("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createType, setCreateType] = useState<"driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual" | "from_load">("from_load");
  const [openModalType, setOpenModalType] = useState<null | "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual">(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);

  const query = useQuery({
    queryKey: ["accounting", "invoices", selectedCompanyId, status, search, fromDate, toDate],
    queryFn: () =>
      listInvoices(selectedCompanyId!, {
        status: status || undefined,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }).then((res) => res.invoices),
    enabled: Boolean(selectedCompanyId),
  });

  const invoices = query.data ?? [];
  const pageRowIds = useMemo(() => invoices.map((invoice) => invoice.id), [invoices]);

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
          ids: Array.from(selection.selectedIds),
          action,
          payload,
          operatingCompanyId: selectedCompanyId,
          invalidateKeys: [["accounting", "invoices", selectedCompanyId]],
        },
        () => {
          selection.clear();
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

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title="Invoices"
        subtitle="Accounts receivable invoice list"
        actions={
          <div className="flex items-center gap-2">
            <SelectCombobox
              value={createType}
              onChange={(event) => setCreateType(event.target.value as typeof createType)}
              className="h-8 rounded border border-gray-300 bg-white px-2 text-[12px]"
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
                if (createType === "from_load") {
                  setCreateFlowOpen(true);
                  return;
                }
                setOpenModalType(createType);
              }}
            >
              + Create
            </Button>
          </div>
        }
      />
      <DataPanel title="Filters">
        <div className="grid gap-2 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as "" | InvoiceStatus)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="INV-2026-00001 or customer" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            From issue date
            <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            To issue date
            <DatePicker value={toDate} onChange={(next) => setToDate(next)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
          <span>Total billed: {money(totals.total)}</span>
          <span>Open: {money(totals.open)}</span>
          <span>Rows: {invoices.length}</span>
        </div>
      </DataPanel>

      <BulkActionBar
        selectedCount={selection.count}
        actions={[
          { id: "mark-sent", label: "Mark sent", onClick: () => setSentModalOpen(true) },
          { id: "mark-factored", label: "Mark factored", onClick: () => setFactoredModalOpen(true) },
        ]}
        onClear={selection.clear}
      />

      <TableSelection
        rows={invoices}
        getId={(invoice) => invoice.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        onCapExceeded={(message) => pushToast(message, "error")}
      >
        {(selectCtx) => (
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50">
            <tr className="text-gray-600">
              <th className="w-10 px-2 py-2">
                <TableSelectionHeader
                  selectedIds={selection.selectedIds}
                  pageRowIds={pageRowIds}
                  onSelectionChange={selection.setSelectedIds}
                  onCapExceeded={(message) => pushToast(message, "error")}
                />
              </th>
              <th className="px-3 py-2 font-semibold">Invoice</th>
              <th className="px-3 py-2 font-semibold">Customer</th>
              <th className="px-3 py-2 font-semibold">Issue</th>
              <th className="px-3 py-2 font-semibold">Due</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Chargeback flag</th>
              <th className="px-3 py-2 font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Open</th>
            </tr>
          </thead>
          <tbody>
            {query.isError ? (
              <tr>
                <td colSpan={9} className="p-0">
                  <ListErrorState
                    title="Couldn't load invoices"
                    {...formatQueryErrorDetail(query.error)}
                    onRetry={() => void query.refetch()}
                  />
                </td>
              </tr>
            ) : null}
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={9}>
                  Loading invoices...
                </td>
              </tr>
            ) : null}
            {!query.isError && !query.isLoading && invoices.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={9}>
                  No invoices found for the selected filters.
                </td>
              </tr>
            ) : null}
            {!query.isError
              ? invoices.map((invoice) => (
              <tr key={invoice.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/accounting/invoices/${invoice.id}`)}>
                <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select invoice ${invoice.display_id}`}
                    checked={selectCtx.isSelected(invoice.id)}
                    onChange={() => selectCtx.toggle(invoice.id)}
                  />
                </td>
                <td className="code-cell px-3 py-2 text-gray-900">
                  <span className="inline-flex items-center gap-1">
                    {invoice.display_id}
                    {invoice.factoring_advance_id ? <ArrowRightCircle className="h-3.5 w-3.5 text-amber-600" /> : null}
                  </span>
                </td>
                <td className="min-w-0 max-w-[240px] px-3 py-2 text-gray-700">
                  {(() => {
                    const v = invoice.customer_name ?? "-";
                    return (
                      <span title={v !== "-" ? v : undefined} className="single-line-name">
                        {v}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-gray-700">{invoice.issue_date}</td>
                <td className="px-3 py-2 text-gray-700">{invoice.due_date}</td>
                <td className="px-3 py-2 text-gray-700">{invoice.status}</td>
                <td className="px-3 py-2 text-gray-700">
                  {invoice.source_load_chargeback_requested ? (
                    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      flagged
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-gray-700">{money(invoice.total_cents)}</td>
                <td className="px-3 py-2 text-gray-700">{money(invoice.amount_open_cents)}</td>
              </tr>
            ))
              : null}
          </tbody>
        </table>
      </div>
        )}
      </TableSelection>

      <BulkActionModal
        open={sentModalOpen}
        actionLabel="Mark sent"
        affectedCount={selection.count}
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
        affectedCount={selection.count}
        description="Attach selected invoices to a factoring batch."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Factoring batch ID
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
    </div>
  );
}
