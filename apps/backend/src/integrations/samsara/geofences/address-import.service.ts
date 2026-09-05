import { withLuciaBypass } from "../../../auth/db.js";
import { decryptSamsaraSecret } from "../../../lib/samsara-crypto.js";
import { SamsaraClient, type SamsaraAddress } from "../samsara-client.js";
import { getSamsaraConfigForCompany, type PgClient } from "../samsara.service.js";
import { normalizeSamsaraGeofenceToVertices, type LatLngVertex } from "./circle-to-polygon.js";

type AddressProjection = {
  samsaraAddressId: string;
  name: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  geofenceJson: unknown;
  tags: unknown[];
  notes: string | null;
  raw: Record<string, unknown>;
  vertices: LatLngVertex[] | null;
};

export type SamsaraAddressImportResult = {
  mode: "dry-run" | "apply";
  addresses_read: number;
  locations_would_project: number;
  geofences_would_project: number;
  unresolved_geofences: number;
  matched_existing_locations: number;
  ambiguous_matches: number;
  collisions: Array<{ samsara_address_id: string; candidate_location_ids: string[] }>;
  writes: number;
};

type LocationMatch = { id: string; location_type: string };

async function findLocationMatches(
  client: PgClient,
  operatingCompanyId: string,
  row: AddressProjection
): Promise<LocationMatch[]> {
  if (row.latitude == null || row.longitude == null) return [];
  const matches = await client.query(
    `SELECT id::text, location_type::text
       FROM mdata.locations
      WHERE operating_company_id=$1::uuid
        AND deactivated_at IS NULL
        AND regexp_replace(lower(location_name),'[^a-z0-9]+','','g') =
            regexp_replace(lower($2),'[^a-z0-9]+','','g')
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND 111320 * sqrt(
          power(latitude::double precision - $3::double precision, 2) +
          power((longitude::double precision - $4::double precision) * cos(radians($3::double precision)), 2)
        ) <= 805
      ORDER BY id`,
    [operatingCompanyId, row.name, row.latitude, row.longitude]
  );
  return matches.rows.map((match) => ({ id: String(match.id), location_type: String(match.location_type) }));
}

