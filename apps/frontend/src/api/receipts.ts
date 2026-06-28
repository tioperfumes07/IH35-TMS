import { apiRequest } from "./client";

export type ReceiptSource =
  | {
      type: "expense";
      expense_number: string | null;
      date: string | null;
      amount_cents: number | null;
      memo: string | null;
      status: string | null;
      detail_path: string;
    }
  | {
      type: "bill";
      bill_number: string | null;
      date: string | null;
      amount_cents: number | null;
      vendor_name: string | null;
      status: string | null;
      detail_path: string;
    };

export type ReceiptItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  notes: string | null;
  source: ReceiptSource;
};

export type ReceiptList = { total: number; limit: number; offset: number; items: ReceiptItem[] };

export type ReceiptDetail = ReceiptItem & {
  r2_object_key: string;
  r2_bucket: string;
  download_url: string;
};

export function getReceipts(input: {
  operating_company_id: string;
  entity_type?: "expense" | "bill";
  date_from?: string;
  date_to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: input.operating_company_id });
  if (input.entity_type) q.set("entity_type", input.entity_type);
  if (input.date_from) q.set("date_from", input.date_from);
  if (input.date_to) q.set("date_to", input.date_to);
  if (input.q) q.set("q", input.q);
  if (input.limit != null) q.set("limit", String(input.limit));
  if (input.offset != null) q.set("offset", String(input.offset));
  return apiRequest<ReceiptList>(`/api/v1/accounting/receipts?${q}`);
}

export function getReceiptDetail(id: string, operating_company_id: string) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<ReceiptDetail>(`/api/v1/accounting/receipts/${id}?${q}`);
}
