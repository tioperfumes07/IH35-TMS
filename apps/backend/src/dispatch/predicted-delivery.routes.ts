import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2) — dispatcher CONFIRM of a proposed predicted
// delivery date. A proposed ETA slip surfaces in the At-Risk queue; the dispatcher reviews and
// confirms here. On confirm: update mdata.loads.predicted_delivery_date and write ONE append-only
// audit row. FORECAST/SCHEDULING ONLY — never touches a posted invoice / AR / settlement / QBO.
//
// Gated behind the master flag CASH_FOLLOWS_ETA_ENABLED (OFF until GUARD prod-verify; isEnabled
// returns false while the flag is unregistered, so the endpoint no-ops until Jorge turns it on).
// Per-entity scoped. There is NO auto-commit path: a write happens only on this explicit confirm.

const CASH_FOLLOWS_ETA_FLAG = "CASH_FOLLOWS_ETA_ENABLED";
const ALLOWED_ROLES = ["Owner", "Administrator", "Manager", "Dispatcher"];

const paramsSchema = z.object({ load_id: z.string().uuid() });
const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
  new_predicted_date: z.string().datetime({ offset: true }),
  // The signal(s) that proposed this slip (e.g. driver_report, dispatcher, hos_risk). Recorded for
  // the audit trail; the confirm itself is always human.
  triggering_signals: z.array(z.string().min(1).max(64)).min(1).max(10),
});

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerPredictedDeliveryRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/loads/:load_id/confirm-predicted-delivery", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user!;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!ALLOWED_ROLES.includes(user.role)) return reply.code(403).send({ error: "forbidden" });

    const result = await withCurrentUser(user.uuid, async (client) => {
      // Master flag — feature no-ops until explicitly enabled.
      const enabled = await isEnabled(client, CASH_FOLLOWS_ETA_FLAG, {
        operating_company_id: body.data.operating_company_id,
        user_uuid: user.uuid,
      });
      if (!enabled) return { kind: "disabled" as const };

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

      const cur = await client.query<{ predicted_delivery_date: string | null }>(
        `SELECT predicted_delivery_date::text AS predicted_delivery_date
         FROM mdata.loads
         WHERE id = $1::uuid AND operating_company_id = $2::uuid
         LIMIT 1`,
        [params.data.load_id, body.data.operating_company_id]
      );
      if (!cur.rows[0]) return { kind: "not_found" as const };
      const oldDate = cur.rows[0].predicted_delivery_date;

      // Update the PREDICTION only (scheduling/forecast). No invoice/AR/QBO write anywhere here.
      await client.query(
        `UPDATE mdata.loads
            SET predicted_delivery_date = $3::timestamptz,
                predicted_source = 'dispatcher_confirmed',
                predicted_updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [params.data.load_id, body.data.operating_company_id, body.data.new_predicted_date]
      );

      // Append-only audit: every confirmed shift is logged (who/old/new/signals/when).
      await client.query(
        `INSERT INTO forecast.predicted_delivery_changes
            (operating_company_id, load_id, old_predicted_date, new_predicted_date, triggering_signals, confirmed_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, $5::text[], $6::uuid)`,
        [body.data.operating_company_id, params.data.load_id, oldDate, body.data.new_predicted_date, body.data.triggering_signals, user.uuid]
      );

      // Universal spine audit (in addition to the domain forecast.predicted_delivery_changes row).
      await appendCrudAudit(client, user.uuid, "predicted_delivery.confirmed", {
        record_id: params.data.load_id,
        operating_company_id: body.data.operating_company_id,
        old_predicted_date: oldDate,
        new_predicted_date: body.data.new_predicted_date,
        triggering_signals: body.data.triggering_signals,
      });

      return { kind: "ok" as const, load_id: params.data.load_id, old_predicted_date: oldDate, new_predicted_date: body.data.new_predicted_date };
    });

    if (result.kind === "disabled") return reply.code(409).send({ error: "feature_disabled", flag: CASH_FOLLOWS_ETA_FLAG });
    if (result.kind === "not_found") return reply.code(404).send({ error: "load_not_found" });
    return reply.send(result);
  });
}
