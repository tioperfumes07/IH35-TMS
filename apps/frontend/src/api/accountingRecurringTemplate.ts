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
  params: { customer_id: string; kind?: AccountingRecurringTemplateDetail["kind"]; limit?: number; offset?: number },
) {
  const query = new URLSearchParams();
  query.set("operating_company_id", operatingCompanyId);
  query.set("customer_id", params.customer_id);
  if (params.kind) query.set("kind", params.kind);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  return apiRequest<{ rows: AccountingRecurringTemplateDetail[]; total: number; limit: number; offset: number }>(
    `/api/v1/accounting/recurring-templates?${query.toString()}`,
  );
}

export async function listAllAccountingRecurringTemplates(
  operatingCompanyId: string,
  params: Omit<Parameters<typeof listAccountingRecurringTemplates>[1], "limit" | "offset">,
) {
  const limit = 200;
  const rows: AccountingRecurringTemplateDetail[] = [];
  let offset = 0;
  while (true) {
    const page = await listAccountingRecurringTemplates(operatingCompanyId, { ...params, limit, offset });
    rows.push(...page.rows);
    if (rows.length >= page.total || page.rows.length === 0) return { rows, total: page.total };
    offset += page.rows.length;
  }
}

export function getAccountingRecurringTemplate(id: string, operatingCompanyId: string) {
  return apiRequest<AccountingRecurringTemplateDetail>(
    `/api/v1/accounting/recurring-templates/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
