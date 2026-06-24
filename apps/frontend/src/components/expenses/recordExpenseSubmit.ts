import { createExpense } from "../../api/accounting";

export type RecordExpensePaymentMethod = "ach" | "card" | "check" | "wire" | "cash";

export type RecordExpenseFormValues = {
  vendorId: string | null;
  vendorUuid: string | null;
  vendorDisplay: string;
  categoryId: string;
  categoryLabel: string;
  categoryQboId: string | null;
  unitId: string;
  unitLabel: string;
  paymentAccountId: string;
  paymentAccountLabel: string;
  billDate: string;
  amount: number | null; // M-1: dollar number (was a dollars-string); amount_cents = round(amount*100) byte-for-byte
  description: string;
  paymentMethod: RecordExpensePaymentMethod | "";
};

export function dollarsToCents(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function buildRecordExpenseMemo(values: RecordExpenseFormValues) {
  const parts = ["Expense capture"];
  if (values.description.trim()) parts.push(values.description.trim());
  if (values.categoryLabel) parts.push(`Category: ${values.categoryLabel}`);
  if (values.unitLabel) parts.push(`Unit: ${values.unitLabel}`);
  if (values.paymentAccountLabel) parts.push(`Paid from: ${values.paymentAccountLabel}`);
  if (values.paymentMethod) parts.push(`Payment: ${values.paymentMethod.toUpperCase()}`);
  return parts.join(" · ");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitRecordExpense(
  operatingCompanyId: string,
  values: RecordExpenseFormValues,
  attachmentDraftId?: string
) {
  // Category (GL account) + payment account + payment method are REQUIRED — a categorized cash-out,
  // never an uncategorized one. Records to accounting.expenses (cash-out), NOT a vendor bill.
  if (!values.categoryQboId) throw new Error("Category is required");
  if (!values.paymentAccountId) throw new Error("Payment account is required");
  if (!values.paymentMethod) throw new Error("Payment method is required");
  const cents = dollarsToCents(values.amount);
  if (cents <= 0) throw new Error("Amount must be greater than zero");

  return createExpense(operatingCompanyId, {
    category_qbo_id: values.categoryQboId,
    expense_date: values.billDate,
    amount_cents: cents,
    payment_account_uuid: values.paymentAccountId,
    memo: buildRecordExpenseMemo(values),
    // Only a real local vendor uuid (picked from the list) flows; free-typed text is omitted.
    ...(values.vendorUuid && UUID_RE.test(values.vendorUuid) ? { vendor_uuid: values.vendorUuid } : {}),
    ...(attachmentDraftId ? { attachment_draft_id: attachmentDraftId } : {}),
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
    vendorUuid: null,
    vendorDisplay: "",
    categoryId: "",
    categoryLabel: "",
    categoryQboId: null,
    unitId: "",
    unitLabel: "",
    paymentAccountId: "",
    paymentAccountLabel: "",
    billDate: new Date().toISOString().slice(0, 10),
    amount: null,
    description: "",
    paymentMethod: "",
  };
}
