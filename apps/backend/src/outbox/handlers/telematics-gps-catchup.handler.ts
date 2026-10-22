// LEAD 443.232 (P0 catch-up) — replay a GPS window the positions tick lost, ON THE SERVER (the Samsara token is decrypted
// only there), through the live path: catchUpSamsaraGpsWindow (store each fix, fence detector per fix in its own savepoint).
// Idempotent: a fix already stored (same raw id) is skipped, so a second delivery writes nothing new.
import { catchUpSamsaraGpsWindow } from "../../integrations/samsara/samsara-positions.service.js";
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
    const r = await catchUpSamsaraGpsWindow(ctx.client as never, operatingCompanyId, startIso, endIso);
    return { message: `fetched:${r.fetched}:inserted:${r.inserted}:arrivals:${r.arrivals_triggered}:no_unit:${r.skipped_no_unit}:errors:${r.errors.length}${r.errors.length ? `:${r.errors.slice(0, 3).join("|")}` : ""}` };
  }
}
