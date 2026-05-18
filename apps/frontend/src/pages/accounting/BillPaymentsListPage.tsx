import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listBillPayments, listBills, type BillPayment, type VendorBill, voidVendorBillPayment } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useToast } from "../../components/Toast";
import { AccountingSubNav } from "./AccountingSubNav";
import { PayBillModal } from "./PayBillModal";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function displayBillLabel(bill: VendorBill) {
  const remaining = Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
  const billRef = bill.bill_number || bill.id.slice(0, 8);
  const vendor = bill.vendor_name || bill.vendor_id || "Vendor";
  return `${vendor} · ${billRef} · Due ${bill.due_date || "-"} · ${money(remaining)}`;
}

export function BillPaymentsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  const [vendorId, setVendorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [payModalOpen, setPayModalOpen] = useState(false);

  const paymentsQuery = useQuery({
    queryKey: ["accounting", "bill-payments-list", companyId, vendorId, dateFrom, dateTo],
    queryFn: () =>
      listBillPayments(companyId, {
        vendor_id: vendorId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 300,
      }),
    enabled: Boolean(companyId),
  });

  const unpaidBillsQuery = useQuery({
    queryKey: ["accounting", "bills-unpaid", companyId],
    queryFn: () =>
      listBills(companyId, {
        status: "unpaid",
        include_balance: true,
        limit: 300,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => {
    const base = paymentsQuery.data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((row) => {
      const haystack = [row.id, row.bill_id, row.vendor_id, row.payment_method, row.reference_number, row.check_number, row.memo]
        .map((part) => String(part ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(needle);
    });
  }, [paymentsQuery.data?.rows, search]);

  const totals = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0),
    [rows]
  );

  const selectedBill = useMemo(() => {
    if (!selectedBillId) return null;
    return (unpaidBillsQuery.data?.rows ?? []).find((bill) => bill.id === selectedBillId) ?? null;
  }, [selectedBillId, unpaidBillsQuery.data?.rows]);

  const voidMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => voidVendorBillPayment(paymentId, companyId, reason),
    onSuccess: () => {
      pushToast("Bill payment voided", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payments-list", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-unpaid", companyId] });
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Void failed"), "error"),
  });

  const canVoid = user?.role === "Owner";

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title="Bill Payments"
        subtitle="Vendor bill payment ledger"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!selectedBill}
              onClick={() => {
                if (!selectedBill) {
                  pushToast("Select an unpaid bill first", "info");
                  return;
                }
                setPayModalOpen(true);
              }}
            >
              + Record Bill Payment
            </Button>
          </div>
        }
      />

      {paymentsQuery.isError ? <ListErrorBanner onRetry={() => void paymentsQuery.refetch()} /> : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
          Unpaid bill selector
          <SelectCombobox
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            value={selectedBillId}
            onChange={(event) => setSelectedBillId(event.target.value)}
          >
            <option value="">Select bill to pay...</option>
            {(unpaidBillsQuery.data?.rows ?? []).map((bill) => (
              <option key={bill.id} value={bill.id}>
                {displayBillLabel(bill)}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Vendor ID
          <input
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
            placeholder="Optional vendor UUID"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          From
          <input
            type="date"
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          To
          <input
            type="date"
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search payment rows
          <input
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="payment id, bill id, vendor id, method, reference, memo"
          />
        </label>
        <div className="flex items-end text-xs text-gray-600">Total rows amount: <span className="ml-1 font-semibold text-gray-900">{money(totals)}</span></div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Payment date</th>
              <th className="px-3 py-2 font-semibold">Amount</th>
              <th className="px-3 py-2 font-semibold">Method</th>
              <th className="px-3 py-2 font-semibold">Bill ID</th>
              <th className="px-3 py-2 font-semibold">Vendor ID</th>
              <th className="px-3 py-2 font-semibold">Reference</th>
              <th className="px-3 py-2 font-semibold">Memo</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paymentsQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-gray-500">
                  Loading bill payments...
                </td>
              </tr>
            ) : null}
            {!paymentsQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-gray-500">
                  No bill payments found.
                </td>
              </tr>
            ) : null}
            {rows.map((row: BillPayment) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-700">{row.payment_date}</td>
                <td className="px-3 py-2 text-gray-900">{money(row.amount_cents)}</td>
                <td className="px-3 py-2 text-gray-700">{row.payment_method}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.bill_id}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.vendor_id ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{row.reference_number ?? row.check_number ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{row.memo ?? "-"}</td>
                <td className="px-3 py-2">
                  {canVoid ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={voidMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt("Void reason");
                        if (!reason || reason.trim().length < 3) return;
                        voidMutation.mutate({ paymentId: row.id, reason: reason.trim() });
                      }}
                    >
                      Void
                    </Button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {companyId ? (
        <PayBillModal
          open={payModalOpen}
          operatingCompanyId={companyId}
          vendorName={selectedBill?.vendor_name ?? selectedBill?.vendor_id ?? "Vendor"}
          bill={selectedBill}
          onClose={() => setPayModalOpen(false)}
          onSaved={() => {
            setPayModalOpen(false);
            pushToast("Bill payment recorded", "success");
            void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payments-list", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-unpaid", companyId] });
          }}
        />
      ) : null}
    </div>
  );
}
