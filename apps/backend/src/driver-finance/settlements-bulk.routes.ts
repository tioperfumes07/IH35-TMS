/**
 * Settlements bulk reverse — same reverseSettlementBillPaymentInClientTx path as
 * POST /driver-finance/settlements/:id/reverse (SETL-NO-VOID-PATH-01). Fail-stop.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { reverseSettlementBillPaymentInClientTx } from "../accounting/settlement-posting/settlement-bill-payment-posting.service.js";
import { unmatchBankTransactionById } from "../accounting/void.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const emptyPayloadSchema = z.object({}).default({});

async function handleSettlementBulk(
  ctx: BulkPerEntityContext<Record<string, unknown>>
): Promise<BulkPerEntityResult> {
  const { id, action, reason, operatingCompanyId, actorUserId, bulkCallId, client, actorRole } = ctx;
  if (action !== "reverse") {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }
  if (!canVoidCancel(String(actorRole ?? ""))) {
    return {
      ok: false,
      code: "E_FORBIDDEN",
      message: "Owner, Administrator, or Accountant required to reverse settlements",
    };
  }
  if (!reason || reason.trim().length < 10) {
    return { ok: false, code: "E_REASON_REQUIRED", message: "reason must be at least 10 characters" };
  }

  const currentRes = await client.query(
    `SELECT id::text, status::text, locked_at::text, paid_via_bank_txn_id::text
       FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [id, operatingCompanyId]
  );
  const current = currentRes.rows[0] as
    | { id: string; status: string; locked_at: string | null; paid_via_bank_txn_id: string | null }
    | undefined;
  if (!current) return { ok: false, code: "E_NOT_FOUND", message: "Settlement not found" };
  if (current.status === "cancelled") {
    return { ok: false, code: "E_ALREADY_REVERSED", message: "Settlement is already cancelled" };
  }
  if (current.status === "paid") {
    return {
      ok: false,
      code: "E_STATE_INVALID",
      message: "Paid settlements cannot be reversed via bulk — clawback required",
    };
  }
  if (current.locked_at) {
    return {
      ok: false,
      code: "E_STATE_INVALID",
      message: "Locked settlement must be unlocked before reverse",
    };
  }

  try {
    const reversal = await reverseSettlementBillPaymentInClientTx(
      client as never,
      { operatingCompanyId, settlementId: id, reason: reason.trim() },
      { userId: actorUserId },
      companyBusinessDate()
    );

    await client.query(
      `UPDATE driver_finance.settlement_lines
          SET is_active = false, updated_at = now()
        WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid
          AND is_active IS DISTINCT FROM false`,
      [id, operatingCompanyId]
    );

    const flipped = await client.query(
      `UPDATE driver_finance.driver_settlements
          SET status = 'cancelled', reversed_at = now(), reversed_by_user_id = $3::uuid,
              reversal_reason = $4, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'cancelled'
        RETURNING id::text`,
      [id, operatingCompanyId, actorUserId, reason.trim()]
    );
    if (!flipped.rows[0]) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Settlement reverse race lost" };
    }

    if (current.paid_via_bank_txn_id) {
      await unmatchBankTransactionById(client as never, operatingCompanyId, current.paid_via_bank_txn_id, {
        userId: actorUserId,
        reason: `settlement reversal (bulk): ${id}`,
      });
      await client.query(
        `UPDATE driver_finance.driver_settlements SET paid_via_bank_txn_id = NULL WHERE id = $1::uuid`,
        [id]
      );
    }

    await appendCrudAudit(
      client,
      actorUserId,
      "driver_finance.driver_settlement.reversed",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: id,
        operating_company_id: operatingCompanyId,
        reason: reason.trim(),
        before_status: current.status,
        after_status: "cancelled",
        gl_reversal_result: reversal.result,
        gl_run_id: reversal.run_id,
        via: "settlements-bulk.routes",
        bulk_call_id: bulkCallId,
      },
      "warning",
      "SETL-NO-VOID-PATH-01"
    );
    await appendBulkCrudAudit(client, actorUserId, "settlement", "reverse", bulkCallId, {
      resource_id: id,
      resource_type: "driver_finance.driver_settlements",
      operating_company_id: operatingCompanyId,
      reason: reason.trim(),
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "settlement_reverse_failed";
    return { ok: false, code: "E_REVERSE_FAILED", message };
  }
}

export async function registerSettlementsBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/driver-finance/settlements/bulk-update",
    domain: "driver-finance",
    resource: "settlements",
    entityType: "settlement",
    requireReasonActions: ["reverse"],
    atomicFailStopActions: ["reverse"],
    actionRoleGate: (role, action) => {
      if (action !== "reverse") return { ok: true };
      if (!canVoidCancel(role)) {
        return {
          ok: false,
          code: "E_FORBIDDEN",
          message: "Owner, Administrator, or Accountant required to reverse settlements",
        };
      }
      return { ok: true };
    },
    actionMap: {
      reverse: emptyPayloadSchema,
    },
    perEntityHandler: handleSettlementBulk,
  });
}

export default fp(
  async (app) => {
    await registerSettlementsBulkRoutes(app);
  },
  { name: "driver-finance.registerSettlementsBulkRoutes" }
);
