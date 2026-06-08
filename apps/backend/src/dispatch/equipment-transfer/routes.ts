import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  cancelTransferForUser,
  initiateTransferForUser,
  listPendingForDriverForUser,
} from "./request.service.js";
import { confirmInboundForUser, confirmOutboundForUser } from "./dual-confirm.service.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const companyBody = z.object({ operating_company_id: z.string().uuid() });

function mapInitiateError(error: unknown) {
  const code = String((error as Error)?.message ?? "");
  if (code === "driver_not_in_company" || code === "transfer_already_active") {
    return { status: 422, payload: { error: code } };
  }
  if (code === "equipment_not_found") return { status: 404, payload: { error: code } };
  return null;
}

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
        transfer_location: z.string().trim().min(1).max(500),
        notes: z.string().trim().max(2000).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    try {
      const result = await initiateTransferForUser(user.uuid, body.data);
      return reply.code(201).send(result);
    } catch (error) {
      const mapped = mapInitiateError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.get("/api/v1/dispatch/equipment-transfers/pending", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z
      .object({
        operating_company_id: z.string().uuid(),
        driver: z.string().uuid().optional(),
        direction: z.enum(["outbound", "inbound"]).optional(),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

    const result = await listPendingForDriverForUser(
      user.uuid,
      q.data.operating_company_id,
      q.data.driver,
      q.data.direction
    );
    return reply.send(result);
  });

  app.post("/api/v1/dispatch/equipment-transfers/:uuid/confirm-outbound", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const body = companyBody
      .extend({ driver_uuid: z.string().uuid(), evidence_uuid: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const result = await confirmOutboundForUser(
      user.uuid,
      body.data.operating_company_id,
      uuid,
      body.data.driver_uuid,
      body.data.evidence_uuid
    );
    if (result.kind === "not_found") return reply.code(404).send({ error: "not_found" });
    if (result.kind === "driver_mismatch") return reply.code(403).send({ error: "driver_mismatch" });
    if (result.kind === "invalid_status") return reply.code(422).send({ error: "invalid_status" });
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

    const result = await confirmInboundForUser(
      user.uuid,
      body.data.operating_company_id,
      uuid,
      body.data.driver_uuid,
      body.data.evidence_uuid
    );
    if (result.kind === "not_found") return reply.code(404).send({ error: "not_found" });
    if (result.kind === "driver_mismatch") return reply.code(403).send({ error: "driver_mismatch" });
    if (result.kind === "invalid_status") return reply.code(422).send({ error: "invalid_status" });
    return reply.send({ ok: true, uuid: result.uuid });
  });

  app.post("/api/v1/dispatch/equipment-transfers/:uuid/cancel", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const body = companyBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const result = await cancelTransferForUser(user.uuid, body.data.operating_company_id, uuid);
    if (!result.ok) return reply.code(404).send({ error: "not_found_or_not_cancellable" });
    return reply.send({ ok: true });
  });
}
