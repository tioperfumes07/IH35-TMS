import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { confirmInbound, confirmOutbound } from "./dual-confirm.service.js";
import { cancelTransfer, initiateTransfer, listInProgress, listPendingForDriver } from "./request.service.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const companyBody = z.object({ operating_company_id: z.string().uuid() });

export async function registerEquipmentTransferRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/equipment-transfers/initiate", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = companyBody
      .extend({
        equipment_uuid: z.string().uuid(),
        equipment_kind: z.enum(["truck", "trailer", "chassis"]),
        from_driver_uuid: z.string().uuid(),
        to_driver_uuid: z.string().uuid(),
        transfer_location: z.string().min(1),
        notes: z.string().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const uuid = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${body.data.operating_company_id}'`);
      return initiateTransfer(client, user.uuid, body.data);
    });
    return reply.code(201).send({ uuid });
  });

  app.get("/api/v1/dispatch/equipment-transfers/pending", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z
      .object({
        operating_company_id: z.string().uuid(),
        driver: z.string().uuid(),
        direction: z.enum(["outbound", "inbound"]),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${q.data.operating_company_id}'`);
      return listPendingForDriver(client, q.data.operating_company_id, q.data.driver, q.data.direction);
    });
    return reply.send({ data: rows });
  });

  app.get("/api/v1/dispatch/equipment-transfers/in-progress", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${q.data.operating_company_id}'`);
      return listInProgress(client, q.data.operating_company_id);
    });
    return reply.send({ data: rows });
  });

  app.post("/api/v1/dispatch/equipment-transfers/:uuid/confirm-outbound", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const body = companyBody
      .extend({ driver_uuid: z.string().uuid(), evidence_uuid: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${body.data.operating_company_id}'`);
      return confirmOutbound(client, user.uuid, body.data.operating_company_id, uuid, body.data.driver_uuid, body.data.evidence_uuid);
    });
    if (result.kind === "not_found") return reply.code(404).send({ error: "not_found" });
    if (result.kind === "wrong_driver") return reply.code(403).send({ error: "wrong_driver" });
    if (result.kind === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return reply.send({ ok: true, uuid: result.uuid });
  });

  app.post("/api/v1/dispatch/equipment-transfers/:uuid/confirm-inbound", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const body = companyBody
      .extend({ driver_uuid: z.string().uuid(), evidence_uuid: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${body.data.operating_company_id}'`);
      return confirmInbound(client, user.uuid, body.data.operating_company_id, uuid, body.data.driver_uuid, body.data.evidence_uuid);
    });
    if (result.kind === "not_found") return reply.code(404).send({ error: "not_found" });
    if (result.kind === "wrong_driver") return reply.code(403).send({ error: "wrong_driver" });
    if (result.kind === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return reply.send({ ok: true, uuid: result.uuid });
  });

  app.post("/api/v1/dispatch/equipment-transfers/:uuid/cancel", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const body = companyBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    const ok = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${body.data.operating_company_id}'`);
      return cancelTransfer(client, user.uuid, body.data.operating_company_id, uuid);
    });
    if (!ok) return reply.code(404).send({ error: "not_found_or_terminal" });
    return reply.send({ ok: true });
  });
}
