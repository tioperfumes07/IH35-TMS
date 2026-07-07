import { formatDateUS } from "../../lib/formatDate";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getVendorBill } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusVariant(status: string): "positive" | "neutral" | "crit" | "warn" {
  if (status === "paid") return "positive";
  if (status === "voided") return "neutral";
  if (status === "partial") return "warn";
  return "crit";
}

export function BillDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();

  const detailQuery = useQuery({
    queryKey: ["accounting", "bill", selectedCompanyId, id],
    queryFn: () => getVendorBill(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  if (detailQuery.isLoading) return <div className="p-4 text-sm text-slate-500">Loading bill…</div>;
  if (detailQuery.isError)
    return (
      <ListErrorState
        title="Couldn't load bill"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );

  const bill = detailQuery.data?.bill;
  const payments = detailQuery.data?.payments ?? [];

  if (!bill) return <div className="p-4 text-sm text-red-600">Bill not found.</div>;

  const displayId = bill.bill_number ?? bill.id.slice(0, 8);
  const balance = Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0);

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={displayId}
        backHref="/accounting/bills"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Bills", href: "/accounting/bills" },
          { label: displayId },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge variant={statusVariant(bill.status)}>{bill.status}</StatusBadge>
            {bill.is_reconciled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Matched
              </span>
            ) : null}
          </div>
        }
      />

      <DataPanel title="Bill">
        {bill.vendor_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor</span>
            <EntityLink kind="vendor" id={bill.vendor_id} label={bill.vendor_name ?? bill.vendor_id.slice(0, 8)} />
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Bill #</span>
          <span className="text-sm text-gray-900">{bill.bill_number ?? "—"}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Bill date</span>
          <span className="text-sm text-gray-900">{formatDateUS(bill.bill_date)}</span>
        </DataPanelRow>
        {bill.due_date ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Due date</span>
            <span className="text-sm text-gray-900">{formatDateUS(bill.due_date)}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Amount</span>
          <span className="text-sm text-gray-900">{money(bill.amount_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Paid</span>
          <span className="text-sm text-gray-900">{money(bill.paid_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Open balance</span>
          <span className="text-sm font-semibold text-gray-900">{money(balance)}</span>
        </DataPanelRow>
        {bill.memo ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Memo</span>
            <span className="text-sm text-gray-900">{bill.memo}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Created</span>
          <span className="text-sm text-gray-900">{formatDateUS(bill.created_at)}</span>
        </DataPanelRow>
      </DataPanel>

      <DataPanel title="Payments">
        {payments.length === 0 ? (
          <div className="py-2 text-sm text-slate-500">No payments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-1.5 font-semibold">Date</th>
                  <th className="px-2 py-1.5 font-semibold">Amount</th>
                  <th className="px-2 py-1.5 font-semibold">Method</th>
                  <th className="px-2 py-1.5 font-semibold">Reference</th>
                  <th className="px-2 py-1.5 font-semibold">Check #</th>
                  <th className="px-2 py-1.5 font-semibold">Reconciled</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pmt) => (
                  <tr key={pmt.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-900">{formatDateUS(pmt.payment_date)}</td>
                    <td className="px-2 py-1.5 text-gray-900">{money(pmt.amount_cents)}</td>
                    <td className="px-2 py-1.5 text-gray-700">{pmt.payment_method}</td>
                    <td className="px-2 py-1.5 text-gray-700">{pmt.reference_number ?? "—"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{pmt.check_number ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {pmt.is_reconciled ? (
                        <span className="text-slate-600">✓ Matched</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
    </AccountingSubNavWrapper>
  );
}
