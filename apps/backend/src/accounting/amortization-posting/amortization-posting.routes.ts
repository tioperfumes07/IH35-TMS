// FIN-21 — Prepaid-amortization + fixed-asset-depreciation GL posting routes (TIER-1; flag OFF).
// Run/reverse a period-post for one prepaid asset or one fixed asset. Flag-gated at the service layer
// (AMORTIZATION_GL_POSTING_ENABLED, default OFF => no-op). Finance roles only; entity membership enforced.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { AmortizationPostingError } from "./amortization-posting.math.js";
import {
  postPrepaidAmortization,
  postDepreciation,
  reversePrepaidAmortization,
  reverseDepreciation,
} from "./amortization-posting.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Accountant"]);

function ensureFinanceUser(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

function mapError(error: AmortizationPostingError) {
  const byCode: Record<string, number> = {
    ASSET_NOT_FOUND: 404,
    ASSET_NOT_POSTABLE: 409,
    ACCOUNT_MISSING: 422,
    PERIOD_LOCKED: 422,
    UNBALANCED_ENTRY: 422,
    PRIOR_ACCUM_UNSUPPORTED: 422,
  };
  return { statusCode: byCode[error.code] ?? 400, body: { error: error.code, message: error.message, details: error.details ?? null } };
}

const runDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const postBody = z.object({ asset_id: z.string().uuid(), run_date: runDate });
const reverseBody = z.object({ asset_id: z.string().uuid(), reason: z.string().trim().min(1), period_number: z.number().int().positive().optional() });

async function registerAmortizationPostingRoutes(app: FastifyInstance) {
  // Prepaid amortization — post all due, unposted periods (flag-gated; OFF => no-op).
  app.post("/api/v1/accounting/amortization-posting/prepaid/post", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = postBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postPrepaidAmortization(
        { operatingCompanyId: query.data.operating_company_id, assetId: body.data.asset_id, runDate: body.data.run_date },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof AmortizationPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Fixed-asset depreciation — materialize schedule + post all due, unposted periods.
  app.post("/api/v1/accounting/amortization-posting/depreciation/post", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = postBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postDepreciation(
        { operatingCompanyId: query.data.operating_company_id, assetId: body.data.asset_id, runDate: body.data.run_date },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof AmortizationPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Reverse a prepaid amortization posting (reversing JE; never delete).
  app.post("/api/v1/accounting/amortization-posting/prepaid/reverse", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = reverseBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await reversePrepaidAmortization(
      { operatingCompanyId: query.data.operating_company_id, assetId: body.data.asset_id, reason: body.data.reason, periodNumber: body.data.period_number },
      { userId: user.uuid }
    );
    return reply.code(200).send(result);
  });

  // Reverse a fixed-asset depreciation posting (reversing JE; never delete).
  app.post("/api/v1/accounting/amortization-posting/depreciation/reverse", async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = reverseBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await reverseDepreciation(
      { operatingCompanyId: query.data.operating_company_id, assetId: body.data.asset_id, reason: body.data.reason, periodNumber: body.data.period_number },
      { userId: user.uuid }
    );
    return reply.code(200).send(result);
  });
}

export default fp(async (app) => {
  await registerAmortizationPostingRoutes(app);
}, { name: "accounting.registerAmortizationPostingRoutes" });
