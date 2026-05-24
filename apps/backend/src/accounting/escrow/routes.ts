import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { depositEscrow, listEscrowAccounts, listEscrowPostings, openEscrow, releaseEscrow } from "./service.js";

const openBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  holder_id: z.string().uuid(),
  holder_type: z.enum(["driver", "vendor", "factor", "other"]),
  purpose: z.enum(["driver_bond", "repair_reserve", "factor_reserve", "other"]),
});

const escrowIdParams = z.object({
  escrow_account_id: z.string().uuid(),
});

const postBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  escrow_account_id: z.string().uuid(),
  amount_cents: z.coerce.number().int().positive(),
  source_type: z.enum(["driver_settlement", "factoring_advance", "vendor_bill", "manual", "reconciliation"]),
  source_id: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});

const postingQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

function canAccessEscrow(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export async function registerEscrowRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/escrow/open", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessEscrow(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = openBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      return await openEscrow(body.data, { userId: user.uuid, role: user.role });
    } catch (error) {
      const message = String((error as Error)?.message ?? "escrow_open_failed");
      if (message.includes("COA_ROLE_MAPPING_NOT_FOUND")) return reply.code(409).send({ error: "escrow_liability_role_missing" });
      throw error;
    }
  });

  app.get("/api/v1/accounting/escrow/accounts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessEscrow(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return { rows: await listEscrowAccounts(query.data.operating_company_id, user.uuid) };
  });

  app.get("/api/v1/accounting/escrow/accounts/:escrow_account_id/postings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessEscrow(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = escrowIdParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = postingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listEscrowPostings(
      {
        operating_company_id: query.data.operating_company_id,
        escrow_account_id: params.data.escrow_account_id,
        limit: query.data.limit,
      },
      user.uuid
    );
    return { rows };
  });

  app.post("/api/v1/accounting/escrow/deposit", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessEscrow(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = postBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      return await depositEscrow(body.data, { userId: user.uuid, role: user.role });
    } catch (error) {
      const message = String((error as Error)?.message ?? "escrow_deposit_failed");
      if (message === "escrow_account_not_found") return reply.code(404).send({ error: message });
      if (message === "escrow_account_not_active") return reply.code(409).send({ error: message });
      if (message.includes("COA_ROLE_MAPPING_NOT_FOUND")) return reply.code(409).send({ error: "cash_clearing_role_missing" });
      throw error;
    }
  });

  app.post("/api/v1/accounting/escrow/release", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessEscrow(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = postBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      return await releaseEscrow(body.data, { userId: user.uuid, role: user.role });
    } catch (error) {
      const message = String((error as Error)?.message ?? "escrow_release_failed");
      if (message === "escrow_account_not_found") return reply.code(404).send({ error: message });
      if (message === "escrow_account_not_active") return reply.code(409).send({ error: message });
      if (message === "escrow_release_exceeds_balance") return reply.code(409).send({ error: message });
      if (message.includes("COA_ROLE_MAPPING_NOT_FOUND")) return reply.code(409).send({ error: "cash_clearing_role_missing" });
      throw error;
    }
  });
}
