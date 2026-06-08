export type DriverIncidentType = "accident" | "damage" | "cargo" | "equipment" | "injury" | "breakdown" | "other";

export type IncidentSeverity = "info" | "warning" | "critical";

export type IncidentWitness = {
  name: string;
  phone: string;
  statement: string;
};

export type IncidentPoliceReport = {
  has_report: boolean;
  report_number?: string | null;
  agency?: string | null;
  officer_name?: string | null;
  notes?: string | null;
};

export type IncidentPayload = {
  load_id: string;
  stop_id?: string;
  type: DriverIncidentType;
  severity: IncidentSeverity;
  description: string;
  incident_subtype?: string | null;
  location_label?: string | null;
  lat: number | null;
  lng: number | null;
  occurred_at: string;
  document_keys: string[];
  witnesses?: IncidentWitness[];
  police_report?: IncidentPoliceReport;
  photo_exif?: Array<Record<string, unknown>>;
};
