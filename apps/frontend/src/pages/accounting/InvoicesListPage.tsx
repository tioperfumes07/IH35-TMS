import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle } from "lucide-react";
import { listInvoices, type InvoiceStatus } from "../../api/accounting";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CustomerAdjustmentModal } from "./modals/CustomerAdjustmentModal";
import { DriverDamageInvoiceModal } from "./modals/DriverDamageInvoiceModal";
import { DriverMiscInvoiceModal } from "./modals/DriverMiscInvoiceModal";
import { ManualInvoiceModal } from "./modals/ManualInvoiceModal";
import { VendorChargebackModal } from "./modals/VendorChargebackModal";
import { AccountingSubNav } from "./AccountingSubNav";
import { PAGE_SHELL_CLASS } from "../../components/layout/pageShellClasses";

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
  const { selectedCompanyId } = useCompanyContext();
  const [status, setStatus] = useState<"" | InvoiceStatus>("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createType, setCreateType] = useState<"driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual" | "from_load">("from_load");
  const [openModalType, setOpenModalType] = useState<null | "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual">(null);

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
    <div className={`${PAGE_SHELL_CLASS} space-y-3`}>
      <AccountingSubNav />
      <PageHeader
        title="Invoices"
        subtitle="Accounts receivable invoice list"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
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
            </select>
            <Button
              onClick={() => {
                if (createType === "from_load") {
                  navigate("/dispatch");
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
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <DataPanel title="Filters">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as "" | InvoiceStatus)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 sm:col-span-2 lg:col-span-2">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="INV-2026-00001 or customer" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            From issue date
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            To issue date
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
          <span>Total billed: {money(totals.total)}</span>
          <span>Open: {money(totals.open)}</span>
          <span>Rows: {invoices.length}</span>
        </div>
      </DataPanel>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50">
            <tr className="text-gray-600">
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
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={8}>
                  Loading invoices...
                </td>
              </tr>
            ) : null}
            {!query.isLoading && invoices.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={8}>
                  No invoices found for the selected filters.
                </td>
              </tr>
            ) : null}
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/accounting/invoices/${invoice.id}`)}>
                <td className="px-3 py-2 text-gray-900">
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
            ))}
          </tbody>
        </table>
      </div>
      {selectedCompanyId ? (
        <>
          <DriverDamageInvoiceModal
            open={openModalType === "driver_damage"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId, followUp) => {
              void query.refetch();
              if (followUp === "stay_open") return;
              setOpenModalType(null);
              if (followUp === "view_list") {
                navigate("/accounting/invoices");
                return;
              }
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <DriverMiscInvoiceModal
            open={openModalType === "driver_misc"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId, followUp) => {
              void query.refetch();
              if (followUp === "stay_open") return;
              setOpenModalType(null);
              if (followUp === "view_list") {
                navigate("/accounting/invoices");
                return;
              }
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <VendorChargebackModal
            open={openModalType === "vendor_chargeback"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId, followUp) => {
              void query.refetch();
              if (followUp === "stay_open") return;
              setOpenModalType(null);
              if (followUp === "view_list") {
                navigate("/accounting/invoices");
                return;
              }
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <CustomerAdjustmentModal
            open={openModalType === "customer_adjustment"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId, followUp) => {
              void query.refetch();
              if (followUp === "stay_open") return;
              setOpenModalType(null);
              if (followUp === "view_list") {
                navigate("/accounting/invoices");
                return;
              }
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <ManualInvoiceModal
            open={openModalType === "manual"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => setOpenModalType(null)}
            onCreated={(invoiceId, followUp) => {
              void query.refetch();
              if (followUp === "stay_open") return;
              setOpenModalType(null);
              if (followUp === "view_list") {
                navigate("/accounting/invoices");
                return;
              }
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
