import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createTransfer, getTransferDetail, listTransfers, revokeTransfer } from "./transfers.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  transfer_type: z.enum(["bank_to_bank", "cc_payment", "cash_deposit", "owner_contribution", "owner_distribution"]),
  from_account_id: z.string().uuid(),
  from_account_kind: z.enum(["bank", "cc", "coa"]),
  to_account_id: z.string().uuid(),
  to_account_kind: z.enum(["bank", "cc", "coa"]),
  amount_cents: z.coerce.number().int().positive(),
  transfer_date: z.string().date(),
  memo: z.string().trim().max(1000).optional(),
  reference_number: z.string().trim().max(200).optional(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  type: z.enum(["bank_to_bank", "cc_payment", "cash_deposit", "owner_contribution", "owner_distribution"]).optional(),
  account_id: z.string().uuid().optional(),
  status: z.enum(["active", "revoked"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const revokeBodySchema = z.object({ reason: z.string().trim().min(3).max(500) });

const ccPaymentBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  cc_vendor_id: z.string().trim().min(1),
  /** Catalogs COA account UUID for the card liability (credit on payment). */
  cc_liability_coa_account_id: z.string().uuid(),
  from_bank_account_id: z.string().uuid(),
  payment_date: z.string().date(),
  amount_cents: z.coerce.number().int().positive(),
  memo: z.string().trim().max(1000).optional(),
  statement_period: z.string().trim().max(120).optional(),
});

function isOwnerAdminAccountant(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

export async function registerBankingTransfersRoutes(app: FastifyInstance) {
  app.post("/api/v1/banking/transfers", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const transfer = await createTransfer(
        {
          operatingCompanyId: body.data.operating_company_id,
          transferType: body.data.transfer_type,
          fromAccountId: body.data.from_account_id,
          fromAccountKind: body.data.from_account_kind,
          toAccountId: body.data.to_account_id,
          toAccountKind: body.data.to_account_kind,
          amountCents: body.data.amount_cents,
          transferDate: body.data.transfer_date,
          memo: body.data.memo,
          referenceNumber: body.data.reference_number,
        },
        user.uuid
      );
      return reply.code(201).send({ transfer });
    } catch (error) {
      const message = String((error as Error)?.message ?? "transfer_create_failed");
      if (
        message === "transfer_amount_must_be_positive" ||
        message === "self_transfer_not_allowed" ||
        message === "transfer_account_not_accessible"
      ) {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/banking/cc-payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = ccPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const memoParts = [`CC payment · QBO vendor ${body.data.cc_vendor_id}`];
    if (body.data.statement_period) memoParts.push(`Statement ${body.data.statement_period}`);
    if (body.data.memo) memoParts.push(body.data.memo);
    try {
      const transfer = await createTransfer(
        {
          operatingCompanyId: body.data.operating_company_id,
          transferType: "cc_payment",
          fromAccountId: body.data.from_bank_account_id,
          fromAccountKind: "bank",
          toAccountId: body.data.cc_liability_coa_account_id,
          toAccountKind: "coa",
          amountCents: body.data.amount_cents,
          transferDate: body.data.payment_date,
          memo: memoParts.join(" · "),
        },
        user.uuid
      );
      return reply.code(201).send({ transfer });
    } catch (error) {
      const message = String((error as Error)?.message ?? "cc_payment_create_failed");
      if (
        message === "transfer_amount_must_be_positive" ||
        message === "self_transfer_not_allowed" ||
        message === "transfer_account_not_accessible"
      ) {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }
  });

  app.get("/api/v1/banking/transfers", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const transfers = await listTransfers({
      userId: user.uuid,
      operatingCompanyId: query.data.operating_company_id,
      fromDate: query.data.from,
      toDate: query.data.to,
      type: query.data.type,
      accountId: query.data.account_id,
      status: query.data.status,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    return { transfers };
  });

  app.get("/api/v1/banking/transfers/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerAdminAccountant(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const detail = await getTransferDetail(params.data.id, query.data.operating_company_id, user.uuid);
    if (!detail) return reply.code(404).send({ error: "transfer_not_found" });
    return detail;
  });

  app.post("/api/v1/banking/transfers/:id/revoke", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = revokeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    try {
      const transfer = await revokeTransfer(params.data.id, query.data.operating_company_id, body.data.reason, user.uuid);
      return { transfer };
    } catch (error) {
      const message = String((error as Error)?.message ?? "transfer_revoke_failed");
      if (message === "transfer_not_found") return reply.code(404).send({ error: message });
      if (message === "transfer_already_revoked") return reply.code(409).send({ error: message });
      throw error;
    }
  });
}

