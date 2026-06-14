import { apiRequest } from "./client";

export type InboxReportingSummary = {
  total_requests: number;
  approved: number;
  denied: number;
  approval_rate_pct: number | null;
  avg_time_to_view_seconds: number | null;
  avg_time_to_approve_seconds: number | null;
  total_approved_advance_cents: number;
};

export type InboxReportingDriverRow = {
  driver_id: string;
  driver_name: string;
  total_requests: number;
  approved: number;
  denied: number;
  approval_rate_pct: number | null;
  avg_time_to_view_seconds: number | null;
  avg_time_to_approve_seconds: number | null;
  approved_advance_cents: number;
};

export type InboxReportingData = {
  from: string;
  to: string;
  summary: InboxReportingSummary;
  by_driver: InboxReportingDriverRow[];
  not_computed: string[];
};

export function getInboxReporting(params: { operating_company_id: string; from: string; to: string }) {
  const q = new URLSearchParams(params);
  return apiRequest<InboxReportingData>(`/api/v1/driver-finance/inbox-reporting?${q}`);
}
