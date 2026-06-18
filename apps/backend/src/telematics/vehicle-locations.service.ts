import { createHash } from "node:crypto";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type VehicleLocationEventInput = {
  operating_company_id: string;
  unit_id: string;
  samsara_vehicle_id: string;
  captured_at: string;
  lat: number;
  lng: number;
  speed_mph: number | null;
  heading_deg: number | null;
  engine_state: "on" | "off" | "idle" | "unknown";
  raw_samsara_event_id: string | null;
  payload: Record<string, unknown>;
  city?: string | null;
  state?: string | null;
  formatted_location?: string | null;
};

export function deriveEngineState(engineOn: boolean | null, speedMph: number | null): "on" | "off" | "idle" | "unknown" {
  if (engineOn === false) return "off";
  if (engineOn === true) {
    if ((speedMph ?? 0) > 0.5) return "on";
    return "idle";
  }
  return "unknown";
}

export function deriveRawSamsaraEventId(args: {
  raw_samsara_event_id: string | null;
  operating_company_id: string;
  unit_id: string;
  captured_at: string;
  payload: Record<string, unknown>;
}): string {
  const direct = args.raw_samsara_event_id?.trim() ?? "";
  if (direct.length > 0) return direct;
  const hash = createHash("sha256")
    .update(JSON.stringify(args.payload))
    .digest("hex")
    .slice(0, 16);
  return `derived:${args.operating_company_id}:${args.unit_id}:${args.captured_at}:${hash}`;
}

export function normalizeHistoryLimit(limitRaw: number | null | undefined): number {
  if (!Number.isFinite(limitRaw ?? NaN)) return 500;
  const value = Math.floor(Number(limitRaw));
  if (value < 1) return 1;
  if (value > 5000) return 5000;
  return value;
}

export function pickLatestPositions<T extends { operating_company_id: string; unit_id: string; captured_at: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.operating_company_id}:${row.unit_id}`;
    const current = byKey.get(key);
    if (!current || new Date(row.captured_at).getTime() > new Date(current.captured_at).getTime()) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

export async function ingestVehicleLocationEvent(client: DbClient, input: VehicleLocationEventInput): Promise<boolean> {
  const rawEventId = deriveRawSamsaraEventId({
    raw_samsara_event_id: input.raw_samsara_event_id,
    operating_company_id: input.operating_company_id,
    unit_id: input.unit_id,
    captured_at: input.captured_at,
    payload: input.payload,
  });
  const result = await client.query(
    `
      INSERT INTO telematics.vehicle_locations (
        operating_company_id, unit_id, samsara_vehicle_id, captured_at, lat, lng, speed_mph, heading_deg, engine_state, raw_samsara_event_id, city, state, formatted_location
      )
      VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (operating_company_id, raw_samsara_event_id) DO NOTHING
    `,
    [
      input.operating_company_id,
      input.unit_id,
      input.samsara_vehicle_id,
      input.captured_at,
      input.lat,
      input.lng,
      input.speed_mph,
      input.heading_deg,
      input.engine_state,
      rawEventId,
      input.city ?? null,
      input.state ?? null,
      input.formatted_location ?? null,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}
