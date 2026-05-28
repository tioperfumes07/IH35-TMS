import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getSafetyKpis(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dashboard/kpis?${q(companyId)}`);
}

export function getSafetyEvents(companyId: string) {
  return apiRequest<{
    events: Array<Record<string, unknown>>;
    counters: { active_count: number; resolved_count: number; total_count: number };
    filter: "active" | "resolved" | "all";
  }>(`/api/v1/safety/events?${q(companyId)}&filter=active`);
}

export function getSafetyEventsFiltered(companyId: string, filter: "active" | "resolved" | "all") {
  return apiRequest<{
    events: Array<Record<string, unknown>>;
    counters: { active_count: number; resolved_count: number; total_count: number };
    filter: "active" | "resolved" | "all";
  }>(`/api/v1/safety/events?${q(companyId)}&filter=${encodeURIComponent(filter)}`);
}


export type SafetyEventLogRow = {
  id: string;
  operating_company_id: string;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "closed";
  kpi_bucket: "incidents" | "violations" | "claims" | "commendations";
  subject_type: "driver" | "unit" | "company";
  subject_driver_id: string | null;
  subject_unit_id: string | null;
  related_load_id: string | null;
  occurred_at: string;
  title: string;
  description: string | null;
  created_by: string;
  created_at: string;
  subject_driver_name?: string | null;
  subject_unit_number?: string | null;
};

export function listSafetyEventLog(
  companyId: string,
  params: { status?: "open" | "acknowledged" | "closed"; severity?: "low" | "medium" | "high" | "critical"; search?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.status) qs.set("status", params.status);
  if (params.severity) qs.set("severity", params.severity);
  if (params.search) qs.set("search", params.search);
  return apiRequest<{ events: SafetyEventLogRow[] }>(`/api/v1/safety/events-log?${qs.toString()}`);
}

export function getSafetyEventKpis(companyId: string) {
  return apiRequest<{ kpis: { total: number; open_count: number; severe_count: number; commendations_count: number } }>(
    `/api/v1/safety/events-log/kpis?${q(companyId)}`
  );
}

export function getSafetyEventDetail(eventId: string, companyId: string) {
  return apiRequest<{ event: SafetyEventLogRow }>(`/api/v1/safety/events-log/${encodeURIComponent(eventId)}?${q(companyId)}`);
}

export function listSafetyEventNotes(eventId: string, companyId: string) {
  return apiRequest<{ notes: Array<{ id: string; safety_event_id: string; note: string; created_by: string; created_at: string; created_by_name?: string | null }> }>(
    `/api/v1/safety/events-log/${encodeURIComponent(eventId)}/notes?${q(companyId)}`
  );
}

export function createSafetyEvent(
  body: {
    operating_company_id: string;
    event_type: string;
    severity: "low" | "medium" | "high" | "critical";
    status?: "open" | "acknowledged" | "closed";
    kpi_bucket?: "incidents" | "violations" | "claims" | "commendations";
    subject_type?: "driver" | "unit" | "company";
    subject_driver_id?: string;
    subject_unit_id?: string;
    related_load_id?: string;
    occurred_at?: string;
    title: string;
    description?: string;
  }
) {
  return apiRequest<{ event: SafetyEventLogRow }>("/api/v1/safety/events-log", {
    method: "POST",
    body,
  });
}

export type DriverQualificationFileItem = {
  id: string;
  driver_id: string;
  item_name: string;
  status: "present" | "missing" | "expired";
  effective_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  expiry_pill?: "unknown" | "red" | "amber" | "green";
};

export function listDriverQualificationItems(driverId: string, companyId: string) {
  return apiRequest<{ items: DriverQualificationFileItem[] }>(
    `/api/v1/safety/driver-qualification/drivers/${encodeURIComponent(driverId)}/items?${q(companyId)}`
  );
}

export function createDriverQualificationItem(
  companyId: string,
  body: {
    driver_id: string;
    item_name: string;
    status?: "present" | "missing" | "expired";
    effective_date?: string;
    expiry_date?: string;
    notes?: string;
  }
) {
  return apiRequest<DriverQualificationFileItem>(`/api/v1/safety/driver-qualification/items?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function patchDriverQualificationItem(
  itemId: string,
  companyId: string,
  body: {
    status?: "present" | "missing" | "expired";
    effective_date?: string | null;
    expiry_date?: string | null;
    notes?: string | null;
    voided_reason?: string;
  }
) {
  return apiRequest<DriverQualificationFileItem>(
    `/api/v1/safety/driver-qualification/items/${encodeURIComponent(itemId)}?${q(companyId)}`,
    {
      method: "PATCH",
      body,
    }
  );
}

export function getUserPreferences() {
  return apiRequest<{ preferences: Record<string, unknown> }>("/api/v1/user/preferences");
}

export function patchUserPreferences(preferences: Record<string, unknown>) {
  return apiRequest<{ preferences: Record<string, unknown> }>("/api/v1/user/preferences", {
    method: "PATCH",
    body: { preferences },
  });
}

export function getSafetyAccidents(companyId: string) {
  return apiRequest<{ accidents: Array<Record<string, unknown>> }>(`/api/v1/safety/accidents?${q(companyId)}`);
}

export function getSafetyAccidentDetail(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}?${q(companyId)}`);
}

export function setSafetyAccidentStatus(id: string, companyId: string, status: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/status?${q(companyId)}`, {
    method: "PATCH",
    body: { status },
  });
}

