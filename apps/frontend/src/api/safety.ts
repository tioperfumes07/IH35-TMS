import { apiRequest } from "./client";
import { resolveApiUrl } from "./client";

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

export function getSafetyEventsFiltered(
  companyId: string,
  filter: "active" | "resolved" | "all",
  window: "7d" | "10d" | "30d" | "90d" | "all" = "7d"
) {
  return apiRequest<{
    events: Array<Record<string, unknown>>;
    counters: { active_count: number; resolved_count: number; total_count: number };
    filter: "active" | "resolved" | "all";
    window: "7d" | "10d" | "30d" | "90d" | "all";
  }>(
    `/api/v1/safety/events?${q(companyId)}&filter=${encodeURIComponent(filter)}&window=${encodeURIComponent(window)}`
  );
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
  location_text: string | null;
  injury_count: number;
  fatality_count: number;
  tow_away_required: boolean;
  dot_reportable: boolean;
  police_report_number: string | null;
  title: string;
  description: string | null;
  created_by: string;
  created_at: string;
  subject_driver_name?: string | null;
  subject_unit_number?: string | null;
  related_load_number?: string | null;
};

export function listSafetyEventLog(
  companyId: string,
  params: {
    status?: "open" | "acknowledged" | "closed";
    severity?: "low" | "medium" | "high" | "critical";
    search?: string;
    /** SAF-C01-REVERSE: server-side load filter for the load drawer's reverse block. */
    related_load_id?: string;
    subject_driver_id?: string;
    subject_unit_id?: string;
  } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.status) qs.set("status", params.status);
  if (params.severity) qs.set("severity", params.severity);
  if (params.search) qs.set("search", params.search);
  if (params.related_load_id) qs.set("related_load_id", params.related_load_id);
  if (params.subject_driver_id) qs.set("subject_driver_id", params.subject_driver_id);
  if (params.subject_unit_id) qs.set("subject_unit_id", params.subject_unit_id);
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
    location_text?: string;
    injury_count?: number;
    fatality_count?: number;
    tow_away_required?: boolean;
    dot_reportable?: boolean;
    police_report_number?: string;
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

export type DriverQualificationSummary = {
  total: number;
  compliant: number;
  attention: number;
  non_compliant: number;
  empty: number;
};

/** DRIVER-DQF-KPI-PAGE-1-SILENT-TRUNCATION: fleet-wide DQF compliance counts, computed server-side
 * over every scoped driver -- not just the current page of the Drivers "Profiles" table. */
