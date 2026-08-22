import { apiRequest } from "./client";

export type AccountingRecurringTemplateDetail = {
  id: string;
  kind: string;
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

export function getAccountingRecurringTemplate(id: string, operatingCompanyId: string) {
  return apiRequest<AccountingRecurringTemplateDetail>(
    `/api/v1/accounting/recurring-templates/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
