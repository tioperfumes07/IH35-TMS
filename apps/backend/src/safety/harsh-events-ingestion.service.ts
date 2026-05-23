import { getDriverForVehicleAtTime } from "../telematics/vehicle-driver-lookup.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type HarshEventInput = {
  operating_company_id: string;
  unit_id: string;
  event_at: string;
  raw_samsara_id: string;
  event_kind: "harsh_brake" | "harsh_accel" | "harsh_turn" | "speeding" | "mobile_use" | "distracted" | "rolling_stop" | "no_seatbelt";
  severity: "minor" | "major" | "critical";
  speed_at_event_mph?: number | null;
  g_force?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

function toSeverity(value: string): HarshEventInput["severity"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "major") return "major";
  return "minor";
}

function mapEventKind(value: string): HarshEventInput["event_kind"] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("brake")) return "harsh_brake";
  if (normalized.includes("accel")) return "harsh_accel";
  if (normalized.includes("turn") || normalized.includes("corner")) return "harsh_turn";
  if (normalized.includes("speed")) return "speeding";
  if (normalized.includes("mobile")) return "mobile_use";
  if (normalized.includes("distract")) return "distracted";
  if (normalized.includes("seatbelt")) return "no_seatbelt";
  if (normalized.includes("rolling_stop") || normalized.includes("rolling stop")) return "rolling_stop";
  return null;
}

function parseHarshEntries(payload: Record<string, unknown>): Array<Omit<HarshEventInput, "operating_company_id" | "unit_id" | "event_at">> {
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? (payload.data as Record<string, unknown>) : payload;
  const candidates = [data.harsh_events, data.safety_events, data.events, payload.events, payload.harsh_events];
  const out: Array<Omit<HarshEventInput, "operating_company_id" | "unit_id" | "event_at">> = [];
  for (const raw of candidates) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const kind = mapEventKind(String(obj.event_kind ?? obj.kind ?? obj.type ?? ""));
      const rawId = String(obj.id ?? obj.event_id ?? "").trim();
      if (!kind || !rawId) continue;
      const speed = Number(obj.speed_mph ?? obj.speed ?? NaN);
      const gForce = Number(obj.g_force ?? obj.gforce ?? NaN);
      const latitude = Number(obj.latitude ?? obj.lat ?? NaN);
      const longitude = Number(obj.longitude ?? obj.lng ?? obj.lon ?? NaN);
      out.push({
        raw_samsara_id: rawId,
        event_kind: kind,
        severity: toSeverity(String(obj.severity ?? "minor")),
        speed_at_event_mph: Number.isFinite(speed) ? speed : null,
        g_force: Number.isFinite(gForce) ? gForce : null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
      });
    }
  }
  return out;
}

export async function processHarshEventsFromVehiclePayload(
  client: DbClient,
  input: {
    operating_company_id: string;
    unit_id: string;
    event_at: string;
    samsara_event_id: string | null;
    payload: Record<string, unknown>;
  }
) {
  const parsed = parseHarshEntries(input.payload);
  if (parsed.length === 0 && input.samsara_event_id) {
    const fallbackKind = mapEventKind(String(input.payload.event_kind ?? input.payload.type ?? input.payload.event_type ?? ""));
    if (fallbackKind) {
      parsed.push({
        raw_samsara_id: input.samsara_event_id,
        event_kind: fallbackKind,
        severity: toSeverity(String(input.payload.severity ?? "minor")),
        speed_at_event_mph: Number.isFinite(Number(input.payload.speed_mph ?? NaN)) ? Number(input.payload.speed_mph) : null,
        g_force: Number.isFinite(Number(input.payload.g_force ?? NaN)) ? Number(input.payload.g_force) : null,
        latitude: Number.isFinite(Number(input.payload.latitude ?? input.payload.lat ?? NaN)) ? Number(input.payload.latitude ?? input.payload.lat) : null,
        longitude: Number.isFinite(Number(input.payload.longitude ?? input.payload.lng ?? NaN)) ? Number(input.payload.longitude ?? input.payload.lng) : null,
      });
    }
  }

  if (parsed.length === 0) return 0;

  const driverId = await getDriverForVehicleAtTime(client as never, input.operating_company_id, input.unit_id, input.event_at);
  let inserted = 0;
  for (const event of parsed) {
    const result = await client.query(
      `
        INSERT INTO safety.harsh_events (
          operating_company_id, unit_id, driver_id, event_at, event_kind, severity, raw_samsara_id,
          speed_at_event_mph, g_force, latitude, longitude
        )
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (operating_company_id, raw_samsara_id) DO NOTHING
      `,
      [
        input.operating_company_id,
        input.unit_id,
        driverId,
        input.event_at,
        event.event_kind,
        event.severity,
        event.raw_samsara_id,
        event.speed_at_event_mph ?? null,
        event.g_force ?? null,
        event.latitude ?? null,
        event.longitude ?? null,
      ]
    );
    if ((result.rowCount ?? 0) > 0) inserted += 1;
  }
  return inserted;
}
