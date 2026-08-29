// FH-3 — loan-payment GL posting routes (TIER-1 FINANCIAL; flag OFF by default).
// Run/reverse the 3-leg payment entry (Dr Note Payable + Dr Interest Expense / Cr cash) for one loan.
// Flag-gated at the SERVICE layer (FINANCE_HUB_AMORTIZATION_POST_ENABLED, default OFF => no-op, so a
// call with the flag off returns skipped_flag_off and writes zero journal entries). Finance roles only;
// entity membership enforced. Autoloaded by accounting/index.ts (@fastify/autoload, /\.routes\.(ts|js)$/)
// via the default fastify-plugin export — a named-only export would 404 silently.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { LoanPaymentPostingError } from "./loan-payment-posting.math.js";
import { postLoanPayments, reverseLoanPayments } from "./loan-payment-posting.service.js";

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

function mapError(error: LoanPaymentPostingError) {
  const byCode: Record<string, number> = {
    LOAN_NOT_FOUND: 404,
    LOAN_NOT_POSTABLE: 409,
    ACCOUNT_MISSING: 422,
    PERIOD_LOCKED: 422,
    UNBALANCED_ENTRY: 422,
    ROW_SPLIT_MISMATCH: 422,
  };
  return {
    statusCode: byCode[error.code] ?? 400,
    body: { error: error.code, message: error.message, details: error.details ?? null },
  };
}

const postBody = z.object({
  loan_id: z.string().uuid(),
  run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const reverseBody = z.object({
  loan_id: z.string().uuid(),
  reason: z.string().trim().min(1),
  payment_number: z.number().int().positive().optional(),
});

async function registerLoanPaymentPostingRoutes(app: FastifyInstance) {
  // Post every due, unposted scheduled payment for one loan (flag-gated; OFF => no-op).
  app.post("/api/v1/accounting/finance-hub-amortization-posting/loan-payments/post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = postBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postLoanPayments(
        {
          operatingCompanyId: query.data.operating_company_id,
          loanId: body.data.loan_id,
          runDate: body.data.run_date,
        },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof LoanPaymentPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Reverse posted loan payments (equal-and-opposite reversing JE; never delete).
  app.post("/api/v1/accounting/finance-hub-amortization-posting/loan-payments/reverse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = reverseBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await reverseLoanPayments(
        {
          operatingCompanyId: query.data.operating_company_id,
          loanId: body.data.loan_id,
          reason: body.data.reason,
          paymentNumber: body.data.payment_number,
        },
        { userId: user.uuid }
      );
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof LoanPaymentPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });
}

export default fp(async (app) => {
  await registerLoanPaymentPostingRoutes(app);
}, { name: "accounting.registerLoanPaymentPostingRoutes" });
