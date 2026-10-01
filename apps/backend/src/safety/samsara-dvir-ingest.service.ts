/**
 * ROUND 304 T-51 — read Samsara DVIRs into safety.dvir_submissions (the table the driver app writes
 * and the WF-050 dispatch gate reads).
 *
 * Mapping (every field measured live; nothing guessed):
 *   type            preTrip -> pre_trip, postTrip -> post_trip; any other type is skipped.
 *   unit_id         vehicle.id via loadUnitIdBySamsaraVehicleId (mirror-first); unmapped -> skipped.
 *   driver_id       the SIGNER (authorSignature.signatoryUser.id) via the canonical map
 *                   mdata.driver_samsara_accounts (merges followed);
 *                   unmapped/ambiguous -> skipped (never the
 *                   assignment-table driver: the signer is who actually inspected).
 *   odometer        round(odometerMeters / 1609.344) miles; absent -> skipped.
 *   submitted_at    signedAtTime, else endTime; neither -> skipped.
 *   has_major_defect  safetyStatus = 'unsafe' (Samsara: the driver declared the vehicle unsafe to operate).
 *   has_any_defect  unsafe, or any vehicle/trailer defect present.
 *   items           [{ source:'samsara', status, samsara_defect }] — Samsara defect objects passed through
 *                   untouched (none observed live yet; never re-shaped into invented fields).
 *   client_request_id  'samsara-dvir:<id>' — idempotent; a re-read DVIR UPDATES its safety flags
 *                   (a later 'resolved' status clears the WF-050 block), never inserts a duplicate.
 *   load_id / trailer_id  left NULL: no Samsara field names the load, and trailers carry no Samsara id here.
 */
import type { SamsaraDvir } from "../integrations/samsara/samsara-client.js";
import { loadUnitIdBySamsaraVehicleId } from "../integrations/samsara/samsara-positions.service.js";
import { loadDriverIdBySamsaraId } from "../integrations/samsara/driver-samsara-map.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";

export const METERS_PER_MILE = 1609.344;
export const SAMSARA_DVIR_CLIENT_REQUEST_PREFIX = "samsara-dvir:";

export type DvirSkipReason =
  | "type_not_pre_or_post"
  | "vehicle_not_mapped"
  | "signer_not_mapped"
  | "signer_ambiguous"
  | "no_odometer"
  | "no_location"
  | "no_timestamp";

export type DvirRow = {
  client_request_id: string;
  unit_id: string;
  driver_id: string;
  type: "pre_trip" | "post_trip";
  odometer: number;
  location: string;
  items: { source: "samsara"; status: "major" | "minor"; samsara_defect: unknown }[];
  certified: boolean;
  submitted_at: string;
  has_major_defect: boolean;
  has_any_defect: boolean;
};

/** Pure. */
export function mapSamsaraDvir(
  d: SamsaraDvir,
  unitByVehicle: Map<string, string>,
  driversBySamsaraId: Map<string, Set<string>>
): { row: DvirRow } | { skip: DvirSkipReason } {
  const type = d.type === "preTrip" ? "pre_trip" : d.type === "postTrip" ? "post_trip" : null;
  if (!type) return { skip: "type_not_pre_or_post" };
  const unitId = d.samsara_vehicle_id ? unitByVehicle.get(d.samsara_vehicle_id) : undefined;
  if (!unitId) return { skip: "vehicle_not_mapped" };
  const drivers = d.signer_user_id ? driversBySamsaraId.get(d.signer_user_id) : undefined;
  if (!drivers || drivers.size === 0) return { skip: "signer_not_mapped" };
  if (drivers.size > 1) return { skip: "signer_ambiguous" };
  if (d.odometer_meters == null) return { skip: "no_odometer" };
  if (!d.location) return { skip: "no_location" };
  const at = d.signed_at ?? d.end_time;
  if (!at) return { skip: "no_timestamp" };
  const unsafe = d.safety_status === "unsafe";
  const defects = [...d.vehicle_defects, ...d.trailer_defects];
  return {
    row: {
      client_request_id: `${SAMSARA_DVIR_CLIENT_REQUEST_PREFIX}${d.id}`,
      unit_id: unitId,
      driver_id: [...drivers][0]!,
      type,
      odometer: Math.round(d.odometer_meters / METERS_PER_MILE),
      location: d.location,
      items: defects.map((x) => ({ source: "samsara" as const, status: unsafe ? ("major" as const) : ("minor" as const), samsara_defect: x })),
      certified: d.signed_at != null,
      submitted_at: at,
      has_major_defect: unsafe,
      has_any_defect: unsafe || defects.length > 0,
    },
  };
}

