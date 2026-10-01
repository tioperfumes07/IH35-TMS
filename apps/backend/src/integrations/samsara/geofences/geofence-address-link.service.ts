/**
 * ROUND 304 T-46 — link OUR existing geo.geofences to Samsara's address list (the 09-05 plan's
 * X.9, never run). Owner: "I told you we already have many geofences there."
 *
 * This is NOT address-import.service.ts's job (that one creates NEW fences/locations from Samsara
 * addresses, gated on a flap proof). This one never creates a fence: it mirrors Samsara's addresses
 * into integrations.samsara_addresses and sets geo.geofences.samsara_address_id ONLY when two
 * independent signals agree.
 *
 *   SIGNAL 1 proximity : fence center within LINK_RADIUS_M of the Samsara address point.
 *   SIGNAL 2 identity  : normalized name or street address agree (see namesAgree()).
 *   MATCH    = both signals, and the pairing is unique in both directions.
 *   PROPOSAL = exactly one signal (or both but not unique) -- a human accepts it, never auto-linked.
 *   NONE     = neither signal, reported both ways (our fence with no Samsara counterpart, and the
 *              Samsara address with no fence of ours).
 */
import { withLuciaBypass } from "../../../auth/db.js";
import { resolveSamsaraApiToken } from "../samsara-token.js";
import { SamsaraClient, type SamsaraAddress } from "../samsara-client.js";
import { getSamsaraConfigForCompany } from "../samsara.service.js";
import { projectSamsaraAddress } from "./address-import.service.js";

export const LINK_RADIUS_M = 300;

export type LinkFence = { id: string; label: string; center_lat: number | null; center_lng: number | null; samsara_address_id: string | null };
export type LinkAddress = { samsara_address_id: string; name: string; formatted_address: string | null; lat: number | null; lng: number | null };

export type LinkPair = { fence_id: string; samsara_address_id: string; distance_m: number | null; signals: Array<"proximity" | "identity"> };
export type LinkPlan = {
  matched: LinkPair[];
  proposed: LinkPair[];
  fences_without_counterpart: string[];
  addresses_without_counterpart: string[];
  already_linked: number;
};


