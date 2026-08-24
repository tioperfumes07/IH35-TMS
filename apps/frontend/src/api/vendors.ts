import { apiRequest } from "./client";

export type RecordVendorBillPaymentPayload = {
  operating_company_id: string;
  date: string;
  amount_cents: number;
  method: string;
  reference?: string;
  memo?: string;
  applications: Array<{ bill_id: string; amount_cents: number }>;
  remaining_to_credit_balance_cents?: number;
};

export type VendorBillPaymentListRow = {
  id: string;
  payment_date: string;
  amount_cents: number;
  payment_method?: string;
  method?: string;
  amount_applied_cents?: number;
  reference?: string | null;
  journal_entry_id?: string | null;
};

type VendorBillPaymentApiRow = VendorBillPaymentListRow & {
  group_id?: string;
  date?: string;
};

function normalizeVendorBillPaymentRow(row: VendorBillPaymentApiRow): VendorBillPaymentListRow {
  const amount = Number(row.amount_cents ?? 0);
  return {
    id: String(row.id || row.group_id || ""),
    payment_date: String(row.payment_date || row.date || ""),
    amount_cents: amount,
    payment_method: row.payment_method ?? row.method,
    method: row.method ?? row.payment_method,
    amount_applied_cents: row.amount_applied_cents ?? amount,
    reference: row.reference ?? null,
    journal_entry_id: row.journal_entry_id ?? null,
  };
}

export function recordVendorBillPayment(vendorId: string, payload: RecordVendorBillPaymentPayload) {
  // Contract fix: the backend POST /vendors/:id/bill-payments requires operating_company_id in the
  // QUERY (companyQuerySchema) and a body of {paid_at, payment_method, reference_number, ...}. The old
  // call sent operating_company_id in the BODY and used {date, method, reference} → 400 on every
  // "Record bill payment" click. Move the id to the query and translate the field names here.
  return apiRequest<{ ok?: boolean; id?: string }>(
    `/api/v1/vendors/${vendorId}/bill-payments?operating_company_id=${encodeURIComponent(payload.operating_company_id)}`,
    {
      method: "POST",
      body: {
        paid_at: payload.date,
        amount_cents: payload.amount_cents,
        payment_method: payload.method,
        reference_number: payload.reference,
        applications: payload.applications,
      },
    }
  );
}

export function listVendorBillPayments(
  vendorId: string,
  params: { operating_company_id: string; limit?: number }
) {
  const qs = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.limit != null) qs.set("limit", String(params.limit));
  return apiRequest<{ payments?: VendorBillPaymentApiRow[]; rows?: VendorBillPaymentApiRow[] }>(
    `/api/v1/vendors/${vendorId}/bill-payments?${qs.toString()}`
  ).then((res) => {
    const raw = res.payments ?? res.rows ?? [];
    const payments = raw.map(normalizeVendorBillPaymentRow).filter((row) => row.id);
    return { payments, rows: payments };
  });
}