function geofenceKind(locationType: string | null): "customer_site" | "vendor_site" | "yard" | "custom" {
  if (locationType === "yard") return "yard";
  if (["mechanic_shop", "tire_shop", "wash_facility", "fuel_stop", "truck_stop"].includes(locationType ?? "")) {
    return "vendor_site";
  }
  if (["customer_warehouse", "customer_terminal", "shipper_facility", "consignee_facility", "distribution_center", "cross_dock"].includes(locationType ?? "")) {
    return "customer_site";
  }
  return "custom";
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function centerOf(vertices: LatLngVertex[] | null): { lat: number | null; lng: number | null } {
  if (!vertices?.length) return { lat: null, lng: null };
  return {
    lat: vertices.reduce((sum, point) => sum + point.lat, 0) / vertices.length,
    lng: vertices.reduce((sum, point) => sum + point.lng, 0) / vertices.length,
  };
}

/**
 * Samsara's address payload is intentionally labelled UNVERIFIED until the first org-owned raw
 * row is stored. Unknown fields remain in raw_json; unresolved geometry is never guessed.
 */
export function projectSamsaraAddress(address: SamsaraAddress): AddressProjection {
  const raw = address.raw;
  const geofenceJson = raw.geofence ?? null;
  const vertices = normalizeSamsaraGeofenceToVertices(geofenceJson);
  const geofence = object(geofenceJson);
  const circle = object(geofence?.circle);
  const center = centerOf(vertices);
  const latitude = finite(raw.latitude) ?? finite(circle?.latitude) ?? center.lat;
  const longitude = finite(raw.longitude) ?? finite(circle?.longitude) ?? center.lng;
  const radiusMeters = finite(circle?.radiusMeters);
  return {
    samsaraAddressId: address.id,
    name: text(raw.name) ?? `Samsara address ${address.id}`,
    formattedAddress: text(raw.formattedAddress) ?? text(raw.address),
    latitude,
    longitude,
    radiusMeters: radiusMeters && radiusMeters > 0 ? Math.round(radiusMeters) : null,
    geofenceJson,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    notes: text(raw.notes),
    raw,
    vertices,
  };
}

async function projectOne(
  client: PgClient,
  operatingCompanyId: string,
  row: AddressProjection,
  matches: LocationMatch[]
): Promise<number> {
  // Serializes the external identity so concurrent re-runs cannot leave an orphan duplicate location.
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${operatingCompanyId}:samsara-address:${row.samsaraAddressId}`,
  ]);
  await client.query(
    `INSERT INTO integrations.samsara_addresses (
       operating_company_id, samsara_address_id, name, formatted_address, lat, lng,
       geofence_json, tags, notes, raw_json, synced_at, updated_at
     ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,now(),now())
     ON CONFLICT (operating_company_id, samsara_address_id) DO UPDATE SET
       name=EXCLUDED.name, formatted_address=EXCLUDED.formatted_address,
       lat=EXCLUDED.lat, lng=EXCLUDED.lng, geofence_json=EXCLUDED.geofence_json,
       tags=EXCLUDED.tags, notes=EXCLUDED.notes, raw_json=EXCLUDED.raw_json,
       synced_at=now(), updated_at=now()`,
    [operatingCompanyId, row.samsaraAddressId, row.name, row.formattedAddress, row.latitude,
      row.longitude, JSON.stringify(row.geofenceJson), JSON.stringify(row.tags), row.notes, JSON.stringify(row.raw)]
  );

  const existing = await client.query(
    `SELECT location_ref_id::text AS location_id
       FROM geo.geofences
      WHERE operating_company_id=$1::uuid AND external_source='samsara' AND external_ref=$2
      LIMIT 1`,
    [operatingCompanyId, row.samsaraAddressId]
  );
  let locationId = existing.rows[0]?.location_id ? String(existing.rows[0].location_id) : matches.length === 1 ? matches[0].id : null;
  let locationType = matches.length === 1 ? matches[0].location_type : null;
  if (!locationId) {
    const inserted = await client.query(
      `INSERT INTO mdata.locations (
         operating_company_id, location_name, location_type, address_line1, country,
         latitude, longitude, geocoded_at, geocoding_source, notes
       ) VALUES ($1::uuid,$2,'other',$3,'US',$4,$5,
                 CASE WHEN $4::numeric IS NOT NULL AND $5::numeric IS NOT NULL THEN now() ELSE NULL END,
                 CASE WHEN $4::numeric IS NOT NULL AND $5::numeric IS NOT NULL THEN 'samsara_import' ELSE NULL END,
                 $6)
       RETURNING id::text`,
      [operatingCompanyId, row.name, row.formattedAddress, row.latitude, row.longitude,
        `Samsara address ${row.samsaraAddressId}`]
    );
    if (!inserted.rows[0]?.id) throw new Error("samsara_address_import_location_insert_returned_no_id");
    locationId = String(inserted.rows[0].id);
    locationType = "other";
  } else {
    await client.query(
      `UPDATE mdata.locations SET location_name=$3, address_line1=$4,
         latitude=$5, longitude=$6, geocoded_at=CASE WHEN $5::numeric IS NOT NULL AND $6::numeric IS NOT NULL THEN now() ELSE geocoded_at END,
         geocoding_source=CASE WHEN $5::numeric IS NOT NULL AND $6::numeric IS NOT NULL THEN 'samsara_import' ELSE geocoding_source END,
         updated_at=now()
       WHERE id=$2::uuid AND operating_company_id=$1::uuid`,
      [operatingCompanyId, locationId, row.name, row.formattedAddress, row.latitude, row.longitude]
    );
  }

  // No recognizable geometry means raw mirror + location only. Never draw a fence around a guess.
  if (!row.vertices) return 2;
  await client.query(
    `INSERT INTO geo.geofences (
       operating_company_id, label, location_kind, location_ref_id, vertices_json, is_active,
       source, samsara_address_id, external_source, external_ref, center_lat, center_lng, radius_m
     ) VALUES ($1::uuid,$2,$9,$3::uuid,$4::jsonb,true,
               'samsara_import',$5,'samsara',$5,$6,$7,$8)
     ON CONFLICT (operating_company_id, external_source, external_ref) WHERE external_ref IS NOT NULL
     DO UPDATE SET label=EXCLUDED.label, location_ref_id=EXCLUDED.location_ref_id,
       vertices_json=EXCLUDED.vertices_json, source='samsara_import',
       samsara_address_id=EXCLUDED.samsara_address_id, center_lat=EXCLUDED.center_lat,
       center_lng=EXCLUDED.center_lng, radius_m=EXCLUDED.radius_m, updated_at=now()`,
    [operatingCompanyId, row.name, locationId, JSON.stringify(row.vertices), row.samsaraAddressId,
      row.latitude, row.longitude, row.radiusMeters, geofenceKind(locationType)]
  );
  return 3;
}

export async function importSamsaraAddresses(options: {
  operatingCompanyId: string;
  apply?: boolean;
  addresses?: SamsaraAddress[];
}): Promise<SamsaraAddressImportResult> {
  const apply = options.apply === true;
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id',$1,true)`, [options.operatingCompanyId]);
    if (apply) {
      const gate = await client.query(`SELECT to_regclass('geo.geofence_vehicle_state')::text AS relation`);
      if (!gate.rows[0]?.relation) throw new Error("samsara_address_import_apply_blocked:geo.geofence_vehicle_state_missing");
      if (process.env.SAMSARA_GEOFENCE_IMPORT_APPLY_APPROVED !== "flap proof started") {
        throw new Error("samsara_address_import_apply_blocked:flap_proof_not_started");
      }
    }
    let addresses = options.addresses;
    if (!addresses) {
      const config = await getSamsaraConfigForCompany(client, options.operatingCompanyId);
      const encrypted = config?.encrypted_api_token ?? config?.api_token_encrypted;
      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw new Error("samsara_not_configured");
      const samsara = new SamsaraClient({
        apiToken: decryptSamsaraSecret(encrypted),
        samsaraOrgId: config?.samsara_org_id ? String(config.samsara_org_id) : null,
      });
      addresses = await samsara.listAddresses();
    }
    const projected = addresses.map(projectSamsaraAddress);
    const matchSets: LocationMatch[][] = [];
    for (const row of projected) matchSets.push(await findLocationMatches(client, options.operatingCompanyId, row));
    const collisions = projected.flatMap((row, index) => matchSets[index].length > 1 ? [{
      samsara_address_id: row.samsaraAddressId,
      candidate_location_ids: matchSets[index].map((match) => match.id),
    }] : []);
    const result: SamsaraAddressImportResult = {
      mode: apply ? "apply" : "dry-run",
      addresses_read: projected.length,
      locations_would_project: projected.length,
      geofences_would_project: projected.filter((row) => row.vertices !== null).length,
      unresolved_geofences: projected.filter((row) => row.vertices === null).length,
      matched_existing_locations: matchSets.filter((matches) => matches.length === 1).length,
      ambiguous_matches: collisions.length,
      collisions,
      writes: 0,
    };
    if (!apply) return result;
    for (let index = 0; index < projected.length; index += 1) {
      result.writes += await projectOne(client, options.operatingCompanyId, projected[index], matchSets[index]);
    }
    return result;
  });
}
