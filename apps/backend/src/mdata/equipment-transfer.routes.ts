import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveDriverIdForUser } from "../driver-finance/settlement-dispute.service.js";
import {
  confirmTransfer,
  initiateTransfer,
  listTransfers,
  rejectTransfer,
} from "./equipment-transfer.service.js";

const equipmentIdParamsSchema = z.object({ id: z.string().uuid() });
const transferIdParamsSchema = z.object({ id: z.string().uuid() });
const initiateBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  from_driver_id: z.string().uuid(),
  to_driver_id: z.string().uuid(),
  transfer_location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.string().optional(),
});
const officeConfirmSchema = z.object({
  operating_company_id: z.string().uuid(),
  confirming_driver_id: z.string().uuid(),
});
const officeRejectSchema = z.object({
  operating_company_id: z.string().uuid(),
  confirming_driver_id: z.string().uuid(),
  rejection_reason: z.string().trim().min(10),
});
const pwaBodySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  rejection_reason: z.string().trim().min(10).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function mapServiceError(error: unknown) {
  const code = String((error as Error)?.message ?? "");
  if (
    [
      "E_DRIVER_NOT_IN_COMPANY",
      "E_EQUIPMENT_NOT_HELD_BY_FROM_DRIVER",
      "E_EQUIPMENT_TRANSFER_PENDING",
      "E_TRANSFER_NOT_ASSIGNED_TO_DRIVER",
      "E_TRANSFER_NOT_PENDING",
      "E_TRANSFER_EXPIRED",
      "E_REJECTION_REASON_MIN_10",
    ].includes(code)
  ) {
    return { status: 422, payload: { error: code } };
  }
  if (["E_EQUIPMENT_NOT_FOUND", "E_NOT_FOUND", "E_NOT_FOUND_OR_NOT_PENDING"].includes(code)) {
    return { status: 404, payload: { error: code } };
  }
  return null;
}

async function resolveOperatingCompanyForUser(userId: string) {
  return withCurrentUser(userId, async (client) => {
    const row = await client.query<{ id: string }>(
      `
        SELECT default_company_id::text AS id
        FROM identity.users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );
    return row.rows[0]?.id ?? null;
  });
}

export async function registerEquipmentTransferRoutes(app: FastifyInstance) {
  app.post("/api/v1/equipment/:id/initiate-transfer", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = equipmentIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = initiateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      return await initiateTransfer(user.uuid, {
        ...body.data,
        equipment_id: params.data.id,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.get("/api/v1/equipment-transfers", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listTransfers(user.uuid, query.data);
  });

  app.post("/api/v1/equipment-transfers/:id/confirm", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = transferIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = officeConfirmSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      return await confirmTransfer(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        transfer_id: params.data.id,
        confirming_driver_id: body.data.confirming_driver_id,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.post("/api/v1/equipment-transfers/:id/reject", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = transferIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = officeRejectSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      return await rejectTransfer(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        transfer_id: params.data.id,
        confirming_driver_id: body.data.confirming_driver_id,
        rejection_reason: body.data.rejection_reason,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.get("/api/v1/driver-pwa/my-pending-transfers", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const driverId = await resolveDriverIdForUser(user.uuid);
    if (!driverId) return reply.code(404).send({ error: "driver_not_found_for_user" });
    return listTransfers(user.uuid, {
      status: "pending_to_confirm",
      to_driver_id: driverId,
    });
  });

  app.post("/api/v1/driver-pwa/transfers/:id/confirm", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = transferIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = pwaBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const driverId = await resolveDriverIdForUser(user.uuid);
    if (!driverId) return reply.code(404).send({ error: "driver_not_found_for_user" });
    const operatingCompanyId = body.data.operating_company_id ?? (await resolveOperatingCompanyForUser(user.uuid));
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });
    try {
      return await confirmTransfer(user.uuid, {
        operating_company_id: operatingCompanyId,
        transfer_id: params.data.id,
        confirming_driver_id: driverId,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.post("/api/v1/driver-pwa/transfers/:id/reject", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = transferIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = pwaBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const driverId = await resolveDriverIdForUser(user.uuid);
    if (!driverId) return reply.code(404).send({ error: "driver_not_found_for_user" });
    if (!body.data.rejection_reason) return reply.code(400).send({ error: "E_REJECTION_REASON_MIN_10" });
    const operatingCompanyId = body.data.operating_company_id ?? (await resolveOperatingCompanyForUser(user.uuid));
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });
    try {
      return await rejectTransfer(user.uuid, {
        operating_company_id: operatingCompanyId,
        transfer_id: params.data.id,
        confirming_driver_id: driverId,
        rejection_reason: body.data.rejection_reason,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });
}
