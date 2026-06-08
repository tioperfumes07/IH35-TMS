import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  getDailyPrediction,
  getActualVsProjected,
  addAdjustment,
} from "./cash-flow.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const dailyPredictionQuerySchema = companyQuerySchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

const actualVsProjectedQuerySchema = companyQuerySchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
});

const addAdjustmentBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().trim().min(1).max(500),
  amount_cents: z.number().int(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerCashFlowModuleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/cash-flow/daily-prediction", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const query = dailyPredictionQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).send({ error: "validation_error", details: query.error.flatten() });
    }
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${query.data.operating_company_id}'`);
      return getDailyPrediction(client, query.data.operating_company_id, query.data.date);
    });
    return reply.send(result);
  });

  app.get("/api/v1/cash-flow/actual-vs-projected", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const query = actualVsProjectedQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).send({ error: "validation_error", details: query.error.flatten() });
    }
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${query.data.operating_company_id}'`);
      return getActualVsProjected(client, query.data.operating_company_id, query.data.from, query.data.to);
    });
    return reply.send(result);
  });

  app.post("/api/v1/cash-flow/adjustments", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const body = addAdjustmentBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "validation_error", details: body.error.flatten() });
    }
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${body.data.operating_company_id}'`);
      const row = await addAdjustment(client, {
        operating_company_id: body.data.operating_company_id,
        entry_date: body.data.entry_date,
        label: body.data.label,
        amount_cents: body.data.amount_cents,
        created_by_user_id: user.uuid,
      });
      await appendCrudAudit(
        client,
        user.uuid,
        "cash_flow_adjustment.created",
        {
          record_id: row.id,
          operating_company_id: body.data.operating_company_id,
          entry_date: body.data.entry_date,
          label: body.data.label,
          amount_cents: body.data.amount_cents,
        }
      );
      return row;
    });
    return reply.status(201).send(result);
  });
}
