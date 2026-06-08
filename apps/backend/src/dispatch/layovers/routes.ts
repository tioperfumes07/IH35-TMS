import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { getLayoversForDriver, getLayoverSummary } from "./detection.service.js";
import { withCurrentUser } from "../../auth/db.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function requireRole(user: NonNullable<ReturnType<typeof authed>>, minRole: string): boolean {
  const roles = ["dispatcher", "manager", "owner"];
  return roles.indexOf(user.role ?? "") >= roles.indexOf(minRole);
}

export async function registerLayoverRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/layovers", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      driver: z.string().uuid(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const rows = await getLayoversForDriver(user.uuid, q.data.operating_company_id, q.data.driver, q.data.from, q.data.to);
    return reply.send({ data: rows });
  });

  app.patch("/api/v1/dispatch/layovers/:uuid/mark-billable", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!requireRole(user, "manager")) return reply.code(403).send({ error: "forbidden", message: "Manager+ role required" });
    const { uuid } = req.params as { uuid: string };
    const body = z.object({
      billable: z.boolean(),
      operating_company_id: z.string().uuid(),
    }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `UPDATE dispatch.driver_layovers SET billable_to_customer = $1 WHERE uuid = $2 AND operating_company_id = $3`,
        [body.data.billable, uuid, body.data.operating_company_id]
      );
    });
    return reply.send({ ok: true });
  });

  app.patch("/api/v1/dispatch/layovers/:uuid/per-diem-exclude", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!requireRole(user, "owner")) return reply.code(403).send({ error: "forbidden", message: "Owner role required" });
    const { uuid } = req.params as { uuid: string };
    const body = z.object({
      per_diem_eligible: z.boolean(),
      operating_company_id: z.string().uuid(),
    }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `UPDATE dispatch.driver_layovers SET per_diem_eligible = $1 WHERE uuid = $2 AND operating_company_id = $3`,
        [body.data.per_diem_eligible, uuid, body.data.operating_company_id]
      );
    });
    return reply.send({ ok: true });
  });
}
