/**
 * TRUCK LINE — office/dispatcher-facing arrival + departure stamping.
 *
 * The only existing writer of mdata.load_stops actual_arrival_at/actual_departure_at is
 * driver-pwa/dispatch-view.routes.ts, which requires a driver session (requireDriverSession) —
 * it cannot be called from a dispatcher's browser session. Rather than re-type that write +
 * its revenue/settlement side effects (latchOnDeliveryEvidence, pingSettlementOnLoadEvent,
 * mintProformaInvoiceOnFirstPickup), both routes now call the SAME shared functions in
 * ../stop-stamp.service.ts — see that file's header. This file owns only the office-caller
 * authorization (company membership, not driver ownership) and the row lock/fetch.
 *
 * `actual_arrival_source`/`actual_departure_source` carry a CHECK constraint allowing only
 * 'driver_app' | 'eld_geofence' | 'manual' (verified live schema) — this seat cannot author a
 * migration to add a 4th value, so a Truck Line dispatcher stamp is tagged 'manual' (matching the
 * design's own "dispatcher phone" evidence option, one of the three the design's pop-up already
 * offers alongside driver app / geofence).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { stampStopArrival, stampStopDeparture, type LockedStopRow } from "../stop-stamp.service.js";

const paramsSchema = z.object({ loadId: z.string().uuid(), stopId: z.string().uuid() });
const bodySchema = z.object({ operating_company_id: z.string().uuid() });

async function lockStop(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  loadId: string,
  stopId: string,
  operatingCompanyId: string
): Promise<(LockedStopRow & { status: string }) | null> {
  const res = await client.query<LockedStopRow & { status: string }>(
    `
      SELECT s.id::text, s.stop_type::text, s.status::text, l.status::text AS load_status,
             l.operating_company_id::text AS operating_company_id
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      WHERE s.id = $1 AND s.load_id = $2 AND s.soft_deleted_at IS NULL
        AND l.operating_company_id = $3::uuid AND l.soft_deleted_at IS NULL
      LIMIT 1
      FOR UPDATE OF s, l
    `,
    [stopId, loadId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

function errorReply(reply: FastifyReply, result: { error: string; from?: string; to?: string }) {
  if (result.error === "invalid_load_state") return reply.code(409).send({ error: result.error, from: result.from, to: result.to });
  if (result.error === "invalid_stop_state") return reply.code(400).send({ error: result.error });
  return reply.code(409).send({ error: result.error });
}

export async function registerTruckLineStopStampRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/arrive",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = paramsSchema.safeParse(req.params ?? {});
      const body = bodySchema.safeParse(req.body ?? {});
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const stop = await lockStop(client, params.data.loadId, params.data.stopId, body.data.operating_company_id);
        if (!stop) return { ok: false as const, error: "not_found" };
        return stampStopArrival(client, stop, {
          loadId: params.data.loadId,
          actorUserId: user.uuid,
          source: "manual",
          auditEvent: "dispatch.truck_line.stop_arrival",
        });
      });

      if (!result.ok) {
        if (result.error === "not_found") return reply.code(404).send({ error: "stop_not_found" });
        return errorReply(reply, result);
      }
      return reply.code(200).send({ ok: true, proforma_invoice: result.proforma_invoice });
    }
  );

  app.post(
    "/api/v1/dispatch/truck-line/loads/:loadId/stops/:stopId/depart",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = paramsSchema.safeParse(req.params ?? {});
      const body = bodySchema.safeParse(req.body ?? {});
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const stop = await lockStop(client, params.data.loadId, params.data.stopId, body.data.operating_company_id);
        if (!stop) return { ok: false as const, error: "not_found" };
        return stampStopDeparture(client, stop, {
          loadId: params.data.loadId,
          actorUserId: user.uuid,
          source: "manual",
          auditEvent: "dispatch.truck_line.stop_departure",
        });
      });

      if (!result.ok) {
        if (result.error === "not_found") return reply.code(404).send({ error: "stop_not_found" });
        return errorReply(reply, result);
      }
      return reply.code(200).send({ ok: true, proforma_invoice: result.proforma_invoice });
    }
  );
}
