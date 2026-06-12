import { apiRequest } from "./client";

export type DriverAuditEvent = {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  summary: string;
  actor_user_id: string | null;
  actor_email: string | null;
  payload: unknown;
  source: string | null;
};

export type ListDriverAuditEventsParams = {
  operatingCompanyId: string;
  driverId: string;
  eventType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listDriverAuditEvents(params: ListDriverAuditEventsParams) {
  const search = new URLSearchParams({
    operating_company_id: params.operatingCompanyId,
    entity_type: "driver",
    entity_id: params.driverId,
  });
  if (params.eventType) search.set("event_type", params.eventType);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  return apiRequest<{
    events: DriverAuditEvent[];
    total_count: number;
    limit: number;
    offset: number;
  }>(`/api/v1/audit/events?${search.toString()}`);
}

export type AuditEventListItem = {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  payload: unknown;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
  bulk_call_id: string | null;
};

export type ListAuditEventsParams = {
  operatingCompanyId: string;
  bulkCallId?: string;
  eventType?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditEvents(params: ListAuditEventsParams) {
  const search = new URLSearchParams({
    operating_company_id: params.operatingCompanyId,
  });
  if (params.bulkCallId) search.set("bulk_call_id", params.bulkCallId);
  if (params.eventType) search.set("event_type", params.eventType);
  if (params.entityType) search.set("entity_type", params.entityType);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  return apiRequest<{
    events: AuditEventListItem[];
    total_count: number;
    limit: number;
    offset: number;
  }>(`/api/v1/audit/events-list?${search.toString()}`);
}

// ── GAP-87: Audit Log Viewer ─────────────────────────────────────────────────

export type AuditViewerEvent = {
  id: string;
  created_at: string;
  event_class: string;
  severity: "info" | "warning" | "critical";
  payload: unknown;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
};

export type ListAuditViewerEventsParams = {
  operatingCompanyId: string;
  entityType?: string;
  entityUuid?: string;
  userUuid?: string;
  action?: string;
  from?: string;
  to?: string;
  severity?: string;
  searchText?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditViewerEvents(params: ListAuditViewerEventsParams) {
  const search = new URLSearchParams({
    operating_company_id: params.operatingCompanyId,
  });
  if (params.entityType) search.set("entity_type", params.entityType);
  if (params.entityUuid) search.set("entity_uuid", params.entityUuid);
  if (params.userUuid) search.set("user_uuid", params.userUuid);
  if (params.action) search.set("action", params.action);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.severity) search.set("severity", params.severity);
  if (params.searchText) search.set("search_text", params.searchText);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  return apiRequest<{
    events: AuditViewerEvent[];
    total_count: number;
    limit: number;
    offset: number;
  }>(`/api/audit/viewer/events?${search.toString()}`);
}

export async function getAuditViewerEventDetail(eventUuid: string) {
  return apiRequest<{ event: AuditViewerEvent }>(`/api/audit/viewer/events/${encodeURIComponent(eventUuid)}`);
}

// ── A6: Spine Events (events.event_log) ──────────────────────────────────────

export type SpineEvent = {
  event_id: string;
  occurred_at: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  actor_email: string | null;
  subject_type: string | null;
  subject_id: string | null;
  payload: unknown;
  source: string | null;
  source_table: string | null;
  source_reference_id: string | null;
  actor_user_id: string | null;
  correlation_id: string | null;
};

export type ListSpineEventsParams = {
  operatingCompanyId: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
};

export async function listSpineEvents(params: ListSpineEventsParams) {
  const search = new URLSearchParams({ operating_company_id: params.operatingCompanyId });
  if (params.module) search.set("module", params.module);
  if (params.entityType) search.set("entity_type", params.entityType);
  if (params.entityId) search.set("entity_id", params.entityId);
  if (params.actorUserId) search.set("actor_user_id", params.actorUserId);
  if (params.action) search.set("action", params.action);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.correlationId) search.set("correlation_id", params.correlationId);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  return apiRequest<{ events: SpineEvent[]; total_count: number; limit: number; offset: number }>(
    `/api/v1/audit/spine-events?${search.toString()}`
  );
}
