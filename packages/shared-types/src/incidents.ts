export type DriverIncidentType =
  | "check_engine_warning"
  | "mechanical_breakdown"
  | "accident_minor"
  | "accident_major"
  | "cargo_issue"
  | "other";

export type IncidentSeverity = "info" | "warning" | "critical";

export type IncidentPayload = {
  load_id: string;
  stop_id?: string;
  type: DriverIncidentType;
  severity: IncidentSeverity;
  description: string;
  lat: number | null;
  lng: number | null;
  occurred_at: string;
  document_keys: string[];
};
