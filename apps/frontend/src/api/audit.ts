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
