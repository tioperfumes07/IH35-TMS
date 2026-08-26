// @archived — Workflow-B form: superseded by BankingTransactionsDesignView categorization. Enforced by verify-banking-workflow-b-archived.mjs.
import type { JSX } from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBills } from "../../../../api/accounting";
import { getAllAccounts } from "../../../../api/banking";
import { DatePicker } from "../../../../components/forms/DatePicker";
import { ParityTable } from "../../../../components/parity/ParityTable";
import { SelectCombobox } from "../../../../components/shared/SelectCombobox";
import { entityLabel, visibleDocumentLabel } from "../../../../lib/entity-label";

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
      <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
        Bill Payment Details
      </div>
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6">
        <Field label="Payment Date">
          <DatePicker
            className="h-8 w-full"
            value={String(value.payment_date ?? "")}
            onChange={(next) => onChange({ ...value, payment_date: next })}
          />
        </Field>
        <Field label="Payment Method">
          <SelectCombobox
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
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
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
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
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.reference_number ?? "")}
            onChange={(event) => onChange({ ...value, reference_number: event.target.value })}
          />
        </Field>
        <Field label="Amount (USD)">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.amount_usd ?? "")}
            onChange={(event) => onChange({ ...value, amount_usd: event.target.value })}
          />
        </Field>
        <Field label="Memo">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.memo ?? "")}
            onChange={(event) => onChange({ ...value, memo: event.target.value })}
          />
        </Field>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-2">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Bill selection / apply</div>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-600">Bill</span>
          <SelectCombobox
            className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.bill_id ?? "")}
            onChange={(event) => onChange({ ...value, bill_id: event.target.value })}
          >
            <option value="">Select unpaid bill...</option>
            {(billsQuery.data?.rows ?? []).map((bill) => (
              <option key={bill.id} value={bill.id}>
                {visibleDocumentLabel(bill.bill_number, bill.id, "Bill") +
                  " · " +
                  entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")}
              </option>
            ))}
          </SelectCombobox>
        </label>
        {/* BANK-F3596: embedded ParityTable owns Search+Range+gear on archived Workflow-B apply grid. */}
        <ParityTable
          embedded
          rows={selectedBill ? [selectedBill] : []}
          rowKey={(bill) => bill.id}
          storageKey="bill-payment-form-apply"
          exportFilename="bill-payment-form-apply"
          tableTestId="bill-payment-form-apply-table"
          emptyText="Select a bill to apply payment."
          columns={[
            {
              key: "bill",
              label: "Bill #",
              render: (bill) => visibleDocumentLabel(bill.bill_number, bill.id, "Bill"),
            },
            {
              key: "total",
              label: "Total",
              render: (bill) => `$${(Number(bill.amount_cents ?? 0) / 100).toFixed(2)}`,
            },
            {
              key: "open",
              label: "Open",
              cellClass: "text-red-700",
              render: () => `$${(openBalanceCents / 100).toFixed(2)}`,
            },
            {
              key: "apply",
              label: "Apply",
              render: () => (
                <input
                  className="h-8 w-24 rounded-sm border border-gray-300 px-2 text-xs"
                  value={String(value.apply_amount_usd ?? value.amount_usd ?? "")}
                  onChange={(event) => onChange({ ...value, apply_amount_usd: event.target.value })}
                />
              ),
            },
          ]}
        />
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