export function getDriverQualificationSummary(companyId: string) {
  return apiRequest<DriverQualificationSummary>(`/api/v1/safety/driver-qualification/summary?${q(companyId)}`);
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

export function getSafetyDvirSubmissions(
  companyId: string,
  filters: {
    driver_id?: string;
    unit_id?: string;
    /** SAF-F17 — trailer profile reverse view. */
    trailer_id?: string;
    from?: string;
    to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (filters.driver_id) qs.set("driver_id", filters.driver_id);
  if (filters.unit_id) qs.set("unit_id", filters.unit_id);
  if (filters.trailer_id) qs.set("trailer_id", filters.trailer_id);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.search) qs.set("search", filters.search);
  if (filters.limit != null) qs.set("limit", String(filters.limit));
  if (filters.offset != null) qs.set("offset", String(filters.offset));
  return apiRequest<{ submissions: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/dvir?${qs.toString()}`);
}

export function getSafetyDvirDetail(id: string, companyId: string) {
  return apiRequest<{ submission: Record<string, unknown>; defects: Array<Record<string, unknown>> }>(
    `/api/v1/safety/dvir/${encodeURIComponent(id)}?${q(companyId)}`
  );
}

export function getSafetyAccidents(
  companyId: string,
  params: { driver_id?: string; unit_id?: string; load_id?: string; trailer_id?: string; from?: string; to?: string; limit?: number; offset?: number } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  // SAF-F17 / SAF-C01: server-side unit/load/trailer scoping (the route caps at LIMIT 500).
  // trailer_id landed in RANK5-ACCIDENT-TRAILER-ID (PR #6324) — safety.accident_reports.trailer_id
  // (mdata.equipment, PR #6316) is now filterable, not just storable.
  if (params.unit_id) qs.set("unit_id", params.unit_id);
  if (params.load_id) qs.set("load_id", params.load_id);
  if (params.trailer_id) qs.set("trailer_id", params.trailer_id);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ accidents: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/accidents?${qs.toString()}`);
}

export function getSafetyAccidentDetail(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}?${q(companyId)}`);
}

// SC1: office creator — the safety officer / office creates an accident report from the computer and
// links it to the real Driver / Unit / Repair Vendor / Load records (persists the four catalog ids).
// SAFE-1: at_fault = carrier fault determination (yes/no/disputed, null = not yet assessed);
// preventable = DOT/FMCSA preventability (true=Preventable, false=Not Preventable, null=Undetermined).
export type AccidentFault = "yes" | "no" | "disputed";
export type CreateAccidentInput = {
  operating_company_id: string;
  accident_type_id: string;
  driver_id?: string | null;
  unit_id?: string | null;
  /** RANK5 — trailer FK → mdata.equipment (accepted since #6324). */
  trailer_id?: string | null;
  vendor_id?: string | null;
  load_id?: string | null;
  accident_at?: string | null;
  description?: string | null;
  at_fault?: AccidentFault | null;
  preventable?: boolean | null;
  // SAF-F05: accident evidence fields the drawer previously discarded (now persisted).
  police_report_number?: string | null;
  insurance_claim_number?: string | null;
  location?: string | null;
  third_party_name?: string | null;
  third_party_plate?: string | null;
  vendor_invoice_number?: string | null;
  bill_or_expense_ref?: string | null;
  record_type?: "accident" | "damage" | "vandalism" | null;
  service_type?: "repair" | "replacement" | "tow" | null;
  report_date?: string | null;
  tax_rate_pct?: number | null;
  cost_lines?: Array<{ section: "A" | "B"; description?: string; amount_cents?: number; sort_order?: number }>;
};

export function createSafetyAccident(body: CreateAccidentInput) {
  return apiRequest<Record<string, unknown>>("/api/v1/safety/accidents", { method: "POST", body });
}

export type PatchAccidentInput = {
  accident_type_id?: string;
  driver_id?: string | null;
  unit_id?: string | null;
  /** RANK5 — trailer FK → mdata.equipment (accepted since #6324). */
  trailer_id?: string | null;
  vendor_id?: string | null;
  load_id?: string | null;
  accident_at?: string | null;
  description?: string | null;
  at_fault?: AccidentFault | null;
  preventable?: boolean | null;
  // SAF-F05: accident evidence fields the drawer previously discarded (now persisted).
  police_report_number?: string | null;
  insurance_claim_number?: string | null;
  location?: string | null;
  third_party_name?: string | null;
  third_party_plate?: string | null;
  vendor_invoice_number?: string | null;
  bill_or_expense_ref?: string | null;
  record_type?: "accident" | "damage" | "vandalism" | null;
  service_type?: "repair" | "replacement" | "tow" | null;
  report_date?: string | null;
  tax_rate_pct?: number | null;
  cost_lines?: Array<{ section: "A" | "B"; description?: string; amount_cents?: number; sort_order?: number }>;
};

export function patchSafetyAccident(id: string, companyId: string, body: PatchAccidentInput) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/accidents/${id}?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
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

export function getTrainingCompletions(companyId: string, params: { driver_id?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ training_completions: Array<Record<string, unknown>>; total_count: number }>(
    `/api/v1/safety/training/completions?${qs.toString()}`
  );
}

export type TrainingProgramCategory = "entry_level" | "refresher" | "remedial" | "hazmat" | "other";
export type TrainingProgramFrequency = "one_time" | "annual" | "n_month";
export type TrainingProgram = {
  id: string;
  operating_company_id: string;
  name: string;
  category: TrainingProgramCategory;
  frequency: TrainingProgramFrequency;
  recertify_months: number | null;
  passing_grade: string | null;
};

export function listTrainingPrograms(companyId: string) {
  return apiRequest<{ training_programs: TrainingProgram[] }>(
    `/api/v1/safety/training-programs?${q(companyId)}`
  );
}

export function createTrainingProgram(
  companyId: string,
  body: {
    name: string;
    category: TrainingProgramCategory;
    frequency: TrainingProgramFrequency;
    recertify_months?: number;
    passing_grade?: string;
  }
) {
  return apiRequest<TrainingProgram>(`/api/v1/safety/training-programs?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function createSafetyTrainingRecord(
  companyId: string,
  body: {
    driver_id: string;
    training_name: string;
    completed_at: string;
    expiry_date?: string;
    notes?: string;
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/training-records?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function createSafetyTrainingRecordsBatch(
  companyId: string,
  body: {
    driver_ids: string[];
    training_name: string;
    completed_at: string;
    expiry_date?: string;
    notes?: string;
  }
) {
  return apiRequest<{ training_records: Array<Record<string, unknown>> }>(
    `/api/v1/safety/training-records/batch?${q(companyId)}`,
    { method: "POST", body }
  );
}

export type SafetyBackgroundCheckRow = {
  id: string;
  driver_id: string;
  driver_name: string | null;
  check_type: "psp" | "mvr" | "drug" | "employment_verify";
  result: "pass" | "fail";
  checked_at: string;
  expiry_date: string | null;
  notes: string | null;
};

export function listSafetyBackgroundChecks(companyId: string, driverId?: string, range: { limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (driverId) params.set("driver_id", driverId);
  if (range.limit != null) params.set("limit", String(range.limit));
  if (range.offset != null) params.set("offset", String(range.offset));
  return apiRequest<{ background_checks: SafetyBackgroundCheckRow[]; total_count: number }>(`/api/v1/safety/background-checks?${params.toString()}`);
}

export function createSafetyBackgroundCheck(
  companyId: string,
  body: {
    driver_id: string;
    check_type: SafetyBackgroundCheckRow["check_type"];
    result: SafetyBackgroundCheckRow["result"];
    checked_at: string;
    expiry_date?: string;
    notes?: string;
  }
) {
  return apiRequest<SafetyBackgroundCheckRow>(`/api/v1/safety/background-checks?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export type SafetyMedicalCardRow = {
  id: string;
  driver_id: string;
  driver_name: string | null;
  card_number: string;
  issued_date: string;
  expiry_date: string;
  notes: string | null;
  days_to_expiry: number | null;
  expiry_pill: "red" | "amber" | "green" | "unknown";
};

export function listSafetyMedicalCards(companyId: string, driverId?: string, range: { limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (driverId) params.set("driver_id", driverId);
  if (range.limit != null) params.set("limit", String(range.limit));
  if (range.offset != null) params.set("offset", String(range.offset));
  return apiRequest<{ cards: SafetyMedicalCardRow[]; total_count: number }>(`/api/v1/safety/medical-cards?${params.toString()}`);
}

export function createSafetyMedicalCard(companyId: string, body: {
  driver_id: string;
  card_number: string;
  issued_date: string;
  expiry_date: string;
  notes?: string;
}) {
  return apiRequest<SafetyMedicalCardRow>(`/api/v1/safety/medical-cards?${q(companyId)}`, { method: "POST", body });
}

export type SafetyMeetingRow = SafetyEventLogRow & {
  required_attendees?: string[];
  attendance?: Record<string, boolean>;
};

function parseMeetingMeta(description: string | null | undefined) {
  if (!description) return { required_attendees: [] as string[], attendance: {} as Record<string, boolean> };
  try {
    const parsed = JSON.parse(description) as { required_attendees?: string[]; attendance?: Record<string, boolean> };
    return {
      required_attendees: parsed.required_attendees ?? [],
      attendance: parsed.attendance ?? {},
    };
  } catch {
    return { required_attendees: [] as string[], attendance: {} as Record<string, boolean> };
  }
}

export async function listSafetyMeetings(companyId: string) {
  const payload = await listSafetyEventLog(companyId);
  const meetings = payload.events
    .filter((event) => event.event_type === "safety_meeting")
    .map((event) => {
      const meta = parseMeetingMeta(event.description);
      return { ...event, ...meta };
    });
  const attendanceEvents = payload.events.filter((event) => event.event_type === "safety_meeting_attendance");
  for (const meeting of meetings) {
    for (const attendance of attendanceEvents) {
      if (!attendance.subject_driver_id) continue;
      let meetingId = meeting.id;
      try {
        const parsed = JSON.parse(attendance.description ?? "{}") as { meeting_id?: string };
        if (parsed.meeting_id) meetingId = parsed.meeting_id;
      } catch {
        // ignore malformed attendance payloads
      }
      if (meetingId !== meeting.id) continue;
      meeting.attendance = { ...(meeting.attendance ?? {}), [attendance.subject_driver_id]: true };
    }
  }
  return { meetings };
}

export function createSafetyMeeting(
  companyId: string,
  body: { topic: string; meeting_date: string; required_attendees: string[] }
) {
  return createSafetyEvent({
    operating_company_id: companyId,
    event_type: "safety_meeting",
    severity: "low",
    status: "open",
    kpi_bucket: "commendations",
    subject_type: "company",
    occurred_at: new Date(`${body.meeting_date}T12:00:00`).toISOString(),
    title: body.topic,
    description: JSON.stringify({
      required_attendees: body.required_attendees,
      attendance: {},
    }),
  });
}

export function syncSafetyMeetingAttendance(
  companyId: string,
  body: { meeting_id: string; meeting_title: string; driver_id: string; attended: boolean }
) {
  return createSafetyEvent({
    operating_company_id: companyId,
    event_type: "safety_meeting_attendance",
    severity: "low",
    status: body.attended ? "closed" : "open",
    kpi_bucket: "commendations",
    subject_type: "driver",
    subject_driver_id: body.driver_id,
    occurred_at: new Date().toISOString(),
    title: body.attended ? `Attended: ${body.meeting_title}` : `Absent: ${body.meeting_title}`,
    description: JSON.stringify({ meeting_id: body.meeting_id, attended: body.attended }),
  });
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

export function listDrugProgramTests(companyId: string, filters: { driver_id?: string; test_type?: string; result?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  for (const [key, value] of Object.entries(filters)) if (value != null && value !== "") qs.set(key, String(value));
  return apiRequest<{ tests: DrugProgramTest[]; total_count: number }>(`/api/v1/safety/drug-program/tests?${qs.toString()}`);
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

// FMCSA consortium random-pool enrollment (GAP-81 — safety.da_program_enrollments).
// Bulk-enrolls every active CDL driver so the random draw has a non-empty pool.
// Note: this feeds the GAP-81 consortium pool (RandomPoolDashboard / Drug & Alcohol
// Program tab), which is a separate surface from the compliance rate card.
export function bulkEnrollRandomPool(companyId: string, consortiumName: string) {
  return apiRequest<{ enrolled_count: number; enrolled_driver_uuids: string[] }>(
    `/api/safety/drug-alcohol/enrollments/bulk-active`,
    { method: "POST", body: { operating_company_id: companyId, consortium_name: consortiumName } }
  );
}

export function listRandomPoolEntries(companyId: string, range: { limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (range.limit != null) qs.set("limit", String(range.limit));
  if (range.offset != null) qs.set("offset", String(range.offset));
  return apiRequest<{ random_pools: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/drug-program/random-pools?${qs.toString()}`).then(
    (payload) => ({ entries: payload.random_pools ?? [], total_count: payload.total_count ?? 0 })
  );
}

export function listClearinghouseQueries(companyId: string, range: { limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (range.limit != null) qs.set("limit", String(range.limit));
  if (range.offset != null) qs.set("offset", String(range.offset));
  return apiRequest<{ clearinghouse_queries: Array<Record<string, unknown>>; total_count: number }>(
    `/api/v1/safety/drug-program/clearinghouse-queries?${qs.toString()}`
  ).then((payload) => ({ queries: payload.clearinghouse_queries ?? [], total_count: payload.total_count ?? 0 }));
}

// SM3 — Drug & Alcohol consortium enrollment (GAP-81 safety.da_program_enrollments). Backs the
// per-driver "D&A pool status" field on the Safety Home driver cards. active_only defaults true on the
// server, so this returns the currently-enrolled roster; a driver absent from it is not in the pool.
export type DaEnrollment = {
  uuid: string;
  operating_company_id: string;
  driver_uuid: string;
  driver_name?: string | null;
  consortium_name: string;
  enrolled_at: string;
  is_active: boolean;
  created_at: string;
};

export function listDaEnrollments(companyId: string) {
  return apiRequest<{ enrollments: DaEnrollment[] }>(`/api/safety/drug-alcohol/enrollments?${q(companyId)}`);
}

export function getDriverDrugProgramStatus(driverId: string, companyId: string) {
  // COMP-01: is_blocked/block_reason now come from the unified D&A prohibition evaluator shared with
  // the dispatch qualification gate (all three live result tables + the FMCSA Clearinghouse), not from
  // the latest safety.drug_test row alone. `block_source` names which source grounded the driver.
  return apiRequest<{
    driver_id: string;
    is_blocked: boolean;
    block_reason: string | null;
    block_source: string | null;
    latest_test: Record<string, unknown> | null;
    latest_test_is_blocking: boolean;
  }>(`/api/v1/safety/drug-program/drivers/${encodeURIComponent(driverId)}/drug-status?${q(companyId)}`);
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

export type SafetyReminderStatus = "open" | "dismissed" | "resolved";

export function listSafetyReminders(companyId: string, status: SafetyReminderStatus = "open") {
  const qs = new URLSearchParams({
    operating_company_id: companyId,
    status,
  });
  return apiRequest<{ reminders: SafetyReminderRow[] }>(`/api/v1/safety/reminders?${qs.toString()}`);
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

export function listDriverScoreEvents(companyId: string, driverId: string, periodDays: number, range: { limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({
    operating_company_id: companyId,
    period_days: String(periodDays),
  });
  if (range.limit != null) qs.set("limit", String(range.limit));
  if (range.offset != null) qs.set("offset", String(range.offset));
  return apiRequest<{ events: DriverScoreEvent[]; total_count: number }>(
    `/api/v1/safety/driver-scoring/${encodeURIComponent(driverId)}/events?${qs.toString()}`
  );
}

export type DriverSafetyScoreRow = {
  uuid: string;
  operating_company_id: string;
  driver_uuid: string;
  driver_name: string;
  period_start: string;
  period_end: string;
  harsh_brake_count: number;
  hard_accel_count: number;
  speeding_seconds: number;
  lane_departure_count: number;
  miles_driven: number;
  composite_score: number | null;
  rank_in_fleet: number | null;
  computed_at: string;
};

export function listDriverSafetyPeriodScores(companyId: string, from: string, to: string) {
  const qs = new URLSearchParams({
    operating_company_id: companyId,
    from,
    to,
  });
  return apiRequest<{ period_start: string; period_end: string; rows: DriverSafetyScoreRow[] }>(
    `/api/safety/driver-scoring/period?${qs.toString()}`
  );
}

export function listDriverSafetyTrend(companyId: string, driverUuid: string, periods = 12) {
  const qs = new URLSearchParams({
    operating_company_id: companyId,
    periods: String(periods),
  });
  return apiRequest<{ driver_uuid: string; periods: DriverSafetyScoreRow[] }>(
    `/api/safety/driver-scoring/driver/${encodeURIComponent(driverUuid)}?${qs.toString()}`
  );
}

export function getSafetyFines(
  companyId: string,
  params: { status?: string; subject_type?: "driver" | "company"; subject_driver_id?: string; related_load_id?: string; related_unit_id?: string; limit?: number; offset?: number } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.status) qs.set("status", params.status);
  if (params.subject_type) qs.set("subject_type", params.subject_type);
  if (params.subject_driver_id) qs.set("subject_driver_id", params.subject_driver_id);
  if (params.related_load_id) qs.set("related_load_id", params.related_load_id);
  if (params.related_unit_id) qs.set("related_unit_id", params.related_unit_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ fines: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/fines?${qs.toString()}`);
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

export function getCompanyViolations(companyId: string, params: { driver_id?: string; unit_id?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.unit_id) qs.set("unit_id", params.unit_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ company_violations: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/company-violations?${qs.toString()}`);
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

export function getDotInspections(companyId: string, params: { driver_id?: string; unit_id?: string; trailer_id?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  // SAF-F17: safety.dot_inspections carries both unit_id and trailer_id; both scope server-side.
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.unit_id) qs.set("unit_id", params.unit_id);
  if (params.trailer_id) qs.set("trailer_id", params.trailer_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ dot_inspections: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/dot-inspections?${qs.toString()}`);
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

export function listDotInspectionEvents(companyId: string, followUpState = "open", range: { limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId, follow_up_state: followUpState });
  if (range.limit != null) qs.set("limit", String(range.limit));
  if (range.offset != null) qs.set("offset", String(range.offset));
  return apiRequest<{ events: Array<Record<string, unknown>>; total_count: number }>(
    `/api/v1/safety/dot-inspection-events?${qs.toString()}`
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

export function getInternalFines(companyId: string, params: { driver_id?: string; load_id?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  // SAF-F16: server-side driver scoping (the route caps at LIMIT 500).
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.load_id) qs.set("load_id", params.load_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ fines: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/internal-fines?${qs.toString()}`);
}

/**
 * SAF-F12 — internal-fine lifecycle. Both transitions are reason-REQUIRED (min 3, matching the
 * backend contract and the accounting void contract). Void is Owner/Administrator-only server-side
 * and REFUSES a fine already converted to a driver liability, returning driver_liability_id so the
 * UI can name the dependent record instead of silently failing.
 */
export function disputeInternalFine(id: string, companyId: string, reason: string) {
  return apiRequest<{ fine: Record<string, unknown> }>(
    `/api/v1/safety/internal-fines/${encodeURIComponent(id)}/dispute?${q(companyId)}`,
    { method: "PATCH", body: { reason } }
  );
}

export function voidInternalFine(id: string, companyId: string, reason: string) {
  return apiRequest<{ fine: Record<string, unknown> }>(
    `/api/v1/safety/internal-fines/${encodeURIComponent(id)}/void?${q(companyId)}`,
    { method: "POST", body: { reason } }
  );
}

export function createInternalFine(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/internal-fines?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getComplaints(
  companyId: string,
  params: { driver_id?: string; customer_id?: string; user_id?: string; limit?: number; offset?: number } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  // SAF-F16: matches EITHER complainant_driver_id OR respondent_driver_id, server-side.
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.customer_id) qs.set("customer_id", params.customer_id);
  if (params.user_id) qs.set("user_id", params.user_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ complaints: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/complaints?${qs.toString()}`);
}

/**
 * SAF-F16 — driver-scoped drug & alcohol test history.
 *
 * Base path is `/api/safety/...` (NOT `/api/v1/...`): `registerDrugAlcoholProgramRoutes` is
 * registered with no prefix and the route hard-codes its own absolute path
 * (apps/backend/src/safety/drug-alcohol/routes.ts). Reads `safety.da_test_records`, whose driver
 * column is `driver_uuid`. The `/api/v1/safety/drug-alcohol/tests` route is a DIFFERENT endpoint
 * over the older `safety.drug_test` table and has no driver filter — do not swap them.
 */
export function getDriverDrugAlcoholTests(companyId: string, driverUuid: string) {
  const qs = new URLSearchParams({ operating_company_id: companyId, driver_uuid: driverUuid });
  return apiRequest<{ tests: Array<Record<string, unknown>> }>(
    `/api/safety/drug-alcohol/tests?${qs.toString()}`
  );
}

export function createComplaint(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/complaints?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function getIntegrityAlerts(
  companyId: string,
  params: { alert_category?: string; severity?: string; resolution_status?: string; subject_driver_id?: string; subject_unit_id?: string; subject_vendor_id?: string; limit?: number; offset?: number } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.alert_category) qs.set("alert_category", params.alert_category);
  if (params.severity) qs.set("severity", params.severity);
  if (params.resolution_status) qs.set("resolution_status", params.resolution_status);
  if (params.subject_driver_id) qs.set("subject_driver_id", params.subject_driver_id);
  if (params.subject_unit_id) qs.set("subject_unit_id", params.subject_unit_id);
  if (params.subject_vendor_id) qs.set("subject_vendor_id", params.subject_vendor_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ integrity_alerts: Array<Record<string, unknown>>; total_count: number }>(`/api/v1/safety/integrity-alerts?${qs.toString()}`);
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

export function snoozeIntegrityAlert(id: string, companyId: string, snoozeHours = 24) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alerts/${id}/snooze?${q(companyId)}`, {
    method: "POST",
    body: { snooze_hours: snoozeHours },
  });
}

export function getIntegrityAlertRules(companyId: string) {
  return apiRequest<{ integrity_alert_rules: Array<Record<string, unknown>> }>(
    `/api/v1/safety/integrity-alert-rules?${q(companyId)}`
  );
}

export function createIntegrityAlertRule(companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alert-rules?${q(companyId)}`, {
    method: "POST",
    body,
  });
}

export function updateIntegrityAlertRule(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/safety/integrity-alert-rules/${id}?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function evaluateIntegrityAlerts(companyId: string) {
  return apiRequest<{ rules_scanned: number; events_inserted: number; alerts_inserted: number }>(
    `/api/v1/safety/integrity-alerts/evaluate?${q(companyId)}`,
    { method: "POST" }
  );
}

export type SafetyAnomalySeverity = "low" | "medium" | "high" | "critical";
export type SafetyAnomalyStatus = "new" | "acknowledged" | "resolved" | "dismissed";
export type SafetyAnomalySubjectType = "driver" | "unit" | "customer" | "invoice";

export type SafetyAnomaly = {
  id: string;
  tenant_id: string;
  anomaly_type: string;
  severity: SafetyAnomalySeverity;
  subject_type: SafetyAnomalySubjectType;
  subject_id: string;
  subject_display_name?: string | null;
  detected_at: string;
  detector_version: string;
  evidence: Record<string, unknown>;
  status: SafetyAnomalyStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  resolution_note: string | null;
};

export function listAnomalies(
  companyId: string,
  params: { status?: SafetyAnomalyStatus; severity?: SafetyAnomalySeverity; subject?: SafetyAnomalySubjectType; subject_id?: string; limit?: number; offset?: number } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.status) qs.set("status", params.status);
  if (params.severity) qs.set("severity", params.severity);
  if (params.subject) qs.set("subject", params.subject);
  if (params.subject_id) qs.set("subject_id", params.subject_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return apiRequest<{ anomalies: SafetyAnomaly[]; total_count: number }>(`/api/v1/integrity/anomalies?${qs.toString()}`);
}

export function getAnomaly(id: string, companyId: string) {
  return apiRequest<{ anomaly: SafetyAnomaly }>(`/api/v1/integrity/anomalies/${encodeURIComponent(id)}?${q(companyId)}`);
}

export function ackAnomaly(id: string, companyId: string) {
  return apiRequest<{ anomaly: SafetyAnomaly }>(`/api/v1/integrity/anomalies/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function resolveAnomaly(id: string, companyId: string, resolution_note: string) {
  return apiRequest<{ anomaly: SafetyAnomaly }>(`/api/v1/integrity/anomalies/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: { operating_company_id: companyId, resolution_note },
  });
}

export function dismissAnomaly(id: string, companyId: string, resolution_note: string) {
  return apiRequest<{ anomaly: SafetyAnomaly }>(`/api/v1/integrity/anomalies/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
    body: { operating_company_id: companyId, resolution_note },
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
  const url = `/api/v1/safety/accidents/${id}/photos?${q(companyId)}`;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(resolveApiUrl(url), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Upload failed");
  return payload;
}

export type SafetyIncidentType = "damage_report" | "trailer_interchange" | "cargo_claim";

export type SafetyIncidentListFilters = {
  driver_id?: string;
  unit_id?: string;
  /** SAF-F17 — trailer profile reverse view (safety.incidents.trailer_id FKs mdata.equipment). */
  trailer_id?: string;
  /** SAF-C01 — load-detail reverse view (safety.incidents.load_id). */
  load_id?: string;
  claimant_customer_id?: string;
  date_from?: string;
  date_to?: string;
};

export function listSafetyIncidents(
  companyId: string,
  incidentType: SafetyIncidentType,
  filters: SafetyIncidentListFilters = {}
) {
  const qs = new URLSearchParams();
  // q() already embeds operating_company_id; append remaining list filters.
  if (filters.driver_id) qs.set("driver_id", filters.driver_id);
  if (filters.unit_id) qs.set("unit_id", filters.unit_id);
  if (filters.trailer_id) qs.set("trailer_id", filters.trailer_id);
  if (filters.load_id) qs.set("load_id", filters.load_id);
  if (filters.claimant_customer_id) qs.set("claimant_customer_id", filters.claimant_customer_id);
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  const extra = qs.toString();
  return apiRequest<{ incidents: Array<Record<string, unknown>> }>(
    `/api/v1/safety/incidents?${q(companyId)}&incident_type=${encodeURIComponent(incidentType)}${
      extra ? `&${extra}` : ""
    }`
  );
}

/**
 * SAF-F20 — incident lifecycle. `updateSafetyIncident` patches only real columns (never
 * incident_type: that decides which surface and which regulatory shape owns the record).
 * `setSafetyIncidentStatus` is reason-REQUIRED — a $4,000 damage report closed with no recorded
 * reason has no answer to "why?" when an insurer or auditor asks months later.
 */
export function updateSafetyIncident(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<{ incident: Record<string, unknown> }>(
    `/api/v1/safety/incidents/${encodeURIComponent(id)}?${q(companyId)}`,
    { method: "PATCH", body }
  );
}

/**
 * SAF-B19 — void an incident (void-not-delete). The route has existed and been registered since
 * SAF-F20 (`incidents.routes.ts:576`, Owner/Administrator only, reason required) but NO client ever
 * called it, so "a row can be voided" was unreachable by any operator: a retraction could only be
 * performed by someone with direct API access. Closing is a lifecycle outcome; voiding is a
 * retraction — the route keeps them distinct and so must the UI.
 */
export function voidSafetyIncident(id: string, companyId: string, voidReason: string) {
  return apiRequest<{ incident: Record<string, unknown> }>(
    `/api/v1/safety/incidents/${encodeURIComponent(id)}/void?${q(companyId)}`,
    { method: "POST", body: { void_reason: voidReason } }
  );
}

export function setSafetyIncidentStatus(
  id: string,
  companyId: string,
  status: "open" | "investigating" | "closed",
  reason: string
) {
  return apiRequest<{ incident: Record<string, unknown> }>(
    `/api/v1/safety/incidents/${encodeURIComponent(id)}/status?${q(companyId)}`,
    { method: "POST", body: { status, reason } }
  );
}

export function getSafetyIncident(id: string, companyId: string) {
  return apiRequest<{ incident: Record<string, unknown> }>(`/api/v1/safety/incidents/${id}?${q(companyId)}`);
}

export function createSafetyIncident(body: {
  operating_company_id: string;
  incident_type: SafetyIncidentType;
  incident_at?: string;
  location?: string;
  description?: string;
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  load_id?: string | null;
  interchange_party?: string | null;
  damage_amount_cents?: number;
  // SC4 — Carmack/49 CFR 1005.2 cargo-claim fields (cargo_claim rows only).
  claim_reason_code?: string | null;
  claim_reason_id?: string | null;
  claimant_customer_id?: string | null;
  claim_filed_at?: string | null;
}) {
  return apiRequest<{ incident: Record<string, unknown> }>("/api/v1/safety/incidents", {
    method: "POST",
    body,
  });
}

export async function uploadSafetyIncidentPhoto(id: string, companyId: string, file: File) {
  const url = `/api/v1/safety/incidents/${id}/photos?${q(companyId)}`;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(resolveApiUrl(url), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Upload failed");
  return payload;
}

export type SafetyPermitType =
  | "state_operating_authority"
  | "ifta_sticker"
  | "oversize_overweight"
  | "hazmat"
  | "other";

export function getSafetyPermits(
  companyId: string,
  params: { include_archived?: boolean; permit_type?: SafetyPermitType; unit_id?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.include_archived) qs.set("include_archived", "true");
  if (params.permit_type) qs.set("permit_type", params.permit_type);
  if (params.unit_id) qs.set("unit_id", params.unit_id);
  return apiRequest<{
    permits: Array<Record<string, unknown>>;
    renewal_alerts: Array<Record<string, unknown>>;
    renewal_reminder: Record<string, unknown>;
  }>(`/api/v1/safety/permits?${qs.toString()}`);
}

export function createSafetyPermit(_companyId: string, body: Record<string, unknown>) {
  return apiRequest<{ permit: Record<string, unknown> }>("/api/v1/safety/permits", {
    method: "POST",
    body,
  });
}

export function updateSafetyPermit(id: string, companyId: string, body: Record<string, unknown>) {
  return apiRequest<{ permit: Record<string, unknown> }>(`/api/v1/safety/permits/${id}?${q(companyId)}`, {
    method: "PATCH",
    body,
  });
}

export function archiveSafetyPermit(id: string, companyId: string) {
  return apiRequest<{ permit: Record<string, unknown> }>(`/api/v1/safety/permits/${id}/archive?${q(companyId)}`, {
    method: "POST",
  });
}

export function restoreSafetyPermit(id: string, companyId: string) {
  return apiRequest<{ permit: Record<string, unknown> }>(`/api/v1/safety/permits/${id}/restore?${q(companyId)}`, {
    method: "POST",
  });
}

export function updatePermitRenewalReminder(
  companyId: string,
  body: { days_before_expiry?: number; enabled?: boolean }
) {
  return apiRequest<{ renewal_reminder: Record<string, unknown> }>(
    `/api/v1/safety/permits/renewal-reminder?${q(companyId)}`,
    {
      method: "PATCH",
      body,
    }
  );
}

// ─── SAF-B31: Safety Reports surface readers ─────────────────────────────────
// Both endpoints below already exist and are registered on main. Nothing here invents a route.
//   GET /api/v1/safety/reports/:report_id         apps/backend/src/safety/reports/safety-reports.routes.ts:39
//   GET /api/v1/safety/dot-inspections/clean-rate apps/backend/src/routes/safety/dot-inspections.ts:78
// Both are entity-scoped server-side (assertCompanyMembership + app.operating_company_id).
//
// NOTE: GET /api/v1/safety/reports/:report_id/export.xlsx now mirrors the scoped rollup query
// (fetchSafetyReportRows in safety-reports.routes.ts). Empty companies get a header-only sheet.
// SafetyReportsPage still uses ParityTable CSV for on-screen rows; XLSX export can be wired when
// product wants a download control — the backend path is no longer a fabricated stub.

export type SafetyReportRollupRow = { event_class: string; total: number };

export function getSafetyReportRollup(companyId: string, reportId: string) {
  return apiRequest<{ report_id: string; rows: SafetyReportRollupRow[] }>(
    `/api/v1/safety/reports/${encodeURIComponent(reportId)}?${q(companyId)}`
  );
}

export type SafetyInspectionCleanRate = {
  clean_rate_percent: number | null;
  total_inspections: number;
  clean_inspections: number;
  trailing_months: number;
};

export function getSafetyInspectionCleanRate(companyId: string) {
  return apiRequest<SafetyInspectionCleanRate>(`/api/v1/safety/dot-inspections/clean-rate?${q(companyId)}`);
}

// ── SAF-B12 — external-fine lifecycle callers ────────────────────────────────────────────────────
// The four routes below have existed and been audited in apps/backend/src/safety/fines.routes.ts
// since BT-3-SAFETY-GAPS-FILL, but had ZERO frontend callers: the only thing an operator could do
// with an external (authority-issued) fine was "Convert to Driver Liability". A wrongly-issued
// citation could not be contested, dismissed, reduced, or marked paid from the UI.
//
// Every signature below is transcribed from the route's own zod schema — no invented fields:
//   POST /api/v1/safety/fines/:id/contest       body updateStatusBody { notes?: string.min(1) }
//   POST /api/v1/safety/fines/:id/dismiss       body updateStatusBody { notes?: string.min(1) }
//   POST /api/v1/safety/fines/:id/reduce        body reduceFineBody   { amount_cents: int>=0, reason: string.min(1) }
//   POST /api/v1/safety/fines/:id/link-payment  body linkPaymentBody  { bank_transaction_id: uuid,
//                                                                       paid_date: string.min(1),
//                                                                       paid_amount_cents: int>=0 }
// All four return the updated safety.civil_fines row; all four require role Owner/Administrator/Safety.

/** POST /api/v1/safety/fines/:id/contest — status → 'contested'. `notes` is optional (zod .min(1) when sent). */
export function contestSafetyFine(fineId: string, companyId: string, notes?: string) {
  const body: { notes?: string } = {};
  if (notes && notes.trim().length > 0) body.notes = notes.trim();
  return apiRequest<Record<string, unknown>>(
    `/api/v1/safety/fines/${encodeURIComponent(fineId)}/contest?${q(companyId)}`,
    { method: "POST", body }
  );
}

/** POST /api/v1/safety/fines/:id/dismiss — status → 'dismissed'. `notes` is optional (zod .min(1) when sent). */
export function dismissSafetyFine(fineId: string, companyId: string, notes?: string) {
  const body: { notes?: string } = {};
  if (notes && notes.trim().length > 0) body.notes = notes.trim();
  return apiRequest<Record<string, unknown>>(
    `/api/v1/safety/fines/${encodeURIComponent(fineId)}/dismiss?${q(companyId)}`,
    { method: "POST", body }
  );
}

/**
 * POST /api/v1/safety/fines/:id/reduce — amount_cents := new amount, status → 'reduced', reason appended
 * to notes. The server refuses (409 `fine_already_converted_to_liability`) when the fine already carries a
 * converted_to_liability_id, and (409 `fine_voided`) when voided_at is set — OWNER RULING 2026-07-23
 * Option B. The UI mirrors those two gates; it does not replace them.
 */
export function reduceSafetyFine(
  fineId: string,
  companyId: string,
  body: { amount_cents: number; reason: string }
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/safety/fines/${encodeURIComponent(fineId)}/reduce?${q(companyId)}`,
    { method: "POST", body }
  );
}

/**
 * POST /api/v1/safety/fines/:id/link-payment — records which banking.bank_transactions row paid this
 * fine and flips status → 'paid'. Writes ONLY safety.civil_fines (paid_via_bank_transaction_id, paid_date,
 * paid_amount_cents, status) plus two audit rows; it posts no GL entry and touches no accounting.* object.
 */
export function linkSafetyFinePayment(
  fineId: string,
  companyId: string,
  body: { bank_transaction_id: string; paid_date: string; paid_amount_cents: number }
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/safety/fines/${encodeURIComponent(fineId)}/link-payment?${q(companyId)}`,
    { method: "POST", body }
  );
}

/** GAP-25 — the cached Samsara active-driver-set thresholds Safety Home's freshness selector offers. */
export const ACTIVITY_WINDOW_OPTIONS = [7, 14, 30] as const;
export type ActiveDriverSetThresholdDays = (typeof ACTIVITY_WINDOW_OPTIONS)[number];

export type ActiveDriverSetResult = {
  active_driver_uuids: string[];
  total_driver_count: number;
  snapshot_at: string;
  threshold_days: number;
  cache_hit: boolean;
};

/**
 * GAP-25 — GET /api/integrations/samsara/active-drivers (backend built, never consumed by any
 * frontend surface until this call site — see verify-active-driver-set.mjs step 7). Returns the
 * cached snapshot when fresh (cache_hit: true); the backend recomputes synchronously and returns
 * cache_hit: false when stale/absent — either way the response shape is identical.
 */
export function getActiveDriverSet(companyId: string, thresholdDays: ActiveDriverSetThresholdDays = 7) {
  return apiRequest<ActiveDriverSetResult>(
    `/api/integrations/samsara/active-drivers?${q(companyId)}&threshold_days=${thresholdDays}`
  );
}
