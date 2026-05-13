import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { listBills, listPaymentsForBill, type BillStatus, type VendorBill } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusBadgeClass(status: BillStatus) {
  if (status === "paid") return "bg-green-100 text-green-800";
  if (status === "partial") return "bg-amber-100 text-amber-900";
  if (status === "voided") return "bg-gray-200 text-gray-700";
  return "bg-red-50 text-red-800";
}

export function BillsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [status, setStatus] = useState<"" | BillStatus | "unpaid">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const billsQuery = useQuery({
    queryKey: ["accounting", "bills", companyId, status],
    queryFn: () =>
      listBills(companyId, {
        include_balance: true,
        status: status || undefined,
        limit: 200,
      }),
    enabled: Boolean(companyId),
  });

  const paymentsQuery = useQuery({
    queryKey: ["accounting", "bill-payments", companyId, expandedId],
    queryFn: () => listPaymentsForBill(expandedId!, companyId),
    enabled: Boolean(companyId && expandedId),
  });

  const rows = billsQuery.data?.rows ?? [];

  const expandedBill = useMemo(() => rows.find((b) => b.id === expandedId) ?? null, [rows, expandedId]);

  function toggleExpand(bill: VendorBill) {
    if (bill.status !== "partial") return;
    setExpandedId((cur) => (cur === bill.id ? null : bill.id));
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Bills" subtitle="Vendor bills with paid balance and partial payment history" />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {billsQuery.isError ? <ListErrorBanner onRetry={() => void billsQuery.refetch()} /> : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Status:</span>
        <select className="rounded border border-gray-300 px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">All open items</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Bill #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Original</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {billsQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!billsQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-gray-500">
                  No bills found.
                </td>
              </tr>
            ) : null}
            {rows.map((bill) => {
              const bal = bill.balance_cents ?? Math.max(0, bill.amount_cents - bill.paid_cents);
              const expand = bill.status === "partial";
              const open = expandedId === bill.id;
              return (
                <Fragment key={bill.id}>
                  <tr className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      {expand ? (
                        <button type="button" className="text-gray-700" onClick={() => toggleExpand(bill)} aria-label={open ? "Collapse payments" : "Expand payments"}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{bill.vendor_name || bill.vendor_id || "—"}</td>
                    <td className="px-3 py-2">{bill.bill_number || bill.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{bill.bill_date}</td>
                    <td className="px-3 py-2 text-right">{money(bill.amount_cents)}</td>
                    <td className="px-3 py-2 text-right">{money(bill.paid_cents)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(bal)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(bill.status)}`}>{bill.status}</span>
                    </td>
                  </tr>
                  {expand && open ? (
                    <tr key={`${bill.id}-sub`} className="bg-gray-50">
                      <td colSpan={8} className="px-3 py-2">
                        {paymentsQuery.isLoading && expandedBill?.id === bill.id ? (
                          <div className="text-xs text-gray-500">Loading payments…</div>
                        ) : (
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-left text-gray-600">
                                <th className="py-1 pr-2">Payment date</th>
                                <th className="py-1 pr-2 text-right">Amount</th>
                                <th className="py-1 pr-2">Bank account</th>
                                <th className="py-1 pr-2">Memo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(paymentsQuery.data?.payments ?? []).map((p) => (
                                <tr key={p.id}>
                                  <td className="py-1 pr-2">{p.payment_date}</td>
                                  <td className="py-1 pr-2 text-right">{money(p.amount_cents)}</td>
                                  <td className="py-1 pr-2 font-mono text-[10px]">{p.from_bank_account_id ? p.from_bank_account_id.slice(0, 8) : "—"}</td>
                                  <td className="py-1 pr-2 text-gray-700">{p.memo || p.reference_number || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
