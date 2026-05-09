import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle } from "lucide-react";
import { listInvoices, type InvoiceStatus } from "../../api/accounting";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

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
    <div className="space-y-3">
      <PageHeader title="Invoices" subtitle="Accounts receivable invoice list" actions={<Button onClick={() => navigate("/dispatch")}>+ Create From Load</Button>} />

      <DataPanel title="Filters">
        <div className="grid gap-2 md:grid-cols-5">
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
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
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
              <th className="px-3 py-2 font-semibold">Total</th>
              <th className="px-3 py-2 font-semibold">Open</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={7}>
                  Loading invoices...
                </td>
              </tr>
            ) : null}
            {!query.isLoading && invoices.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={7}>
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
                <td className="px-3 py-2 text-gray-700">{invoice.customer_name ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{invoice.issue_date}</td>
                <td className="px-3 py-2 text-gray-700">{invoice.due_date}</td>
                <td className="px-3 py-2 text-gray-700">{invoice.status}</td>
                <td className="px-3 py-2 text-gray-700">{money(invoice.total_cents)}</td>
                <td className="px-3 py-2 text-gray-700">{money(invoice.amount_open_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
