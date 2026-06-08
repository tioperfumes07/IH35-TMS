import { appendCrudAudit } from "../../audit/crud-audit.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

type DriverIncidentType = "accident" | "damage" | "cargo" | "equipment" | "injury" | "breakdown" | "other";
type IncidentSeverity = "info" | "warning" | "critical";
type IncidentWitness = { name: string; phone: string; statement: string };
type IncidentPoliceReport = {
  has_report: boolean;
  report_number?: string | null;
  agency?: string | null;
  officer_name?: string | null;
  notes?: string | null;
};

export type FullIncidentReportInput = {
  operating_company_id: string;
  driver_id: string;
  unit_id: string | null;
  trailer_id: string | null;
  load_id: string;
  stop_id: string | null;
  type: DriverIncidentType;
  severity: IncidentSeverity;
  description: string;
  incident_subtype: string | null;
  occurred_at: string;
  location_label: string;
  geo_lat: number | null;
  geo_lng: number | null;
  photo_keys: string[];
  witnesses: IncidentWitness[];
  police_report: IncidentPoliceReport;
  photo_exif: Array<Record<string, unknown>>;
};

function pickColumn(existingColumns: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existingColumns.has(candidate)) return candidate;
  }
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapIncidentType(type: DriverIncidentType): "damage_report" | "cargo_claim" | "trailer_interchange" {
  if (type === "cargo") return "cargo_claim";
  if (type === "accident" || type === "injury" || type === "damage") return "damage_report";
  return "trailer_interchange";
}

function buildDescription(input: FullIncidentReportInput): string {
  const sections: string[] = [input.description.trim()];
  if (input.incident_subtype) sections.push(`Subtype: ${input.incident_subtype.trim()}`);
  if (input.witnesses.length > 0) sections.push(`Witnesses: ${JSON.stringify(input.witnesses)}`);
  if (input.police_report.has_report) {
    sections.push(
      `Police: ${JSON.stringify({
        report_number: input.police_report.report_number ?? null,
        agency: input.police_report.agency ?? null,
        officer_name: input.police_report.officer_name ?? null,
        notes: input.police_report.notes ?? null,
      })}`
    );
  }
  if (input.photo_exif.length > 0) sections.push(`Photo EXIF: ${JSON.stringify(input.photo_exif)}`);
  return sections.filter(Boolean).join("\n\n");
}

export async function createFullIncidentReport(
  client: DbClient,
  actorUserId: string,
  input: FullIncidentReportInput
): Promise<{ incident: Record<string, unknown>; normalized_incident_type: string }> {
  const normalizedIncidentType = mapIncidentType(input.type);
  const columnsRes = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'safety'
        AND table_name = 'incidents'
    `
  );
  if (columnsRes.rows.length === 0) {
    throw new Error("safety_incidents_table_missing");
  }
  const columnSet = new Set(columnsRes.rows.map((row) => row.column_name));

  const cols: string[] = [];
  const values: unknown[] = [];
  const placeholders: string[] = [];
  const add = (column: string, value: unknown) => {
    cols.push(column);
    values.push(value);
    placeholders.push(`$${values.length}`);
  };

  const operatingCompanyCol = pickColumn(columnSet, ["operating_company_id"]);
  if (!operatingCompanyCol) throw new Error("safety_incidents_missing_operating_company_id");
  add(operatingCompanyCol, input.operating_company_id);

  const incidentTypeCol = pickColumn(columnSet, ["incident_type", "type"]);
  if (!incidentTypeCol) throw new Error("safety_incidents_missing_incident_type");
  add(incidentTypeCol, normalizedIncidentType);

  const incidentAtCol = pickColumn(columnSet, ["incident_at", "occurred_at"]);
  if (incidentAtCol) add(incidentAtCol, input.occurred_at);

  const statusCol = pickColumn(columnSet, ["status"]);
  if (statusCol) add(statusCol, "open");

  const descriptionCol = pickColumn(columnSet, ["description", "issue_description"]);
  if (descriptionCol) add(descriptionCol, buildDescription(input));

  const locationCol = pickColumn(columnSet, ["location", "gps_label", "location_label"]);
  if (locationCol) add(locationCol, input.location_label || "Driver PWA");

  const loadCol = pickColumn(columnSet, ["load_id"]);
  if (loadCol) add(loadCol, input.load_id);

  const stopCol = pickColumn(columnSet, ["stop_id"]);
  if (stopCol) add(stopCol, input.stop_id);

  const driverCol = pickColumn(columnSet, ["driver_id"]);
  if (driverCol) add(driverCol, input.driver_id);

  const unitCol = pickColumn(columnSet, ["unit_id"]);
  if (unitCol) add(unitCol, input.unit_id);

  const trailerCol = pickColumn(columnSet, ["trailer_id"]);
  if (trailerCol) add(trailerCol, input.trailer_id);

  const photoKeysCol = pickColumn(columnSet, ["photo_keys"]);
  if (photoKeysCol) add(photoKeysCol, input.photo_keys);

  const evidenceCol = pickColumn(columnSet, ["evidence_uuids"]);
  if (evidenceCol) add(evidenceCol, input.photo_keys.filter(isUuid));

  const subtypeCol = pickColumn(columnSet, ["incident_subtype"]);
  if (subtypeCol) add(subtypeCol, input.incident_subtype);

  const policeNumberCol = pickColumn(columnSet, ["police_report_number"]);
  if (policeNumberCol) add(policeNumberCol, input.police_report.report_number ?? null);

  const witnessesCol = pickColumn(columnSet, ["witnesses"]);
  if (witnessesCol) add(witnessesCol, JSON.stringify(input.witnesses));

  const geoCol = pickColumn(columnSet, ["geo"]);
  if (geoCol) {
    add(
      geoCol,
      JSON.stringify({
        lat: input.geo_lat,
        lng: input.geo_lng,
      })
    );
  }

  const insertRes = await client.query<Record<string, unknown>>(
    `
      INSERT INTO safety.incidents (${cols.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING *
    `,
    values
  );
  const incident = insertRes.rows[0];
  if (!incident) throw new Error("safety_incident_create_failed");

  await appendCrudAudit(
    client,
    actorUserId,
    "safety.incident.full_report_created",
    {
      resource_type: "safety.incidents",
      resource_id: String(incident.id ?? ""),
      incident_type: input.type,
      normalized_incident_type: normalizedIncidentType,
      operating_company_id: input.operating_company_id,
      load_id: input.load_id,
      stop_id: input.stop_id,
    },
    input.severity === "critical" ? "critical" : "warning",
    "WF-048"
  );

  return {
    incident,
    normalized_incident_type: normalizedIncidentType,
  };
}
