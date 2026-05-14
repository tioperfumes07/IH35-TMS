import { apiRequest } from "./client";

export type ScheduledReportListRow = {
  id: string;
  report_id: string;
  name: string;
  cadence_label: string;
  recipients: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  status: "active" | "paused" | "failed";
};

export type ScheduledReportCreatePayload = {
  operating_company_id: string;
  report_id: string;
  name?: string;
  parameters: Record<string, unknown>;
  frequency: {
    kind: "daily" | "weekly" | "monthly" | "cron";
    time_local: string;
    day_of_week?: number;
    day_of_month?: number;
    cron?: string;
  };
  recipients: string[];
  cc?: string[];
  format: "pdf" | "xlsx" | "csv";
  subject_template: string;
};

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

export async function listScheduledReportsV2(operatingCompanyId: string) {
  return apiRequest<{ rows: ScheduledReportListRow[] }>(withCompany("/api/v1/scheduled-reports", operatingCompanyId));
}

/** Alias matching P6-T11200 API naming (`listScheduledReports`). */
export const listScheduledReports = listScheduledReportsV2;

export async function createScheduledReport(payload: ScheduledReportCreatePayload) {
  return apiRequest<{ id: string }>("/api/v1/scheduled-reports", { method: "POST", body: payload });
}

export async function updateScheduledReport(id: string, payload: Partial<ScheduledReportCreatePayload> & { operating_company_id: string }) {
  return apiRequest<{ ok: boolean }>(`/api/v1/scheduled-reports/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
}

export async function pauseScheduledReport(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/scheduled-reports/${encodeURIComponent(id)}/pause`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export async function resumeScheduledReport(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/scheduled-reports/${encodeURIComponent(id)}/resume`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export async function sendScheduledReportNow(id: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/scheduled-reports/${encodeURIComponent(id)}/send-now`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export async function deleteScheduledReport(id: string, operatingCompanyId: string) {
  const qs = `operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
  return apiRequest<{ ok: boolean }>(`/api/v1/scheduled-reports/${encodeURIComponent(id)}?${qs}`, { method: "DELETE" });
}

export async function testSendScheduledReport(operatingCompanyId: string, payload: ScheduledReportCreatePayload) {
  return apiRequest<{ ok: boolean }>(withCompany("/api/v1/scheduled-reports/test-send", operatingCompanyId), {
    method: "POST",
    body: payload,
  });
}
