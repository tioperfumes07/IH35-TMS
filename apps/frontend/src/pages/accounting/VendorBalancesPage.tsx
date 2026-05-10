import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listVendorBalances, listVendorBills, getVendorBill, voidVendorBillPayment, type VendorBill } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { useToast } from "../../components/Toast";
import { PayBillModal } from "./PayBillModal";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function daysUntil(date: string) {
  const due = new Date(`${date}T00:00:00`);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / msPerDay);
}

export function VendorBalancesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);

  const balancesQuery = useQuery({
    queryKey: ["accounting", "vendor-balances", companyId],
    queryFn: () => listVendorBalances(companyId, { all: false, sort: "balance_desc" }),
    enabled: Boolean(companyId),
  });

  const selectedVendor = useMemo(() => {
    if (!selectedVendorId) return null;
    return (balancesQuery.data?.rows ?? []).find((row) => row.vendor_id === selectedVendorId) ?? null;
  }, [balancesQuery.data?.rows, selectedVendorId]);

  const billsQuery = useQuery({
    queryKey: ["accounting", "vendor-bills", companyId, selectedVendorId],
    queryFn: () => listVendorBills(companyId, { vendor_id: selectedVendorId!, limit: 200 }),
    enabled: Boolean(companyId && selectedVendorId),
  });

  const selectedBill = useMemo(() => {
    if (!selectedBillId) return null;
    return (billsQuery.data?.rows ?? []).find((row) => row.id === selectedBillId) ?? null;
  }, [billsQuery.data?.rows, selectedBillId]);

  const billDetailQuery = useQuery({
    queryKey: ["accounting", "vendor-bill-detail", companyId, selectedBillId],
    queryFn: () => getVendorBill(selectedBillId!, companyId),
    enabled: Boolean(companyId && selectedBillId),
  });

  const totalOutstanding = useMemo(
    () => (balancesQuery.data?.rows ?? []).reduce((sum, row) => sum + Number(row.balance_cents ?? 0), 0),
    [balancesQuery.data?.rows]
  );

  const ownerOnly = auth.user?.role === "Owner";

  return (
    <div className="space-y-3">
      <PageHeader title="Vendor Balances" subtitle="Outstanding vendor bills with running payment ledger" />
      {balancesQuery.isError ? <ListErrorBanner onRetry={() => void balancesQuery.refetch()} /> : null}
      <div className="text-xs text-gray-600">Total outstanding: <span className="font-semibold text-red-700">{money(totalOutstanding)}</span></div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Vendors by balance</div>
          <div className="max-h-[65vh] overflow-auto">
            {balancesQuery.isLoading ? <p className="px-3 py-3 text-sm text-gray-500">Loading vendor balances...</p> : null}
            {!balancesQuery.isLoading && (balancesQuery.data?.rows ?? []).length === 0 ? <p className="px-3 py-3 text-sm text-gray-500">No outstanding balances.</p> : null}
            {(balancesQuery.data?.rows ?? []).map((row) => (
              <button
                key={row.vendor_id}
                type="button"
                className={`w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50 ${selectedVendorId === row.vendor_id ? "bg-blue-50" : ""}`}
                onClick={() => {
                  setSelectedVendorId(row.vendor_id);
                  setSelectedBillId(null);
                }}
              >
                <div className="truncate text-sm font-semibold text-gray-900">{row.vendor_name}</div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-gray-600">
                  <span>{row.open_bill_count} open bills</span>
                  <span className="font-semibold text-red-700">{money(row.balance_cents)}</span>
                </div>
                <div className="text-[11px] text-gray-500">{row.next_due_date ? `Next due ${row.next_due_date}` : "No due date"}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {selectedVendor ? `Bills · ${selectedVendor.vendor_name}` : "Bills"}
          </div>
          <div className="max-h-[65vh] overflow-auto">
            {!selectedVendor ? <p className="px-3 py-3 text-sm text-gray-500">Select a vendor to view bills.</p> : null}
            {selectedVendor && billsQuery.isLoading ? <p className="px-3 py-3 text-sm text-gray-500">Loading bills...</p> : null}
            {selectedVendor && !billsQuery.isLoading && (billsQuery.data?.rows ?? []).length === 0 ? <p className="px-3 py-3 text-sm text-gray-500">No bills for this vendor.</p> : null}
            {(billsQuery.data?.rows ?? []).map((bill) => {
              const remaining = Math.max(0, Number(bill.amount_cents) - Number(bill.paid_cents));
              const dueDelta = bill.due_date ? daysUntil(bill.due_date) : null;
              const dueTone =
                dueDelta === null ? "text-gray-500" : dueDelta < 0 ? "text-red-600" : dueDelta <= 7 ? "text-amber-600" : "text-gray-600";
              return (
                <div key={bill.id} className={`border-b border-gray-100 px-3 py-2 ${selectedBillId === bill.id ? "bg-blue-50" : ""}`}>
                  <button type="button" className="w-full text-left" onClick={() => setSelectedBillId(bill.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">{bill.bill_number || bill.id.slice(0, 8)}</div>
                      <div className="text-xs font-semibold text-red-700">{money(remaining)}</div>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-600">
                      {bill.bill_date} · Due {bill.due_date || "-"} · {bill.status}
                    </div>
                    <div className={`text-[11px] ${dueTone}`}>{dueDelta === null ? "No due date" : dueDelta < 0 ? "Past due" : `Due in ${dueDelta} days`}</div>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      disabled={remaining <= 0 || bill.status === "paid" || bill.status === "voided"}
                      onClick={() => {
                        setSelectedBillId(bill.id);
                        setPayModalOpen(true);
                      }}
                    >
                      Pay
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment history</div>
          <div className="max-h-[65vh] overflow-auto">
            {!selectedBill ? <p className="px-3 py-3 text-sm text-gray-500">Select a bill to view payments.</p> : null}
            {selectedBill && billDetailQuery.isLoading ? <p className="px-3 py-3 text-sm text-gray-500">Loading payment history...</p> : null}
            {selectedBill && !billDetailQuery.isLoading && (billDetailQuery.data?.payments ?? []).length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-500">No payments recorded yet.</p>
            ) : null}
            {(billDetailQuery.data?.payments ?? []).map((payment) => (
              <div key={payment.id} className="border-b border-gray-100 px-3 py-2 text-xs">
                <div className="flex items-center justify-between text-gray-900">
                  <span>{payment.payment_date}</span>
                  <span className="font-semibold">{money(payment.amount_cents)}</span>
                </div>
                <div className="text-gray-600">{payment.payment_method} · {payment.reference_number || payment.check_number || "-"}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">By {payment.created_by_user_id ? payment.created_by_user_id.slice(0, 8) : "system"}</span>
                  {ownerOnly ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const reason = window.prompt("Void reason");
                        if (!reason) return;
                        void voidVendorBillPayment(payment.id, companyId, reason)
                          .then(() => {
                            pushToast("Bill payment voided", "success");
                            void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
                            void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-bills", companyId, selectedVendorId] });
                            void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-bill-detail", companyId, selectedBillId] });
                          })
                          .catch((error) => pushToast(String((error as Error)?.message ?? "Void failed"), "error"));
                      }}
                    >
                      Void
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <PayBillModal
        open={payModalOpen}
        operatingCompanyId={companyId}
        vendorName={selectedVendor?.vendor_name ?? "Vendor"}
        bill={selectedBill as VendorBill | null}
        onClose={() => setPayModalOpen(false)}
        onSaved={() => {
          setPayModalOpen(false);
          pushToast("Bill payment recorded", "success");
          void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
          void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-bills", companyId, selectedVendorId] });
          void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-bill-detail", companyId, selectedBillId] });
        }}
      />
    </div>
  );
}
