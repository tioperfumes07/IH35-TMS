import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { addStopExtra, listForLoad, softDelete, totalForLoad } from "./extra-rate.service.js";

const manageRoles = new Set(["Owner", "Administrator", "Manager", "Dispatcher"]);

const loadStopParamsSchema = z.object({
  load_uuid: z.string().uuid(),
  stop_uuid: z.string().uuid(),
});

const loadParamsSchema = z.object({
  load_uuid: z.string().uuid(),
});

const deleteParamsSchema = z.object({
  load_uuid: z.string().uuid(),
  stop_uuid: z.string().uuid(),
  rate_uuid: z.string().uuid(),
});

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const addBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  rate_type: z.enum(["extra_stop_fee", "lumper", "detention", "fuel_surcharge", "accessorial", "other"]),
  amount_cents: z.coerce.number().int().min(0),
  description: z.string().trim().max(500).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerLoadStopExtraRateRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!manageRoles.has(user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const params = loadStopParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = addBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const created = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      return addStopExtra(client, {
        operating_company_id: body.data.operating_company_id,
        load_uuid: params.data.load_uuid,
        stop_uuid: params.data.stop_uuid,
        rate_type: body.data.rate_type,
        amount_cents: body.data.amount_cents,
        description: body.data.description ?? null,
        created_by_user_uuid: user.uuid,
      });
    });

    if (!created) {
      return reply.code(404).send({ error: "load_stop_not_found" });
    }
    return reply.code(201).send({ rate: created });
  });

  app.get("/api/v1/dispatch/loads/:load_uuid/extra-rates", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const [items, total_cents] = await Promise.all([
        listForLoad(client, {
          operating_company_id: query.data.operating_company_id,
          load_uuid: params.data.load_uuid,
        }),
        totalForLoad(client, {
          operating_company_id: query.data.operating_company_id,
          load_uuid: params.data.load_uuid,
        }),
      ]);
      return { items, total_cents };
    });

    return payload;
  });

  app.delete(
    "/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates/:rate_uuid",
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!manageRoles.has(user.role)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const params = deleteParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const deleted = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
        return softDelete(client, {
          operating_company_id: query.data.operating_company_id,
          load_uuid: params.data.load_uuid,
          stop_uuid: params.data.stop_uuid,
          rate_uuid: params.data.rate_uuid,
        });
      });

      if (!deleted) return reply.code(404).send({ error: "stop_extra_rate_not_found" });
      return { ok: true };
    }
  );
}