export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (v: number) => (v * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** "<number> <first street word>" e.g. "514 nafta" -- the strongest identity a street address carries. */
function streetKey(s: string | null | undefined): string | null {
  const m = (s ?? "").toLowerCase().match(/\b(\d{2,6})\s+([a-z]{3,})/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export function namesAgree(fenceLabel: string, address: LinkAddress): boolean {
  const f = norm(fenceLabel);
  const n = norm(address.name);
  if (f.length >= 6 && n.length >= 6 && (f.includes(n) || n.includes(f))) return true;
  const fk = streetKey(fenceLabel);
  if (fk && (fk === streetKey(address.formatted_address) || fk === streetKey(address.name))) return true;
  // Shared words are NOT identity: city/state names appear in both naming conventions and made
  // 538 false "identity" hits on the first live dry-run. Containment or a street number only.
  return false;
}

/** Pure: no DB, no network. Deterministic given its inputs, so the proposal list can always be recomputed. */
export function planFenceAddressLinks(fences: LinkFence[], addresses: LinkAddress[]): LinkPlan {
  const candidates: LinkPair[] = [];
  let alreadyLinked = 0;
  for (const fence of fences) {
    if (fence.samsara_address_id) {
      alreadyLinked += 1;
      continue;
    }
    for (const a of addresses) {
      const distance =
        fence.center_lat != null && fence.center_lng != null && a.lat != null && a.lng != null
          ? haversineMeters(Number(fence.center_lat), Number(fence.center_lng), a.lat, a.lng)
          : null;
      const signals: LinkPair["signals"] = [];
      if (distance != null && distance <= LINK_RADIUS_M) signals.push("proximity");
      if (namesAgree(fence.label, a)) signals.push("identity");
      if (signals.length) candidates.push({ fence_id: fence.id, samsara_address_id: a.samsara_address_id, distance_m: distance == null ? null : Math.round(distance), signals });
    }
  }
  const strong = candidates.filter((c) => c.signals.length === 2);
  const strongPerFence = new Map<string, number>();
  const strongPerAddress = new Map<string, number>();
  for (const c of strong) {
    strongPerFence.set(c.fence_id, (strongPerFence.get(c.fence_id) ?? 0) + 1);
    strongPerAddress.set(c.samsara_address_id, (strongPerAddress.get(c.samsara_address_id) ?? 0) + 1);
  }
  const matched = strong.filter((c) => strongPerFence.get(c.fence_id) === 1 && strongPerAddress.get(c.samsara_address_id) === 1);
  const matchedFences = new Set(matched.map((m) => m.fence_id));
  const matchedAddresses = new Set(matched.map((m) => m.samsara_address_id));
  const proposed = candidates.filter((c) => !matchedFences.has(c.fence_id) && !matchedAddresses.has(c.samsara_address_id));
  const touchedFences = new Set(candidates.map((c) => c.fence_id));
  const touchedAddresses = new Set(candidates.map((c) => c.samsara_address_id));
  return {
    matched,
    proposed,
    fences_without_counterpart: fences.filter((f) => !f.samsara_address_id && !touchedFences.has(f.id)).map((f) => f.id),
    addresses_without_counterpart: addresses.filter((a) => !touchedAddresses.has(a.samsara_address_id)).map((a) => a.samsara_address_id),
    already_linked: alreadyLinked,
  };
}

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export function toLinkAddresses(addresses: SamsaraAddress[]): LinkAddress[] {
  return addresses.map((a) => {
    const p = projectSamsaraAddress(a);
    return { samsara_address_id: p.samsaraAddressId, name: p.name, formatted_address: p.formattedAddress, lat: p.latitude, lng: p.longitude };
  });
}

async function loadFences(client: Db, operatingCompanyId: string): Promise<LinkFence[]> {
  const res = await client.query<LinkFence>(
    `SELECT id::text, label, center_lat::float8 AS center_lat, center_lng::float8 AS center_lng, samsara_address_id
       FROM geo.geofences
      WHERE operating_company_id = $1::uuid AND is_active = true
        AND COALESCE(external_source, '') <> 'samsara'`,
    [operatingCompanyId]
  );
  return res.rows;
}

export type LinkRunResult = {
  mode: "dry-run" | "apply";
  addresses_read: number;
  fences_considered: number;
  matched: number;
  proposed: number;
  fences_without_counterpart: number;
  addresses_without_counterpart: number;
  already_linked: number;
  writes: number;
  plan: LinkPlan;
};

/**
 * dry-run (default): reads only. apply: upserts the Samsara address mirror and sets
 * samsara_address_id on MATCHED fences only -- production data, so it requires an explicit AUTH id
 * and is audited. Proposals are never written; a human accepts them through acceptProposal().
 */
export async function runGeofenceAddressLink(options: {
  operatingCompanyId: string;
  apply?: { authId: string; actorUserId: string | null };
  addresses?: SamsaraAddress[];
}): Promise<LinkRunResult> {
  if (options.apply && !/^AUTH-\d+$/.test(options.apply.authId)) throw new Error("geofence_address_link_apply_requires_AUTH_id");
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`, [options.operatingCompanyId]);
    let raw = options.addresses;
    if (!raw) {
      const config = await getSamsaraConfigForCompany(client, options.operatingCompanyId);
      if (!config) throw new Error("samsara_not_configured");
      raw = await new SamsaraClient({
        apiToken: resolveSamsaraApiToken(config as Record<string, unknown>),
        samsaraOrgId: config?.samsara_org_id ? String(config.samsara_org_id) : null,
      }).listAddresses();
    }
    const addresses = toLinkAddresses(raw);
    const fences = await loadFences(client as Db, options.operatingCompanyId);
    const plan = planFenceAddressLinks(fences, addresses);
    const result: LinkRunResult = {
      mode: options.apply ? "apply" : "dry-run",
      addresses_read: addresses.length,
      fences_considered: fences.length,
      matched: plan.matched.length,
      proposed: plan.proposed.length,
      fences_without_counterpart: plan.fences_without_counterpart.length,
      addresses_without_counterpart: plan.addresses_without_counterpart.length,
      already_linked: plan.already_linked,
      writes: 0,
      plan,
    };
    if (!options.apply) return result;

    result.writes += await mirrorSamsaraAddresses(client as Db, options.operatingCompanyId, raw);
    for (const m of plan.matched) {
      const upd = await client.query(
        `UPDATE geo.geofences SET samsara_address_id = $3, updated_at = now(), updated_by_user_uuid = $4::uuid
          WHERE id = $2::uuid AND operating_company_id = $1::uuid AND samsara_address_id IS NULL
          RETURNING id`,
        [options.operatingCompanyId, m.fence_id, m.samsara_address_id, options.apply.actorUserId]
      );
      result.writes += upd.rows.length;
    }
    await client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, $3::uuid, $4)`, [
      "geo.samsara_address_link_applied",
      JSON.stringify({ operating_company_id: options.operatingCompanyId, auth_id: options.apply.authId, matched: plan.matched.length, proposed: plan.proposed.length, writes: result.writes }),
      options.apply.actorUserId,
      "R304-T46-GEOFENCE-ADDRESS-LINK",
    ]);
    return result;
  });
}

