import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  deliverDriverProfileMessage,
  DriverMessagePersistenceError,
  requireDriverMessageRow,
} from "../drivers/messages.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ id: z.string().uuid() });

const messageBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  channel: z.enum(["sms", "email", "in_app"]),
  urgency: z.string().trim().max(40).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

export async function registerDriverMessagesRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/drivers/:id/messages", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = messageBodySchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    // Explicit catch, following the house pattern at accounting/recon/recon.routes.ts:51. NOT because
    // a throw would otherwise 500 — verified on this repo's Fastify 5 that an error carrying
    // statusCode 403 is returned as a 403 unaided, and withCurrentUser rethrows after ROLLBACK. The
    // reason to catch is the RESPONSE BODY: this returns {error: "forbidden_company_membership"},
    // which the tests assert on, instead of Fastify's default {statusCode, error: "Forbidden", message}.
    try {
    const row = await withCurrentUser(authUser.uuid, async (client) => {
      // MDATA-F09 — CALLER-SUPPLIED RLS SCOPE. operating_company_id arrives in the QUERY STRING and was
      // validated only as a UUID, then fed straight into the tenant-scope GUC assignment below. The
      // caller was choosing the scope RLS would enforce, so RLS authorized nothing: any authenticated
      // user — there is not even a role check on this route — could name any company, insert a row under
      // it and have deliverDriverProfileMessage send a REAL SMS/email to any driver id they supplied.
      // Assert membership BEFORE the GUC set, so the scope is proven to be the caller's own.
      await assertCompanyMembership(client, authUser.uuid, query.data.operating_company_id);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);

      // The driver id was likewise never checked against that company: with a valid company of their own,
      // a caller could still address a driver belonging to a different entity, since neither the INSERT
      // nor the delivery re-joins mdata.drivers. Resolve the driver INSIDE the now-asserted scope.
      const driverRes = await client.query<{ id: string }>(
        `SELECT d.id::text AS id
           FROM mdata.drivers d
          WHERE d.id = $1::uuid
            AND d.operating_company_id = $2::uuid
          LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (driverRes.rowCount === 0) {
        const err = new Error("mdata_driver_not_found");
        (err as Error & { statusCode?: number }).statusCode = 404;
        throw err;
      }

      const res = await client.query(
        `
          INSERT INTO mdata.driver_profile_messages (
            operating_company_id, driver_id, message, channel, urgency, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id::text, channel, urgency, created_at::text
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          body.data.message,
          body.data.channel,
          body.data.urgency ?? null,
          authUser.uuid,
        ]
      );
      const inserted = requireDriverMessageRow(
        res.rows as Array<{ id: string; channel: string; urgency: string | null; created_at: string }>,
        "create"
      );
      await appendCrudAudit(client, authUser.uuid, "mdata.driver_profile_message.recorded", {
        resource_type: "mdata.driver_profile_messages",
        resource_id: inserted.id,
        operating_company_id: query.data.operating_company_id,
        driver_id: params.data.id,
        channel: body.data.channel,
      });
      const delivery = await deliverDriverProfileMessage(client, {
        messageId: inserted.id,
        operatingCompanyId: query.data.operating_company_id,
        driverId: params.data.id,
        channel: body.data.channel,
        message: body.data.message,
        actorUserId: authUser.uuid,
      });
      return { ...inserted, delivery_status: delivery.delivery_status, delivery_ref: delivery.delivery_ref };
    });
    return reply.code(201).send(row);
    } catch (err) {
      const message = (err as Error)?.message;
      if (message === "forbidden_company_membership") return reply.code(403).send({ error: message });
      if (message === "mdata_driver_not_found") return reply.code(404).send({ error: message });
      if (err instanceof DriverMessagePersistenceError) {
        return reply.code(409).send({ error: err.message, operation: err.operation });
      }
      throw err;
    }
  });
}
