import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { type LedgerEntryKind } from "./match.service.js";
import { acceptReconMatch, closeReconPeriod, getReconWorklist, rejectReconMatch } from "./recon-worklist.service.js";

const worklistQuerySchema = companyQuerySchema.extend({
  account_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
});

const acceptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: z.enum(["payment", "bill_payment", "transfer", "je", "expense"]),
  ledger_entry_id: z.string().uuid(),
  variance_account_id: z.string().uuid().optional(),
});

const rejectBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: z.enum(["payment", "bill_payment", "transfer", "je", "expense"]),
  ledger_entry_id: z.string().uuid(),
});

const manualBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: z.enum(["payment", "bill_payment", "transfer", "je", "expense"]),
  ledger_entry_id: z.string().uuid(),
  variance_account_id: z.string().uuid().optional(),
});

const closeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  account_id: z.string().uuid(),
  period_end: z.string().date(),
});

function canReconcile(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function asLedgerKind(value: string): LedgerEntryKind {
  return value as LedgerEntryKind;
}

export async function registerBankReconWorklistRoutes(app: FastifyInstance) {
  app.get("/api/v1/bank-recon/worklist", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = worklistQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const payload = await getReconWorklist({
      operating_company_id: query.data.operating_company_id,
      account_id: query.data.account_id,
      period_start: query.data.period_start,
      period_end: query.data.period_end,
    });
    return payload;
  });

  app.post("/api/v1/bank-recon/accept-match", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = acceptBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await acceptReconMatch({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
        ledger_entry_kind: asLedgerKind(body.data.ledger_entry_kind),
        ledger_entry_id: body.data.ledger_entry_id,
        variance_account_id: body.data.variance_account_id,
      });
      return { ok: true, result };
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "variance_account_id_required") {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/bank-recon/reject-match", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = rejectBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    await rejectReconMatch({
      operating_company_id: body.data.operating_company_id,
      bank_transaction_id: body.data.bank_transaction_id,
      actor_user_uuid: user.uuid,
      ledger_entry_kind: asLedgerKind(body.data.ledger_entry_kind),
      ledger_entry_id: body.data.ledger_entry_id,
    });
    return { ok: true };
  });

  app.post("/api/v1/bank-recon/manual-match", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = manualBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await acceptReconMatch({
        operating_company_id: body.data.operating_company_id,
        bank_transaction_id: body.data.bank_transaction_id,
        actor_user_uuid: user.uuid,
        ledger_entry_kind: asLedgerKind(body.data.ledger_entry_kind),
        ledger_entry_id: body.data.ledger_entry_id,
        variance_account_id: body.data.variance_account_id,
      });
      return { ok: true, result };
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "variance_account_id_required") {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/bank-recon/close-period", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = closeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await closeReconPeriod({
        operating_company_id: body.data.operating_company_id,
        account_id: body.data.account_id,
        period_end: body.data.period_end,
        actor_user_uuid: user.uuid,
      });
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "period_not_100pct_reconciled") {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });
}


export default fp(async (app) => {
  await registerBankReconWorklistRoutes(app);
}, { name: "accounting.registerBankReconWorklistRoutes" });
