import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  acceptReconMatch,
  getReconWorklist,
  rejectReconMatch,
} from "./bank-recon/recon-worklist.service.js";
import type { LedgerEntryKind } from "./bank-recon/match.service.js";

const workspaceQuerySchema = companyQuerySchema.extend({
  account_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
});

const matchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: z.enum(["payment", "bill_payment", "transfer", "je"]),
  ledger_entry_id: z.string().uuid(),
  variance_account_id: z.string().uuid().optional(),
});

const unmatchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_transaction_id: z.string().uuid(),
  ledger_entry_kind: z.enum(["payment", "bill_payment", "transfer", "je"]),
  ledger_entry_id: z.string().uuid(),
});

function canReconcile(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function asLedgerKind(value: string): LedgerEntryKind {
  return value as LedgerEntryKind;
}

export async function registerAccountingReconciliationRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/reconciliation/workspace", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = workspaceQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const payload = await getReconWorklist({
      operating_company_id: query.data.operating_company_id,
      account_id: query.data.account_id,
      period_start: query.data.period_start,
      period_end: query.data.period_end,
    });
    return {
      unreconciled_bank_transactions: payload.unmatched_transactions,
      candidate_ledger_entries: payload.auto_matched_candidates,
      variance_resolved_entries: payload.variance_resolved_entries,
      progress: payload.progress,
    };
  });

  app.post("/api/v1/accounting/reconciliation/match", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = matchBodySchema.safeParse(req.body ?? {});
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

  app.patch("/api/v1/accounting/reconciliation/unmatch", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = unmatchBodySchema.safeParse(req.body ?? {});
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
}

export default fp(registerAccountingReconciliationRoutes, {
  name: "accounting.registerAccountingReconciliationRoutes",
});
