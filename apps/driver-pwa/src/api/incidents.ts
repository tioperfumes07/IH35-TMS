import { apiRequest } from "./client";
import { enqueueUpload, type UploadQueueItem } from "../lib/upload-queue";
import type { DriverIncidentType, IncidentPayload } from "@ih35/shared-types";
export type { DriverIncidentType, IncidentSeverity, IncidentPayload } from "@ih35/shared-types";

function mapIncidentCategory(type: DriverIncidentType): string {
  switch (type) {
    case "check_engine_warning":
    case "mechanical_breakdown":
      return "mechanical";
    case "accident_minor":
    case "accident_major":
      return "safety";
    case "cargo_issue":
      return "customer";
    default:
      return "other";
  }
}

// Real endpoint implemented in T11.15.4:
// POST /api/v1/dispatch/intransit-issues
export async function submitIncident(payload: IncidentPayload): Promise<{ queued: boolean }> {
  const body = {
    load_uuid: payload.load_id,
    category: mapIncidentCategory(payload.type),
    severity: payload.severity,
    description: payload.description,
    lat: payload.lat,
    lng: payload.lng,
    captured_at_device: payload.occurred_at,
    evidence_uuids: payload.document_keys,
    source_type: payload.type,
    stop_id: payload.stop_id ?? null,
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const serialized = JSON.stringify({ kind: "incident_submission", payload: body });
    const fileBlob = new Blob([serialized], { type: "application/json" });
    const item: UploadQueueItem = {
      id: `incident-${payload.load_id}-${Date.now()}`,
      file_blob: fileBlob,
      mime_type: "application/json",
      original_filename: "incident-offline.json",
      size_bytes: fileBlob.size,
      category_id: null,
      entity_type: "load",
      entity_id: payload.load_id,
      document_date: payload.occurred_at.slice(0, 10),
      expiration_date: null,
      description: serialized,
      retry_count: 0,
      last_error: null,
      created_at: new Date().toISOString(),
      status: "pending",
      next_retry_at: null,
    };
    await enqueueUpload(item);
    return { queued: true };
  }

  await apiRequest<{ id: string; created_at: string }>("/api/v1/dispatch/intransit-issues", {
    method: "POST",
    body: {
      load_id: payload.load_id,
      stop_id: payload.stop_id ?? null,
      type: payload.type,
      severity: payload.severity,
      description: payload.description,
      location: "Driver PWA",
      geo_lat: payload.lat,
      geo_lng: payload.lng,
      occurred_at: payload.occurred_at,
      photo_keys: payload.document_keys,
    },
  });
  return { queued: false };
}
