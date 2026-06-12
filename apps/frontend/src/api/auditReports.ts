import { apiRequest } from "./client";

export type AuditReportRow = {
  event_type: string;
  subject_type: string | null;
  subject_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  occurred_at: string;
  payload: unknown;
  source: string | null;
  total_count: number;
};

export type AuditReportResult = {
  rows: AuditReportRow[];
  total_count: number;
  limit: number;
  offset: number;
};

export type AuditReportParams = {
  operating_company_id: string;
  from?: string;
  to?: string;
  actor_user_id?: string;
  module?: string;
  driver_id?: string;
  limit?: number;
  offset?: number;
};

function buildSearch(params: AuditReportParams): URLSearchParams {
  const s = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.from)          s.set("from", params.from);
  if (params.to)            s.set("to", params.to);
  if (params.actor_user_id) s.set("actor_user_id", params.actor_user_id);
  if (params.module)        s.set("module", params.module);
  if (params.driver_id)     s.set("driver_id", params.driver_id);
  if (params.limit != null) s.set("limit", String(params.limit));
  if (params.offset != null) s.set("offset", String(params.offset));
  return s;
}

export function fetchAuditReport(endpoint: string, params: AuditReportParams) {
  return apiRequest<AuditReportResult>(`${endpoint}?${buildSearch(params).toString()}`);
}

export const AUDIT_REPORT_ENDPOINTS = {
  activityByUser:         "/api/v1/audit/reports/activity-by-user",
  activityByModule:       "/api/v1/audit/reports/activity-by-module",
  financialChangeLog:     "/api/v1/audit/reports/financial-change-log",
  maintenanceDecisionLog: "/api/v1/audit/reports/maintenance-decision-log",
  deductionTrail:         "/api/v1/audit/reports/deduction-trail",
  voidReversal:           "/api/v1/audit/reports/void-reversal",
  periodCloseHistory:     "/api/v1/audit/reports/period-close-history",
} as const;
