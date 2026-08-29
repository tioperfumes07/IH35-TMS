import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertAccessibleCompanyScope } from "./multi-entity/routes.js";
import {
  getConsolidatedBalanceSheet,
  getConsolidatedCashFlow,
  getConsolidatedProfitLoss,
} from "./consolidated-statements.service.js";

// READ-ONLY consolidated financial statements with intercompany elimination (item 4).
// These endpoints run each entity's existing per-entity statement builder, sum them, and apply an
// intercompany elimination. They POST NOTHING and perform no INSERT/UPDATE/DELETE.

const companyIdsSchema = z
  .string()
  .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
  .refine((ids) => ids.length > 0, { message: "operating_company_ids must contain at least one company" })
  .refine((ids) => ids.every((id) => /^[0-9a-f-]{36}$/i.test(id)), {
    message: "operating_company_ids must be UUIDs",
  });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const periodQuerySchema = z.object({
  operating_company_ids: companyIdsSchema,
  from_date: dateOnly.optional(),
  to_date: dateOnly.optional(),
});

const asOfQuerySchema = z.object({
  operating_company_ids: companyIdsSchema,
  as_of_date: dateOnly,
});

function currentAuthUser(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canReadConsolidated(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

async function assertScope(userId: string, role: string, companyIds: string[]): Promise<boolean> {
  return withCurrentUser(userId, async (client) =>
    assertAccessibleCompanyScope(client, { user_id: userId, role, operating_company_ids: companyIds })
  );
}

export async function registerConsolidatedStatementsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/consolidated/pnl", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReadConsolidated(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = periodQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const companyIds = Array.from(new Set(query.data.operating_company_ids));
    if (!(await assertScope(user.uuid, user.role, companyIds))) {
      return reply.code(403).send({ error: "forbidden_company_scope" });
    }
    const report = await getConsolidatedProfitLoss({
      userId: user.uuid,
      operating_company_ids: companyIds,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });
    return reply.code(200).send(report);
  });

  app.get("/api/v1/accounting/consolidated/balance-sheet", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReadConsolidated(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = asOfQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const companyIds = Array.from(new Set(query.data.operating_company_ids));
    if (!(await assertScope(user.uuid, user.role, companyIds))) {
      return reply.code(403).send({ error: "forbidden_company_scope" });
    }
    const report = await getConsolidatedBalanceSheet({
      userId: user.uuid,
      operating_company_ids: companyIds,
      as_of_date: query.data.as_of_date,
    });
    return reply.code(200).send(report);
  });

  app.get("/api/v1/accounting/consolidated/cash-flow", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReadConsolidated(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = periodQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const companyIds = Array.from(new Set(query.data.operating_company_ids));
    if (!(await assertScope(user.uuid, user.role, companyIds))) {
      return reply.code(403).send({ error: "forbidden_company_scope" });
    }
    const report = await getConsolidatedCashFlow({
      userId: user.uuid,
      operating_company_ids: companyIds,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });
    return reply.code(200).send(report);
  });
}

export default fp(
  async (app: FastifyInstance) => {
    await registerConsolidatedStatementsRoutes(app);
  },
  { name: "accounting.registerConsolidatedStatementsRoutes" }
);
