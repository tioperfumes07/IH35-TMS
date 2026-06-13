/**
 * M2: Position History API Client
 * Tracks history of positioned-part assignments for Integrity/Abuse detection
 */

import { apiRequest } from "./client";

export interface PositionHistoryRecord {
  id: string;
  operating_company_id: string;
  unit_id: string;
  unit_type: "truck" | "trailer" | "reefer";
  unit_number?: string;
  unit_license_plate?: string;
  position_set_id: string;
  position_set_name?: string;
  position_code: string;
  part_id: string | null;
  part_number: string | null;
  part_name: string | null;
  action: "installed" | "removed" | "replaced";
  action_reason: string | null;
  actor_id: string;
  actor_name: string | null;
  action_at: string;
  source_type: "work_order" | "manual_entry" | "bulk_import" | null;
  source_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface PositionHistoryListResponse {
  rows: PositionHistoryRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface PositionHistoryTimelineResponse {
  rows: PositionHistoryRecord[];
  unit_id: string;
  position_code: string;
  limit: number;
}

export interface CreatePositionHistoryRequest {
  operating_company_id: string;
  unit_id: string;
  unit_type: "truck" | "trailer" | "reefer";
  position_set_id: string;
  position_code: string;
  part_id?: string;
  part_number?: string;
  action: "installed" | "removed" | "replaced";
  action_reason?: string;
  action_at?: string; // ISO datetime
  source_type?: "work_order" | "manual_entry" | "bulk_import";
  source_id?: string;
  notes?: string;
}

export async function listPositionHistory(
  companyId: string,
  filters: {
    unit_id?: string;
    part_id?: string;
    position_set_id?: string;
    action?: "installed" | "removed" | "replaced";
    limit?: number;
    offset?: number;
  } = {}
): Promise<PositionHistoryListResponse> {
  const params = new URLSearchParams();
  params.append("operating_company_id", companyId);
  if (filters.unit_id) params.append("unit_id", filters.unit_id);
  if (filters.part_id) params.append("part_id", filters.part_id);
  if (filters.position_set_id) params.append("position_set_id", filters.position_set_id);
  if (filters.action) params.append("action", filters.action);
  if (filters.limit !== undefined) params.append("limit", String(filters.limit));
  if (filters.offset !== undefined) params.append("offset", String(filters.offset));

  return apiRequest<PositionHistoryListResponse>(
    `/api/v1/safety/position-history?${params.toString()}`
  );
}

export async function getPositionHistoryRecord(
  id: string,
  companyId: string
): Promise<PositionHistoryRecord> {
  return apiRequest<PositionHistoryRecord>(
    `/api/v1/safety/position-history/${id}?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export async function createPositionHistoryRecord(
  data: CreatePositionHistoryRequest
): Promise<PositionHistoryRecord> {
  return apiRequest<PositionHistoryRecord>("/api/v1/safety/position-history", {
    method: "POST",
    body: data,
  });
}

export async function getPositionHistoryTimeline(
  unitId: string,
  positionCode: string,
  companyId: string,
  limit: number = 20
): Promise<PositionHistoryTimelineResponse> {
  return apiRequest<PositionHistoryTimelineResponse>(
    `/api/v1/safety/position-history/timeline/${encodeURIComponent(unitId)}/${encodeURIComponent(positionCode)}?operating_company_id=${encodeURIComponent(companyId)}&limit=${limit}`
  );
}
