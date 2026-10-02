/**
 * ROUND 313 E-30 — messaging BOTH ways. Outbound (office -> driver) is driver-message-delivery.service.ts. This is
 * the inbound half: a driver's reply in the Samsara app becomes a chat.messages row (sender = that driver) on the
 * ONE chat system -- no second message store:
 *   - driver: Samsara driver id -> mdata.drivers through the canonical map (driver_samsara_accounts);
 *   - thread: the LOAD the driver's truck carried at the reply time (vehicle_driver_assignments -> unit ->
 *     shared loadAtTimeSql; else the load dispatch assigned the driver to, if its truck was on it then), else the
 *     driver's direct thread (kind 'driver_direct', created once);
 *   - idempotent: client_key 'samsara-msg:<samsara driver id>:<sentAtMs>' (postMessage dedups on it).
 * Office messages sent from the Samsara dashboard (sender.type 'dispatch') are counted, not copied: they have no
 * TMS office author to attribute them to.
 */
import { createHash } from "node:crypto";
import { getOrCreateLoadThread, postMessage } from "../../../chat/chat.service.js";
import { loadAtTimeSql } from "../../../maintenance/driver-attribution.js";
import { loadDriverIdBySamsaraId } from "../driver-samsara-map.js";

type Db = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };
export type InboundMessageApi = {
  listDriverMessages(endMs: number, durationMs: number): Promise<Array<{ samsaraDriverId: string; text: string; sentAtMs: number; senderType: string; senderName: string | null }>>;
};

async function loadForDriverAt(client: Db, oc: string, driverId: string, atIso: string): Promise<string | null> {
  const r = await client.query<{ load_id: string | null }>(
    `SELECT load_at_time.load_id::text AS load_id
       FROM (SELECT a.unit_id FROM telematics.vehicle_driver_assignments a
              WHERE a.operating_company_id = $1::uuid AND a.driver_id = $2::uuid
                AND a.started_at <= $3::timestamptz AND (a.ended_at IS NULL OR a.ended_at > $3::timestamptz)
              ORDER BY a.started_at DESC LIMIT 1) u
       ${loadAtTimeSql("u.unit_id", "$3::timestamptz")}`,
    [oc, driverId, atIso]
  );
  if (r.rows[0]?.load_id) return r.rows[0].load_id;
  // No Samsara assignment window for this driver (common: drivers log in late or not at all): fall back to the
  // load the DISPATCHER assigned this driver to whose truck was on that very load at the reply time.
  const f = await client.query<{ load_id: string }>(
    `SELECT l.id::text AS load_id
       FROM mdata.loads l
       ${loadAtTimeSql("l.assigned_unit_id", "$3::timestamptz")}
      WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
        AND (l.assigned_primary_driver_id = $2::uuid OR l.assigned_secondary_driver_id = $2::uuid)
        AND load_at_time.load_id = l.id
      LIMIT 1`,
    [oc, driverId, atIso]
  );
  return f.rows[0]?.load_id ?? null;
}

export async function getOrCreateDriverDirectThread(client: Db, oc: string, driverId: string): Promise<string> {
  // ROUND 329: chat.threads has no unique key for a driver's direct thread, so the find-or-create is serialized by a
  // transaction advisory lock per (company, driver) — an overlapping tick waits, then finds the thread this one made.
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`chat.driver_direct:${oc}:${driverId}`]);
  const existing = await client.query<{ id: string }>(
    `SELECT t.id::text FROM chat.threads t JOIN chat.participants p ON p.thread_id = t.id
      WHERE t.operating_company_id = $1::uuid AND t.kind = 'driver_direct' AND p.party_type = 'driver' AND p.driver_id = $2::uuid
      ORDER BY t.created_at LIMIT 1`,
    [oc, driverId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const t = await client.query<{ id: string }>(
    `INSERT INTO chat.threads (operating_company_id, kind, subject) VALUES ($1::uuid, 'driver_direct', 'Driver messages (Samsara)') RETURNING id::text`,
    [oc]
  );
  await client.query(
    `INSERT INTO chat.participants (thread_id, operating_company_id, party_type, driver_id, role) VALUES ($1::uuid, $2::uuid, 'driver', $3::uuid, 'driver')
     ON CONFLICT (thread_id, party_type, office_user_id, driver_id) DO NOTHING`,
    [t.rows[0].id, oc, driverId]
  );
  return t.rows[0].id;
}

export async function ingestDriverReplies(client: Db, oc: string, api: InboundMessageApi, windowHours = 48, now = Date.now()) {
  const msgs = await api.listDriverMessages(now, windowHours * 3_600_000);
  const driverBySamsara = await loadDriverIdBySamsaraId(client as never, oc);
  const out = { fetched: msgs.length, from_dispatch_skipped: 0, unmapped_driver: 0, inserted: 0, deduped: 0, to_load_thread: 0, to_direct_thread: 0 };
  for (const m of msgs) {
    if (m.senderType !== "driver") { out.from_dispatch_skipped += 1; continue; }
    const driverId = driverBySamsara.get(m.samsaraDriverId);
    if (!driverId) { out.unmapped_driver += 1; continue; }
    const atIso = new Date(m.sentAtMs).toISOString();
    const loadId = await loadForDriverAt(client, oc, driverId, atIso);
    const threadId = loadId
      ? (await getOrCreateLoadThread(client as never, { operating_company_id: oc, load_id: loadId, actor_user_id: null })).id
      : await getOrCreateDriverDirectThread(client, oc, driverId);
    const r = await postMessage(
      client as never,
      {
        thread_id: threadId,
        sender: { party_type: "driver", driver_id: driverId } as never,
        msg_type: "text",
        body: m.text,
        client_key: `samsara-msg:${m.samsaraDriverId}:${m.sentAtMs}`,
        content_sha256: createHash("sha256").update(m.text).digest("hex"),
      },
      loadId ? { subject_type: "load", subject_id: loadId } : { subject_type: "driver", subject_id: driverId }
    );
    if (r.deduped) out.deduped += 1;
    else { out.inserted += 1; if (loadId) out.to_load_thread += 1; else out.to_direct_thread += 1; }
  }
  return out;
}
