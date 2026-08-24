import { apiRequest } from "./client";

export type AccountingRecurringTemplateDetail = {
  id: string;
  kind: "invoice" | "bill" | "expense" | "journal_entry" | string;
  cadence: string;
  cron_expression: string | null;
  next_run_at: string;
  template_payload: Record<string, unknown>;
  is_active: boolean;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
};

export function listAccountingRecurringTemplates(
  operatingCompanyId: string,
  params: { customer_id: string; kind?: AccountingRecurringTemplateDetail["kind"]; limit?: number },
) {
  const query = new URLSearchParams();
  query.set("operating_company_id", operatingCompanyId);
  query.set("customer_id", params.customer_id);
  if (params.kind) query.set("kind", params.kind);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  return apiRequest<{ rows: AccountingRecurringTemplateDetail[] }>(
    `/api/v1/accounting/recurring-templates?${query.toString()}`,
  );
}

export function getAccountingRecurringTemplate(id: string, operatingCompanyId: string) {
  return apiRequest<AccountingRecurringTemplateDetail>(
    `/api/v1/accounting/recurring-templates/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
