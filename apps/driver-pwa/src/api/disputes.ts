import { apiRequest } from "./client";

export type MyDispute = {
  id: string;
  operating_company_id: string;
  settlement_id: string;
  settlement_display_id: string | null;
  period_start: string | null;
  period_end: string | null;
  dispute_category: string;
  dispute_description: string;
  disputed_amount_cents: number | null;
  status: string;
  opened_at: string;
  reviewed_at: string | null;
  closed_at: string | null;
};

export function listMyDisputes() {
  return apiRequest<{ driver_id: string; disputes: MyDispute[] }>("/api/v1/driver-pwa/my-disputes");
}

export function withdrawMyDispute(id: string, operatingCompanyId: string) {
  return apiRequest<{ data: { id: string } }>(`/api/v1/driver-finance/settlement-disputes/${id}/withdraw`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}
