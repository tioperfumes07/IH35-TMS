import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listBillUnitAllocations } from "./allocations.service.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const listAllocationsQuerySchema = companyQuerySchema.extend({
  bill_id: z.string().uuid().optional(),
  asset_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

/**
 * Allocations read surface (FH-7 §3.14 "Allocations" tab — Accounting sub-nav, Phase 5). List-only:
 * reads `accounting.bill_unit_allocation` rows already written by `POST /accounting/bills/:id/allocate`
 * (bills.routes.ts, resolveAllocation in allocation.ts). No new allocation math, no GL posting here.
 */
export async function registerAllocationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/allocations", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = listAllocationsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

    const { total, items } = await listBillUnitAllocations(String(user.uuid), query.data.operating_company_id, {
      billId: query.data.bill_id,
      assetId: query.data.asset_id,
      limit: query.data.limit,
      offset: query.data.offset,
    });

    return { total, limit: query.data.limit, offset: query.data.offset, items };
  });
}

export default fp(async (app) => {
  await registerAllocationsRoutes(app);
}, { name: "accounting.registerAllocationsRoutes" });
