// LEAD 443.232 (P0 catch-up) — replay a GPS window the positions tick lost, ON THE SERVER (the Samsara token is decrypted
// only there), through the live path: catchUpSamsaraGpsWindow (store each fix, fence detector per fix in its own savepoint).
// Idempotent: a fix already stored (same raw id) is skipped, so a second delivery writes nothing new.
import { catchUpSamsaraGpsWindow } from "../../integrations/samsara/samsara-positions.service.js";
import { enqueueOutboxEvent } from "../enqueue-outbox-event.js";

/** LEAD 443.234 — one delivery replays at most this many minutes (the outbox lease is 5 min; the full window timed out). */
export const GPS_CATCHUP_CHUNK_MINUTES = 30;
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./outbox-handler.types.js";

export const TELEMATICS_GPS_CATCHUP_EVENT = "telematics.gps_catchup" as const;

export class TelematicsGpsCatchupHandler implements OutboxEventHandler {
  eventType = TELEMATICS_GPS_CATCHUP_EVENT;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = String(payload.operating_company_id ?? "");
    const startIso = String(payload.start_iso ?? "");
    const endIso = String(payload.end_iso ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(operatingCompanyId)) throw new Error("operating_company_id_invalid_uuid");
    if (Number.isNaN(Date.parse(startIso)) || Number.isNaN(Date.parse(endIso)) || Date.parse(endIso) <= Date.parse(startIso))
      throw new Error("gps_catchup_window_invalid");
    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    // LEAD 443.234 — the units whose stops need the evidence: those on live (dispatched … delivered_pending_docs) loads.
    const unitIds = Array.isArray(payload.unit_ids) && payload.unit_ids.length
      ? (payload.unit_ids as unknown[]).map(String)
      : (await ctx.client.query<{ u: string }>(
          `SELECT DISTINCT assigned_unit_id::text AS u FROM mdata.loads
            WHERE operating_company_id = $1::uuid AND assigned_unit_id IS NOT NULL AND voided_at IS NULL AND soft_deleted_at IS NULL
              AND status::text IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery', 'delivered_pending_docs')`,
          [operatingCompanyId]
        )).rows.map((r) => r.u);
    const chunkEnd = new Date(Math.min(Date.parse(endIso), Date.parse(startIso) + GPS_CATCHUP_CHUNK_MINUTES * 60_000)).toISOString();
    const r = await catchUpSamsaraGpsWindow(ctx.client as never, operatingCompanyId, startIso, chunkEnd, unitIds);
    if (Date.parse(chunkEnd) < Date.parse(endIso)) {
      await enqueueOutboxEvent(ctx.client as never, TELEMATICS_GPS_CATCHUP_EVENT, { aggregate_type: "integrations.samsara", aggregate_id: operatingCompanyId },
        { operating_company_id: operatingCompanyId, start_iso: chunkEnd, end_iso: endIso, unit_ids: unitIds },
        `${TELEMATICS_GPS_CATCHUP_EVENT}:chunk:${operatingCompanyId}:${chunkEnd}:${endIso}`);
    }
    return { message: `window:${startIso}..${chunkEnd}:units:${unitIds.length}:fetched:${r.fetched}:inserted:${r.inserted}:arrivals:${r.arrivals_triggered}:no_unit:${r.skipped_no_unit}:errors:${r.errors.length}${r.errors.length ? `:${r.errors.slice(0, 3).join("|")}` : ""}` };
  }
}
