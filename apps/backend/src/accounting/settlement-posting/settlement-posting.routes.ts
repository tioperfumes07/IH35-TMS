import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { SettlementPostingError } from "./settlement-posting.math.js";
import { postSettlementToGl, reverseSettlementGlPosting } from "./settlement-posting.service.js";
import { chargeRecoverFromDriverExpense } from "./recover-from-driver.service.js";
import { getDriverBucketBalances } from "./bucket-ledger.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function ensureFinanceUser(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

function mapError(error: SettlementPostingError) {
  const byCode: Record<string, number> = {
    SETTLEMENT_NOT_FOUND: 404,
    SETTLEMENT_NOT_POSTABLE: 409,
    CONSENT_MISSING: 422,
    NET_PAY_FLOOR_BREACH: 422,
    ACCOUNT_ROLE_BINDING_MISSING: 422,
    SETTLEMENT_TOTALS_INCONSISTENT: 422,
    UNBALANCED_ENTRY: 422,
  };
  return { statusCode: byCode[error.code] ?? 400, body: { error: error.code, message: error.message, details: error.details ?? null } };
}

const postBody = z.object({
  settlement_id: z.string().uuid(),
  floor_override: z.object({ authorized_by_user_id: z.string().uuid(), reason: z.string().trim().min(1) }).optional().nullable(),
});
const reverseBody = z.object({ settlement_id: z.string().uuid(), reason: z.string().trim().min(1) });
const recoverBody = z.object({ expense_id: z.string().uuid() });
const driverBucketsQuery = companyQuerySchema.extend({ driver_id: z.string().uuid() });

export async function registerSettlementPostingRoutes(app: FastifyInstance) {
  // Post a finalized/locked settlement to the GL (flag-gated; OFF => no-op).
  app.post("/api/v1/accounting/settlement-posting/post", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = postBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postSettlementToGl(
        {
          operatingCompanyId: query.data.operating_company_id,
          settlementId: body.data.settlement_id,
          floorOverride: body.data.floor_override
            ? { authorizedByUserId: body.data.floor_override.authorized_by_user_id, reason: body.data.floor_override.reason }
            : null,
        },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof SettlementPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Reverse a posted settlement (reversing JE + bucket restore; never delete).
  app.post("/api/v1/accounting/settlement-posting/reverse", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = reverseBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await reverseSettlementGlPosting(
      { operatingCompanyId: query.data.operating_company_id, settlementId: body.data.settlement_id, reason: body.data.reason },
      { userId: user.uuid }
    );
    return reply.code(200).send(result);
  });

  // Recover-from-driver: charge a flagged expense into the driver's deduction bucket (consent-gated).
  app.post("/api/v1/accounting/settlement-posting/recover-from-driver", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = recoverBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await chargeRecoverFromDriverExpense(
        { operatingCompanyId: query.data.operating_company_id, expenseId: body.data.expense_id },
        { userId: user.uuid }
      );
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof SettlementPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // READ-ONLY per-bucket balances for a driver (the PWA "Advance balance / Lease N of M" view).
  app.get("/api/v1/accounting/settlement-posting/driver-buckets", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = driverBucketsQuery.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const buckets = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);
      return getDriverBucketBalances(client as never, {
        operatingCompanyId: query.data.operating_company_id,
        driverId: query.data.driver_id,
      });
    });
    return reply.code(200).send({ driver_id: query.data.driver_id, buckets });
  });
}

export default fp(async (app) => {
  await registerSettlementPostingRoutes(app);
}, { name: "accounting.registerSettlementPostingRoutes" });
