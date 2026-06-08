import { ApiError, apiRequest } from "./client";
import { enqueueUpload, type UploadQueueItem } from "../lib/upload-queue";
import type { DriverIncidentType, IncidentPayload } from "@ih35/shared-types";
export type { DriverIncidentType, IncidentSeverity, IncidentPayload } from "@ih35/shared-types";

function mapLegacyIncidentType(type: DriverIncidentType):
  | "check_engine_warning"
  | "mechanical_breakdown"
  | "accident_minor"
  | "accident_major"
  | "cargo_issue"
  | "other" {
  if (type === "equipment") return "check_engine_warning";
  if (type === "breakdown") return "mechanical_breakdown";
  if (type === "accident") return "accident_major";
  if (type === "injury") return "accident_minor";
  if (type === "damage") return "accident_minor";
  if (type === "cargo") return "cargo_issue";
  return "other";
}

export async function submitIncident(payload: IncidentPayload): Promise<{ queued: boolean }> {
  const body = {
    load_id: payload.load_id,
    stop_id: payload.stop_id ?? null,
    type: payload.type,
    severity: payload.severity,
    incident_subtype: payload.incident_subtype ?? null,
    description: payload.description,
    location_label: payload.location_label ?? "Driver PWA",
    geo_lat: payload.lat,
    geo_lng: payload.lng,
    occurred_at: payload.occurred_at,
    photo_keys: payload.document_keys,
    witnesses: payload.witnesses ?? [],
    police_report: payload.police_report ?? {
      has_report: false,
      report_number: null,
      agency: null,
      officer_name: null,
      notes: null,
    },
    photo_exif: payload.photo_exif ?? [],
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const serialized = JSON.stringify({
      kind: "incident_full_report_submission",
      endpoint: "/api/v1/safety/incidents/full-report",
      payload: body,
    });
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

  try {
    await apiRequest<{ incident: { id: string } }>("/api/v1/safety/incidents/full-report", {
      method: "POST",
      body,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 501)) {
      throw error;
    }
    await apiRequest<{ id: string; created_at: string }>("/api/v1/dispatch/intransit-issues", {
      method: "POST",
      body: {
        load_id: payload.load_id,
        stop_id: payload.stop_id ?? null,
        type: mapLegacyIncidentType(payload.type),
        severity: payload.severity,
        description: payload.description,
        location: payload.location_label ?? "Driver PWA",
        geo_lat: payload.lat,
        geo_lng: payload.lng,
        occurred_at: payload.occurred_at,
        photo_keys: payload.document_keys,
      },
    });
  }
  return { queued: false };
}