export function spawnSafetyLiability(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/spawn-liability?${q(companyId)}`, {
    method: "POST",
  });
}

export function spawnSafetyWo(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}/spawn-wo?${q(companyId)}`, {
    method: "POST",
  });
}

export function getTrainingCompletions(companyId: string) {
  return apiRequest<{ training_completions: Array<Record<string, unknown>> }>(
    `/api/v1/safety/training/completions?${q(companyId)}`
  );
}

export function getDrugAlcoholTests(companyId: string) {
  return apiRequest<{ tests: Array<Record<string, unknown>> }>(`/api/v1/safety/drug-alcohol/tests?${q(companyId)}`);
}

export type DrugProgramTest = {
  id: string;
  driver_id: string;
  test_type: string;
  result: string;
  test_date: string;
  lab_name?: string | null;
  mro_name?: string | null;
  notes?: string | null;
};

export type RtdCase = {
  id: string;
  driver_id: string;
  stage: string;
  next_stage?: string | null;
  dispatch_blocked?: boolean;
  follow_up_tests_completed: number;
  follow_up_tests_required?: number | null;
  clearinghouse_updated?: boolean;
};

export function listDrugProgramTests(companyId: string) {
  return apiRequest<{ tests: DrugProgramTest[] }>(`/api/v1/safety/drug-program/tests?${q(companyId)}`);
}

