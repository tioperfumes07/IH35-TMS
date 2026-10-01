/** FEED GATE — Lead 2026-10-01. Every feed verified for linkage/wiring/stamps before it closes. */
import { apiRequest } from "./client";

export type FeedKind = "settlement" | "load";
export type FeedIntake = {
  id: string; feed_kind: FeedKind | string; subject_table: string; subject_id: string; driver_id: string | null;
  status: "open" | "passed" | "blocked" | "closed" | "voided"; opened_at: string; last_run_no: number; last_run_at: string | null;
  checks_total: number; checks_failed: number; passed_at: string | null; closed_at: string | null;
  subject_label?: string | null; driver_name?: string | null;
};
export type FeedCheck = {
  id: string; run_no: number; check_group: string; check_key: string; status: "pass" | "fail" | "na"; subject_table: string | null;
  subject_id: string | null; subject_label: string | null; missing: string | null; fix_link: string | null; measured: Record<string, unknown>; measured_at: string;
};
export type FeedIntakeDetail = { intake: FeedIntake; checks: FeedCheck[] };

export function listFeedIntakes(operatingCompanyId: string) {
  return apiRequest<{ intakes: FeedIntake[] }>(`/api/v1/feed-gate/intakes?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}
export function getFeedIntake(operatingCompanyId: string, intakeId: string) {
  return apiRequest<FeedIntakeDetail>(`/api/v1/feed-gate/intakes/${intakeId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}
export function runFeedGate(operatingCompanyId: string, feedKind: FeedKind, subjectId: string) {
  return apiRequest<FeedIntakeDetail>("/api/v1/feed-gate/run", { method: "POST", body: { operating_company_id: operatingCompanyId, feed_kind: feedKind, subject_id: subjectId } });
}
export function closeFeedIntake(operatingCompanyId: string, intakeId: string) {
  return apiRequest<{ intake: FeedIntake }>(`/api/v1/feed-gate/intakes/${intakeId}/close`, { method: "POST", body: { operating_company_id: operatingCompanyId } });
}
