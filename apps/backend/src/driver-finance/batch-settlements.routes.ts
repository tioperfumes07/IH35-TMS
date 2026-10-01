/**
 * ROUND 312 B-3 — Batch Settlements (§23) routes.
 * GET eligible SET-01 loads; POST batch Save → postSettlementCreatorInClientTx only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  BatchSettlementError,
  listSet01EligibleLoads,
  postBatchSettlements,
  USMCA,
} from "./batch-settlements.service.js";

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
const WRITE_RL = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
const READ_RL = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

const moneyLine = z.object({
  description: z.string().trim().min(1).max(500),
  amount_cents: z.number().int(),
  load_number: z.string().trim().max(40).nullable().optional(),
});

const advanceLine = z.object({
  description: z.string().trim().max(500).nullable().optional(),
  amount_cents: z.number().int(),
  load_number: z.string().trim().max(40).nullable().optional(),
  linked_driver_bill_id: z.string().uuid().nullable().optional(),
});

const rowSchema = z.object({
  driver_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  settlement_no: z.string().trim().max(40).nullable().optional(),
  unit_id: z.string().uuid().nullable().optional(),
  load_ids: z.array(z.string().uuid()).max(100).nullable().optional(),
  deductions: z.array(moneyLine).max(50).optional().default([]),
  advances: z.array(advanceLine).max(50).optional().default([]),
  admin_fee_cents: z.number().int().nullable().optional(),
  confirmed_zero_fuel_purchases: z.boolean().optional().default(true),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function mapErr(reply: FastifyReply, err: unknown) {
  if (err instanceof BatchSettlementError) {
    const status = err.code === "USMCA_ONLY" ? 400 : 409;
    return reply.code(status).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function registerBatchSettlementsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/driver-finance/batch-settlements/eligible-loads", READ_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    }
    const query = z
      .object({
        operating_company_id: z.string().uuid(),
        driver_id: z.string().uuid(),
        period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    }
    if (query.data.operating_company_id !== USMCA) {
      return reply.code(400).send({ error: "usmca_only" });
    }
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    try {
      const rows = await listSet01EligibleLoads({
        operatingCompanyId: query.data.operating_company_id,
        userId: user.uuid,
        driverId: query.data.driver_id,
        periodStart: query.data.period_start,
        periodEnd: query.data.period_end,
      });
      return reply.code(200).send({ rows, count: rows.length });
    } catch (err) {
      return mapErr(reply, err);
    }
  });

  app.post("/api/v1/driver-finance/batch-settlements", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    }
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        rows: z.array(rowSchema).min(1).max(50),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    }
    if (body.data.operating_company_id !== USMCA) {
      return reply.code(400).send({ error: "usmca_only" });
    }
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await postBatchSettlements({
        operatingCompanyId: body.data.operating_company_id,
        userId: user.uuid,
        rows: body.data.rows,
      });
      return reply.code(200).send(result);
    } catch (err) {
      return mapErr(reply, err);
    }
  });
}
