/**
 * ROUND 306 E-07 addition — push OUR fences that have no Samsara counterpart to Samsara as addresses
 * (POST /addresses, externalIds ih35Site = our fence id), so Samsara's own geofence alerts, routes and
 * documents can use the same places. Load-stop fences (label load-<id>-stop-<n>) are excluded: the E-25
 * outbox handler (samsara.create_geofence) already pushes those with their load/stop ids.
 *
 * - Writes to Samsara only with SAMSARA_FENCE_PUSH_ENABLED=true, and only for the kinds the caller names
 *   (e.g. border_crossing, customer_site) -- 934 fences are never pushed by accident.
 * - Shape: a circle at the fence's own centre with its own enter radius (falls back to radius_m).
 * - Never duplicates: GET /addresses/ih35Site:<fence> first; an existing address is LINKED, not re-created.
 * - Links back: geo.geofences.samsara_address_id = the Samsara address id; every push/link/failure is
 *   recorded in integrations.integration_sync_log (sync_kind 'fence_push').
 */
type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type FencePushApi = {
  findAddressByExternalId(key: string, value: string): Promise<{ id: string } | null>;
  createAddress(input: { name: string; formattedAddress: string; latitude: number; longitude: number; radiusMeters: number; geofenceId: string; externalIds: { ih35Site: string } }): Promise<{ id: string }>;
};

export const FENCE_PUSH_SYNC_KIND = "fence_push";
export function samsaraFencePushEnabled(): boolean {
  return process.env.SAMSARA_FENCE_PUSH_ENABLED === "true";
}

export type FencePushCandidate = { id: string; label: string; location_kind: string; lat: number; lng: number; radius_m: number };

export async function listFencePushCandidates(client: Db, operatingCompanyId: string): Promise<FencePushCandidate[]> {
  const r = await client.query(
    `SELECT id::text, label, location_kind, center_lat::float8 AS lat, center_lng::float8 AS lng,
            COALESCE(enter_radius_m, radius_m)::float8 AS radius_m
       FROM geo.geofences
      WHERE operating_company_id = $1::uuid AND is_active AND samsara_address_id IS NULL
        AND center_lat IS NOT NULL AND center_lng IS NOT NULL
        AND label !~ '^load-[0-9a-f-]{36}-stop-[0-9]+$'
      ORDER BY location_kind, label`,
    [operatingCompanyId]
  );
  return r.rows as unknown as FencePushCandidate[];
}

export async function planFencePush(client: Db, operatingCompanyId: string) {
  const c = await listFencePushCandidates(client, operatingCompanyId);
  const byKind: Record<string, number> = {};
  for (const f of c) byKind[f.location_kind] = (byKind[f.location_kind] ?? 0) + 1;
  return { push_enabled: samsaraFencePushEnabled(), candidates: c.length, by_kind: byKind };
}

export async function pushFencesToSamsara(client: Db, operatingCompanyId: string, kinds: string[], api: FencePushApi) {
  if (!samsaraFencePushEnabled()) throw new Error("samsara_fence_push_disabled (SAMSARA_FENCE_PUSH_ENABLED is not true)");
  if (kinds.length === 0) throw new Error("fence_push_requires_explicit_kinds");
  const candidates = (await listFencePushCandidates(client, operatingCompanyId)).filter((f) => kinds.includes(f.location_kind));
  const out = { considered: candidates.length, created: 0, linked_existing: 0, failed: 0, failures: [] as { fence_id: string; error: string }[] };
  for (const f of candidates) {
    try {
      const existing = await api.findAddressByExternalId("ih35Site", f.id);
      const address = existing ?? (await api.createAddress({
        name: f.label, formattedAddress: f.label, latitude: f.lat, longitude: f.lng,
        radiusMeters: f.radius_m, geofenceId: f.id, externalIds: { ih35Site: f.id },
      }));
      await client.query(
        `UPDATE geo.geofences SET samsara_address_id = $2, updated_at = now() WHERE id = $1::uuid AND samsara_address_id IS NULL`,
        [f.id, address.id]
      );
      if (existing) out.linked_existing += 1; else out.created += 1;
      await logPush(client, operatingCompanyId, { fence_id: f.id, outcome: existing ? "linked_existing" : "created", samsara_address_id: address.id }, null);
    } catch (error) {
      const msg = String((error as Error)?.message ?? error);
      out.failed += 1;
      out.failures.push({ fence_id: f.id, error: msg });
      await logPush(client, operatingCompanyId, { fence_id: f.id, outcome: "failed" }, msg);
    }
  }
  return out;
}

async function logPush(client: Db, oc: string, payload: Record<string, unknown>, error: string | null) {
  await client.query(
    `INSERT INTO integrations.integration_sync_log
       (operating_company_id, integration, sync_kind, started_at, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
     VALUES ($1::uuid, 'samsara', $2, now(), now(), $3, $4, 0, 0, $5, $6::jsonb)`,
    [oc, FENCE_PUSH_SYNC_KIND, !error, payload.outcome === "created" ? 1 : 0, error, JSON.stringify(payload)]
  );
}