/**
 * Samsara driver id -> local driver ids, from the CANONICAL map mdata.driver_samsara_accounts (merged
 * drivers resolve to the survivor) via the shared resolver -- never the legacy mdata.drivers column.
 */
export async function loadDriversBySamsaraId(client: PgClient, operatingCompanyId: string): Promise<Map<string, Set<string>>> {
  const byId = await loadDriverIdBySamsaraId(client as never, operatingCompanyId);
  return new Map([...byId].map(([sid, driverId]) => [sid, new Set([driverId])]));
}

export type DvirIngestResult = {
  operating_company_id: string;
  mode: "dry_run" | "apply";
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  would_write: number;
  unsafe: number;
  skipped_by_reason: Record<string, number>;
};

export async function ingestSamsaraDvirs(
  client: PgClient,
  operatingCompanyId: string,
  dvirs: SamsaraDvir[],
  opts: { apply: boolean }
): Promise<DvirIngestResult> {
  const unitByVehicle = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);
  const drivers = await loadDriversBySamsaraId(client, operatingCompanyId);
  const result: DvirIngestResult = {
    operating_company_id: operatingCompanyId,
    mode: opts.apply ? "apply" : "dry_run",
    fetched: dvirs.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    would_write: 0,
    unsafe: 0,
    skipped_by_reason: {},
  };
  for (const d of dvirs) {
    const mapped = mapSamsaraDvir(d, unitByVehicle, drivers);
    if ("skip" in mapped) {
      result.skipped_by_reason[mapped.skip] = (result.skipped_by_reason[mapped.skip] ?? 0) + 1;
      continue;
    }
    const r = mapped.row;
    result.would_write += 1;
    if (r.has_major_defect) result.unsafe += 1;
    if (!opts.apply) continue;
    const res = await client.query(
      `INSERT INTO safety.dvir_submissions
         (operating_company_id, driver_id, unit_id, type, odometer, location, items, certified, submitted_at,
          has_major_defect, has_any_defect, client_request_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8, $9::timestamptz, $10, $11, $12)
       ON CONFLICT (operating_company_id, client_request_id) WHERE client_request_id IS NOT NULL
       DO UPDATE SET has_major_defect = EXCLUDED.has_major_defect,
                     has_any_defect = EXCLUDED.has_any_defect,
                     items = EXCLUDED.items
         WHERE safety.dvir_submissions.has_major_defect IS DISTINCT FROM EXCLUDED.has_major_defect
            OR safety.dvir_submissions.has_any_defect IS DISTINCT FROM EXCLUDED.has_any_defect
            OR safety.dvir_submissions.items IS DISTINCT FROM EXCLUDED.items
       RETURNING (xmax = 0) AS inserted, true AS changed`,
      [operatingCompanyId, r.driver_id, r.unit_id, r.type, r.odometer, r.location, JSON.stringify(r.items), r.certified, r.submitted_at, r.has_major_defect, r.has_any_defect, r.client_request_id]
    );
    const row = res.rows[0] as { inserted: boolean } | undefined;
    if (!row) result.unchanged += 1;
    else if (row.inserted) result.inserted += 1;
    else result.updated += 1;
  }
  return result;
}