export function createDrugProgramTest(
  companyId: string,
  body: { driver_id: string; test_type: string; result: string; test_date: string; lab_name?: string; mro_name?: string; notes?: string }
) {
  return apiRequest<DrugProgramTest>(`/api/v1/safety/drug-program/tests?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function listRandomPoolEntries(companyId: string) {
  return apiRequest<{ random_pools: Array<Record<string, unknown>> }>(`/api/v1/safety/drug-program/random-pools?${q(companyId)}`).then(
    (payload) => ({ entries: payload.random_pools ?? [] })
  );
}

export function listClearinghouseQueries(companyId: string) {
  return apiRequest<{ clearinghouse_queries: Array<Record<string, unknown>> }>(
    `/api/v1/safety/drug-program/clearinghouse-queries?${q(companyId)}`
  ).then((payload) => ({ queries: payload.clearinghouse_queries ?? [] }));
}

export function getDriverDrugProgramStatus(driverId: string, companyId: string) {
  return apiRequest<{ driver_id: string; is_blocked: boolean; block_reason: string | null; latest_test: Record<string, unknown> | null }>(
    `/api/v1/safety/drug-program/drivers/${encodeURIComponent(driverId)}/drug-status?${q(companyId)}`
  );
}

export function getDriverRtdCase(driverId: string, companyId: string) {
  return apiRequest<{ case: RtdCase | null }>(`/api/v1/safety/rtd/drivers/${encodeURIComponent(driverId)}/case?${q(companyId)}`);
}

export function createRtdCase(companyId: string, body: { driver_id: string; triggered_by_test_id?: string }) {
  return apiRequest<RtdCase>(`/api/v1/safety/rtd/cases?${q(companyId)}`, { method: "POST", body });
}

export function advanceRtdCase(
  caseId: string,
  companyId: string,
  body: { target_stage: string; rtd_test_id?: string; clearinghouse_updated?: boolean }
) {
  return apiRequest<RtdCase>(`/api/v1/safety/rtd/cases/${encodeURIComponent(caseId)}/advance?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getDriverDispatchEligibility(driverId: string, companyId: string) {
  return apiRequest<{ eligible: boolean; reasons: string[]; details: Record<string, unknown> }>(
    `/api/v1/dispatch/drivers/${encodeURIComponent(driverId)}/eligibility?${q(companyId)}`
  );
}

export type SafetyReminderRow = {
  id: string;
  operating_company_id?: string;
  driver_id: string;
  driver_name?: string | null;
  item_name: string;
  due_date: string;
  days_to_expiry: number;
  severity: "warning" | "critical" | "expired";
  status: "open" | "dismissed" | "resolved";
  source_type: string;
};

export function listSafetyReminders(companyId: string) {
  return apiRequest<{ reminders: SafetyReminderRow[] }>(`/api/v1/safety/reminders?${q(companyId)}&status=open`);
}

export function acknowledgeSafetyReminder(reminderId: string, companyId: string) {
  return apiRequest<{ id: string; status: string }>(`/api/v1/safety/reminders/${encodeURIComponent(reminderId)}?${q(companyId)}`, {
    method: "PATCH",
    body: { status: "dismissed" },
  });
}
export function getLatestCsa(companyId: string) {
  return apiRequest<{ latest: Record<string, unknown> | null }>(`/api/v1/safety/csa/latest?${q(companyId)}`);
}

export type DriverScoreRow = {
  driver_id: string;
  driver_name: string;
  incidents: number;
  counts_by_kind: { critical: number; major: number; minor: number };
  score: number;
  trend_vs_prior: number;
  period_miles: number;
  score_per_1k_miles: number | null;
};

export type DriverScoreEvent = {
  id: string;
  driver_id: string;
  unit_id: string;
  unit_number: string | null;
  event_at: string;
  event_kind: string;
  severity: string;
  speed_at_event_mph: number | null;
  g_force: number | null;
  latitude: number | null;
  longitude: number | null;
};

export function listDriverScores(companyId: string, periodDays: number) {
  const qs = new URLSearchParams({
    operating_company_id: companyId,
    period_days: String(periodDays),
  });
  return apiRequest<{ rows: DriverScoreRow[] }>(`/api/v1/safety/driver-scoring?${qs.toString()}`);
}

export function listDriverScoreEvents(companyId: string, driverId: string, periodDays: number) {
  const qs = new URLSearchParams({
    operating_company_id: companyId,
    period_days: String(periodDays),
  });
  return apiRequest<{ events: DriverScoreEvent[] }>(
    `/api/v1/safety/driver-scoring/${encodeURIComponent(driverId)}/events?${qs.toString()}`
  );
}

export function getSafetyFines(
  companyId: string,
  params: { status?: string; subject_type?: "driver" | "company"; subject_driver_id?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.status) qs.set("status", params.status);
  if (params.subject_type) qs.set("subject_type", params.subject_type);
  if (params.subject_driver_id) qs.set("subject_driver_id", params.subject_driver_id);
  return apiRequest<{ fines: Array<Record<string, unknown>> }>(`/api/v1/safety/fines?${qs.toString()}`);
}

export function createSafetyFine(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/fines?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function convertFineToLiability(fineId: string, companyId: string) {
  return apiRequest<{ fine: Record<string, unknown>; liability?: Record<string, unknown> }>(
    `/api/v1/safety/fines/${fineId}/convert-to-liability?${q(companyId)}`,
    { method: "POST" }
  );
}

export function getCompanyViolations(companyId: string) {
  return apiRequest<{ company_violations: Array<Record<string, unknown>> }>(`/api/v1/safety/company-violations?${q(companyId)}`);
}

export function createCompanyViolation(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function updateCompanyViolation(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function completeCompanyViolationCorrectiveAction(id: string, companyId: string, body: Record<string, unknown> = {}) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}/complete-corrective-action?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function resolveCompanyViolation(
  id: string,
  companyId: string,
  body: {
    outcome: "warning" | "written_reprimand" | "monetary_fine" | "termination" | "dismissed";
    resolutionNotes: string;
    fineAmountCentsOverride?: number;
  }
) {
  return apiRequest<{
    violationUuid: string;
    autoCreatedInternalFineUuid: string | null;
    finalAmountCents: number | null;
  }>(`/api/v1/safety/company-violations/${id}/resolve?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function escalateCompanyViolation(id: string, companyId: string, reason: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/company-violations/${id}/escalate?${q(companyId)}`, {
    method: "POST",
    body: { reason },
  });
}

export function getDotInspections(companyId: string) {
  return apiRequest<{ inspections: Array<Record<string, unknown>> }>(`/api/v1/safety/dot-inspections?${q(companyId)}`);
}

export function createDotInspection(
  companyId: string,
  body: Record<string, unknown>
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dot-inspections?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function listDotInspectionEvents(companyId: string, followUpState = "open") {
  return apiRequest<{ events: Array<Record<string, unknown>> }>(
    `/api/v1/safety/dot-inspection-events?${q(companyId)}&follow_up_state=${encodeURIComponent(followUpState)}`
  );
}

export function followUpDotInspectionEvent(
  id: string,
  companyId: string,
  followUpState: "open" | "reviewed" | "citation" | "clean",
  note?: string
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/dot-inspection-events/${id}/follow-up`, {
    method: "POST",
    body: {
      operating_company_id: companyId,
      follow_up_state: followUpState,
      note: note ?? null,
    },
  });
}

export function getInternalFines(companyId: string) {
  return apiRequest<{ fines: Array<Record<string, unknown>> }>(`/api/v1/safety/internal-fines?${q(companyId)}`);
}

export function createInternalFine(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/internal-fines?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getComplaints(companyId: string) {
  return apiRequest<{ complaints: Array<Record<string, unknown>> }>(`/api/v1/safety/complaints?${q(companyId)}`);
}

export function createComplaint(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/complaints?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getIntegrityAlerts(
  companyId: string,
  params: { alert_category?: string; severity?: string; resolution_status?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.alert_category) qs.set("alert_category", params.alert_category);
  if (params.severity) qs.set("severity", params.severity);
  if (params.resolution_status) qs.set("resolution_status", params.resolution_status);
  return apiRequest<{ integrity_alerts: Array<Record<string, unknown>> }>(`/api/v1/safety/integrity-alerts?${qs.toString()}`);
}

export function acknowledgeIntegrityAlert(id: string, companyId: string, note: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/acknowledge?${q(companyId)}`, {
    method: "POST",
    body: { acknowledgment_note: note },
  });
}

export function resolveIntegrityAlert(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/resolve?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getSafetySettings(companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/settings?${q(companyId)}`);
}

export function updateSafetySettings(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/settings?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function requestDashcamClip(companyId: string, body: {
  unit_id: string;
  start_at: string;
  duration_sec: number;
  camera_facing: "road" | "in_cab" | "both";
}) {
  return apiRequest<Record<string, unknown>>("/api/v1/dashcam/request-clip", {
    method: "POST",
    body: {
      operating_company_id: companyId,
      ...body,
    },
  });
}

export function listHarshEventDashcamClips(companyId: string, harshEventId: string) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(
    `/api/v1/safety/harsh-events/${encodeURIComponent(harshEventId)}/dashcam-clips?${qs.toString()}`
  );
}

export async function addAccidentPhoto(id: string, companyId: string, file: File) {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const url = `${base ? base.replace(/\/$/, "") : ""}/api/v1/safety/accidents/${id}/photos?${q(companyId)}`;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Upload failed");
  return payload;
}