/** Upsert Samsara's address list into integrations.samsara_addresses (the mirror). Returns rows written. */
export async function mirrorSamsaraAddresses(client: Db, operatingCompanyId: string, raw: SamsaraAddress[]): Promise<number> {
  let writes = 0;
  for (const a of raw) {
    const p = projectSamsaraAddress(a);
    await client.query(
      `INSERT INTO integrations.samsara_addresses (
         operating_company_id, samsara_address_id, name, formatted_address, lat, lng,
         geofence_json, tags, notes, raw_json, synced_at, updated_at
       ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,now(),now())
       ON CONFLICT (operating_company_id, samsara_address_id) DO UPDATE SET
         name=EXCLUDED.name, formatted_address=EXCLUDED.formatted_address, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         geofence_json=EXCLUDED.geofence_json, tags=EXCLUDED.tags, notes=EXCLUDED.notes,
         raw_json=EXCLUDED.raw_json, synced_at=now(), updated_at=now()`,
      [operatingCompanyId, p.samsaraAddressId, p.name, p.formattedAddress, p.latitude, p.longitude,
        JSON.stringify(p.geofenceJson), JSON.stringify(p.tags), p.notes, JSON.stringify(p.raw)]
    );
    writes += 1;
  }
  return writes;
}

/**
 * A human accepts a PROPOSAL. Re-verifies at least one signal live (never links a pair with no
 * evidence at all), requires the address to be in the mirror, never overwrites an existing link.
 */
export async function acceptProposal(
  client: Db,
  input: { operatingCompanyId: string; fenceId: string; samsaraAddressId: string; actorUserId: string }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fence = (await client.query<LinkFence>(
    `SELECT id::text, label, center_lat::float8 AS center_lat, center_lng::float8 AS center_lng, samsara_address_id
       FROM geo.geofences WHERE id = $2::uuid AND operating_company_id = $1::uuid`,
    [input.operatingCompanyId, input.fenceId]
  )).rows[0];
  if (!fence) return { ok: false, reason: "fence_not_found" };
  if (fence.samsara_address_id) return { ok: false, reason: "fence_already_linked" };
  const addr = (await client.query<LinkAddress>(
    `SELECT samsara_address_id, name, formatted_address, lat, lng
       FROM integrations.samsara_addresses
      WHERE operating_company_id = $1::uuid AND samsara_address_id = $2 AND deactivated_at IS NULL`,
    [input.operatingCompanyId, input.samsaraAddressId]
  )).rows[0];
  if (!addr) return { ok: false, reason: "samsara_address_not_mirrored" };
  const plan = planFenceAddressLinks([fence], [addr]);
  if (plan.matched.length + plan.proposed.length === 0) return { ok: false, reason: "no_signal_supports_this_pair" };
  await client.query(
    `UPDATE geo.geofences SET samsara_address_id = $3, updated_at = now(), updated_by_user_uuid = $4::uuid
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND samsara_address_id IS NULL`,
    [input.operatingCompanyId, input.fenceId, input.samsaraAddressId, input.actorUserId]
  );
  await client.query(`SELECT audit.append_event($1, 'info', $2::jsonb, $3::uuid, $4)`, [
    "geo.samsara_address_link_accepted",
    JSON.stringify({ operating_company_id: input.operatingCompanyId, fence_id: input.fenceId, samsara_address_id: input.samsaraAddressId }),
    input.actorUserId,
    "R304-T46-GEOFENCE-ADDRESS-LINK",
  ]);
  return { ok: true };
}
