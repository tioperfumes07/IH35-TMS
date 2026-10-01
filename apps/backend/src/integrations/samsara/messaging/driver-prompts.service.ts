/**
 * ROUND 306 E-30 addition — templated driver prompts, triggered by the canonical fence events.
 *
 *  arrival   : a unit ENTERS its load's own stop fence (label load-<id>-stop-<n>)  -> "Arrival recorded ..."
 *              (confirmation_request; the driver confirms in the IH35 driver app's existing arrival prompt)
 *  fuel_stop : a unit STOPS (>= STOP_MIN_DWELL_MINUTES, E-03) inside a fuel_stop fence while it has exactly one
 *              on-road load -> "Fuel stop recorded ..." (a drive-by through the fence prompts nothing)
 * Each prompt is a SYSTEM message in that load's chat thread (the one message store; the thread is created
 * with the load's primary driver when missing), idempotent per fence event (client_key prompt:<kind>:<event>),
 * then delivered to the driver's Samsara app by the shared delivery (its own flag). Times shown in
 * America/Chicago. Off unless DRIVER_PROMPTS_ENABLED=true -- it messages real drivers.
 */
import { createHash } from "node:crypto";
import { getOrCreateLoadThread, postMessage } from "../../../chat/chat.service.js";
import { STOP_MIN_DWELL_MINUTES } from "../../../telematics/stop-odometer-capture.service.js";

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export function driverPromptsEnabled(): boolean {
  return process.env.DRIVER_PROMPTS_ENABLED === "true";
}

const CT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const DRIVER_PROMPT_TEMPLATES = {
  arrival: (place: string, loadNumber: string, at: Date) =>
    `Arrival recorded at ${place} for load ${loadNumber} (${CT.format(at)} CT). Please confirm the arrival in the IH35 driver app.`,
  fuel_stop: (place: string, loadNumber: string, at: Date) =>
    `Fuel stop recorded at ${place} (load ${loadNumber}, ${CT.format(at)} CT). Please upload the fuel receipt in the IH35 driver app.`,
} as const;

export type PromptKind = keyof typeof DRIVER_PROMPT_TEMPLATES;

export async function postDriverPromptsForRecentFenceEvents(client: Db, operatingCompanyId: string, sinceIso: string) {
  if (!driverPromptsEnabled()) return { enabled: false, posted: [] as string[], skipped: 0 };
  const events = await client.query(
    `SELECT ge.id::text AS event_id, ge.unit_id::text, ge.occurred_at, g.label, g.location_kind,
            EXTRACT(EPOCH FROM (COALESCE((SELECT min(x.occurred_at) FROM geo.geofence_events x
                                            WHERE x.geofence_id = ge.geofence_id AND x.unit_id = ge.unit_id
                                              AND x.event_kind = 'exited' AND x.occurred_at > ge.occurred_at), now())
                                - ge.occurred_at)) / 60 AS dwell_minutes,
            substring(g.label FROM '^load-([0-9a-f-]{36})-stop-')::uuid::text AS stop_load_id,
            substring(g.label FROM '-stop-([0-9]+)$')::int AS stop_seq
       FROM geo.geofence_events ge
       JOIN geo.geofences g ON g.id = ge.geofence_id
      WHERE ge.operating_company_id = $1::uuid AND ge.event_kind = 'entered' AND ge.occurred_at >= $2::timestamptz
        AND (g.label ~ '^load-[0-9a-f-]{36}-stop-[0-9]+$' OR g.location_kind = 'fuel_stop')
      ORDER BY ge.occurred_at`,
    [operatingCompanyId, sinceIso]
  );
  const posted: string[] = [];
  let skipped = 0;
  for (const e of events.rows) {
    const kind: PromptKind = e.stop_load_id ? "arrival" : "fuel_stop";
    let loadId: string | null = null;
    let place = String(e.label);
    if (kind === "arrival") {
      const stop = (await client.query(
        `SELECT l.id::text, COALESCE(NULLIF(trim(concat_ws(', ', ls.address_line1, ls.city, ls.state)), ''), 'the stop') AS place
           FROM mdata.load_stops ls JOIN mdata.loads l ON l.id = ls.load_id
          WHERE l.id = $1::uuid AND ls.sequence_number = $2 AND l.assigned_unit_id = $3::uuid
            AND l.operating_company_id = $4::uuid AND l.soft_deleted_at IS NULL AND ls.soft_deleted_at IS NULL`,
        [e.stop_load_id, e.stop_seq, e.unit_id, operatingCompanyId]
      )).rows[0];
      if (!stop) { skipped += 1; continue; }
      loadId = String(stop.id);
      place = String(stop.place);
    } else {
      // A fuel stop is a STOP (E-03 threshold), not a drive-by through the fence.
      if (Number(e.dwell_minutes) < STOP_MIN_DWELL_MINUTES) { skipped += 1; continue; }
      const loads = (await client.query(
        `SELECT id::text FROM mdata.loads WHERE assigned_unit_id = $1::uuid AND operating_company_id = $2::uuid
            AND soft_deleted_at IS NULL AND status::text IN ('dispatched','at_pickup','in_transit','at_delivery') LIMIT 2`,
        [e.unit_id, operatingCompanyId]
      )).rows;
      if (loads.length !== 1) { skipped += 1; continue; }
      loadId = String(loads[0]!.id);
    }
    const loadNumber = String((await client.query(`SELECT load_number FROM mdata.loads WHERE id = $1::uuid`, [loadId])).rows[0]?.load_number ?? "");
    const body = DRIVER_PROMPT_TEMPLATES[kind](place, loadNumber, new Date(String(e.occurred_at)));
    const thread = await getOrCreateLoadThread(client as never, { operating_company_id: operatingCompanyId, load_id: loadId, actor_user_id: null });
    const r = await postMessage(
      client as never,
      {
        thread_id: thread.id,
        sender: { party_type: "system" },
        msg_type: kind === "arrival" ? "confirmation_request" : "text",
        body,
        client_key: `prompt:${kind}:${e.event_id}`,
        content_sha256: createHash("sha256").update(body).digest("hex"),
      },
      { subject_type: "load", subject_id: loadId }
    );
    if (r.deduped) { skipped += 1; continue; }
    posted.push(String(r.message.id));
  }
  return { enabled: true, posted, skipped };
}
