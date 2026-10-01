/**
 * ROUND 312 B-2 — Bank Deposits (QBO Make Deposit) routes.
 * Autoloaded via accounting/index.ts matchFilter *.routes.ts.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import {
  BankDepositError,
  createBankDeposit,
  getBankDeposit,
  listBankDeposits,
  listUndepositedReceipts,
  voidBankDeposit,
} from "./bank-deposits.service.js";

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  deposit_date: z.string().date(),
  memo: z.string().trim().max(1000).optional().nullable(),
  reference_number: z.string().trim().max(200).optional().nullable(),
  payment_ids: z.array(z.string().uuid()).default([]),
  factoring_advance_ids: z.array(z.string().uuid()).default([]),
  cash_back_cents: z.coerce.number().int().min(0).default(0),
  cash_back_account_id: z.string().uuid().optional().nullable(),
});

const listQuerySchema = companyQuerySchema.extend({
  include_voided: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const voidBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

function depositError(reply: FastifyReply, err: unknown) {
  if (err instanceof BankDepositError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "ALREADY_VOIDED" || err.code === "ALREADY_DEPOSITED" ? 409 : 400;
    return reply.code(status).send({ error: err.code, message: err.message });
  }
  throw err;
}

async function bankDepositsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/bank-deposits/undeposited", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);
    const rows = await listUndepositedReceipts(query.data.operating_company_id, user.uuid);
    return { rows, count: rows.length };
  });

  app.get("/api/v1/accounting/bank-deposits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);
    const rows = await listBankDeposits(query.data.operating_company_id, user.uuid, {
      limit: query.data.limit,
      offset: query.data.offset,
      includeVoided: query.data.include_voided,
    });
    return { rows, count: rows.length };
  });

  app.get("/api/v1/accounting/bank-deposits/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const query = companyQuerySchema.safeParse(req.query);
    if (!params.success) return validationError(reply, params.error);
    if (!query.success) return validationError(reply, query.error);
    const row = await getBankDeposit(query.data.operating_company_id, user.uuid, params.data.id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND", message: "Deposit not found" });
    return { deposit: row };
  });

  app.post("/api/v1/accounting/bank-deposits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = createBodySchema.safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);
    try {
      const created = await createBankDeposit({
        operatingCompanyId: body.data.operating_company_id,
        userId: user.uuid,
        bankAccountId: body.data.bank_account_id,
        depositDate: body.data.deposit_date,
        memo: body.data.memo,
        referenceNumber: body.data.reference_number,
        paymentIds: body.data.payment_ids,
        factoringAdvanceIds: body.data.factoring_advance_ids,
        cashBackCents: body.data.cash_back_cents,
        cashBackAccountId: body.data.cash_back_account_id,
      });
      return reply.code(201).send({ deposit: created });
    } catch (err) {
      return depositError(reply, err);
    }
  });

  /** Batch Make Deposit (§23): one Save posts N deposits, each through createBankDeposit. */
  app.post("/api/v1/accounting/bank-deposits/batch", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        rows: z.array(createBodySchema.omit({ operating_company_id: true })).min(1).max(50),
      })
      .safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);

    const results: Array<
      | { ok: true; deposit: Awaited<ReturnType<typeof createBankDeposit>> }
      | { ok: false; error: string; message: string; index: number }
    > = [];
    for (let i = 0; i < body.data.rows.length; i++) {
      const row = body.data.rows[i]!;
      try {
        const deposit = await createBankDeposit({
          operatingCompanyId: body.data.operating_company_id,
          userId: user.uuid,
          bankAccountId: row.bank_account_id,
          depositDate: row.deposit_date,
          memo: row.memo,
          referenceNumber: row.reference_number,
          paymentIds: row.payment_ids,
          factoringAdvanceIds: row.factoring_advance_ids,
          cashBackCents: row.cash_back_cents,
          cashBackAccountId: row.cash_back_account_id,
        });
        results.push({ ok: true, deposit });
      } catch (err) {
        if (err instanceof BankDepositError) {
          results.push({ ok: false, error: err.code, message: err.message, index: i });
        } else {
          results.push({
            ok: false,
            error: "UNEXPECTED",
            message: err instanceof Error ? err.message : "Unknown error",
            index: i,
          });
        }
      }
    }
    const saved = results.filter((r) => r.ok).length;
    const failed = results.length - saved;
    return { results, saved, failed };
  });

  app.post("/api/v1/accounting/bank-deposits/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const body = voidBodySchema.safeParse(req.body);
    if (!params.success) return validationError(reply, params.error);
    if (!body.success) return validationError(reply, body.error);
    try {
      const voided = await voidBankDeposit({
        operatingCompanyId: body.data.operating_company_id,
        userId: user.uuid,
        depositId: params.data.id,
        reason: body.data.reason,
      });
      return { deposit: voided };
    } catch (err) {
      return depositError(reply, err);
    }
  });
}

export default fp(bankDepositsRoutes, { name: "bank-deposits-routes" });
