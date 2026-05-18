import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBills } from "../../../../api/accounting";
import { getAllAccounts } from "../../../../api/banking";
import { SelectCombobox } from "../../../../components/shared/SelectCombobox";

type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  operatingCompanyId: string;
};

function toOpenBalanceCents(row: Record<string, unknown>) {
  const amount = Number(row.amount_cents ?? 0);
  const paid = Number(row.paid_cents ?? 0);
  return Math.max(0, amount - paid);
}

export function BillPaymentForm({ value, onChange, operatingCompanyId }: Props) {
  const billsQuery = useQuery({
    queryKey: ["categorize-bill-payment", "bills", operatingCompanyId],
    queryFn: () => listBills(operatingCompanyId, { status: "unpaid", include_balance: true, limit: 200 }),
    enabled: Boolean(operatingCompanyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["categorize-bill-payment", "accounts", operatingCompanyId],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const selectedBill = useMemo(
    () => (billsQuery.data?.rows ?? []).find((bill) => bill.id === String(value.bill_id ?? "")) ?? null,
    [billsQuery.data?.rows, value.bill_id]
  );
  const openBalanceCents = selectedBill ? toOpenBalanceCents(selectedBill as unknown as Record<string, unknown>) : 0;

  return (
    <div className="space-y-2 text-xs">
      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
        Bill Payment Details
      </div>
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
        <Field label="Payment Date">
          <input
            type="date"
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.payment_date ?? "")}
            onChange={(event) => onChange({ ...value, payment_date: event.target.value })}
          />
        </Field>
        <Field label="Payment Method">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.payment_method ?? "")}
            onChange={(event) => onChange({ ...value, payment_method: event.target.value })}
          >
            <option value="">Select method...</option>
            <option value="ach">ACH</option>
            <option value="check">Check</option>
            <option value="wire">Wire</option>
            <option value="credit_card">Credit Card</option>
            <option value="cash">Cash</option>
          </SelectCombobox>
        </Field>
        <Field label="From Account">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.from_account_id ?? "")}
            onChange={(event) => onChange({ ...value, from_account_id: event.target.value })}
          >
            <option value="">Select account...</option>
            {(accountsQuery.data?.accounts ?? []).map((account: Record<string, unknown>) => (
              <option key={String(account.id ?? "")} value={String(account.id ?? "")}>
                {String(account.display_name ?? "Account")}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Reference">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.reference_number ?? "")}
            onChange={(event) => onChange({ ...value, reference_number: event.target.value })}
          />
        </Field>
        <Field label="Amount (USD)">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.amount_usd ?? "")}
            onChange={(event) => onChange({ ...value, amount_usd: event.target.value })}
          />
        </Field>
        <Field label="Memo">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.memo ?? "")}
            onChange={(event) => onChange({ ...value, memo: event.target.value })}
          />
        </Field>
      </div>

      <div className="rounded border border-gray-200 bg-white p-2">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Bill selection / apply</div>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-600">Bill</span>
          <SelectCombobox
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.bill_id ?? "")}
            onChange={(event) => onChange({ ...value, bill_id: event.target.value })}
          >
            <option value="">Select unpaid bill...</option>
            {(billsQuery.data?.rows ?? []).map((bill) => (
              <option key={bill.id} value={bill.id}>
                {(bill.bill_number ?? bill.id.slice(0, 8)) + " · " + String(bill.vendor_name ?? bill.vendor_id ?? "Vendor")}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-1 font-semibold">Bill #</th>
                <th className="px-2 py-1 font-semibold">Total</th>
                <th className="px-2 py-1 font-semibold">Open</th>
                <th className="px-2 py-1 font-semibold">Apply</th>
              </tr>
            </thead>
            <tbody>
              {selectedBill ? (
                <tr className="border-t border-gray-100">
                  <td className="px-2 py-1">{selectedBill.bill_number ?? selectedBill.id.slice(0, 8)}</td>
                  <td className="px-2 py-1">${(Number(selectedBill.amount_cents ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-2 py-1 text-red-700">${(openBalanceCents / 100).toFixed(2)}</td>
                  <td className="px-2 py-1">
                    <input
                      className="h-8 w-24 rounded border border-gray-300 px-2 text-xs"
                      value={String(value.apply_amount_usd ?? value.amount_usd ?? "")}
                      onChange={(event) => onChange({ ...value, apply_amount_usd: event.target.value })}
                    />
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-gray-500">
                    Select a bill to apply payment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}
