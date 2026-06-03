import { createVendorBill } from "../../api/accounting";

export type RecordExpensePaymentMethod = "ach" | "card" | "check" | "wire" | "cash";

export type RecordExpenseFormValues = {
  vendorId: string | null;
  vendorDisplay: string;
  categoryId: string;
  categoryLabel: string;
  categoryQboId: string | null;
  unitId: string;
  unitLabel: string;
  billDate: string;
  amount: string;
  description: string;
  paymentMethod: RecordExpensePaymentMethod | "";
};

export function dollarsToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function buildRecordExpenseMemo(values: RecordExpenseFormValues) {
  const parts = ["Expense capture"];
  if (values.description.trim()) parts.push(values.description.trim());
  if (values.categoryLabel) parts.push(`Category: ${values.categoryLabel}`);
  if (values.unitLabel) parts.push(`Unit: ${values.unitLabel}`);
  if (values.paymentMethod) parts.push(`Payment: ${values.paymentMethod.toUpperCase()}`);
  return parts.join(" · ");
}

export async function submitRecordExpense(operatingCompanyId: string, values: RecordExpenseFormValues) {
  const vendorKey = (values.vendorId ?? values.vendorDisplay).trim();
  if (!vendorKey) throw new Error("Vendor is required");
  const cents = dollarsToCents(values.amount);
  if (cents <= 0) throw new Error("Amount must be greater than zero");

  return createVendorBill(operatingCompanyId, {
    vendor_id: vendorKey,
    bill_date: values.billDate,
    amount_cents: cents,
    memo: buildRecordExpenseMemo(values),
    ...(values.categoryQboId ? { coa_account_id: values.categoryQboId } : {}),
  });
}

export const RECORD_EXPENSE_PAYMENT_METHODS: Array<{ value: RecordExpensePaymentMethod; label: string }> = [
  { value: "ach", label: "ACH" },
  { value: "card", label: "Card" },
  { value: "check", label: "Check" },
  { value: "wire", label: "Wire" },
  { value: "cash", label: "Cash" },
];

export function initialRecordExpenseFormValues(): RecordExpenseFormValues {
  return {
    vendorId: null,
    vendorDisplay: "",
    categoryId: "",
    categoryLabel: "",
    categoryQboId: null,
    unitId: "",
    unitLabel: "",
    billDate: new Date().toISOString().slice(0, 10),
    amount: "",
    description: "",
    paymentMethod: "",
  };
}
