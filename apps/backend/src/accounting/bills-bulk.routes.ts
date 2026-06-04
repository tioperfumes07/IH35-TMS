import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";

const billStatusSchema = z.enum(["open", "partial", "paid", "voided"]);

const setStatusPayloadSchema = z.object({
  status: billStatusSchema,
});

const markScheduledPayloadSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const markPaidPayloadSchema = z.object({
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(["check", "ach", "wire", "cash", "credit_card"]),
  check_number: z.string().trim().max(80).optional(),
});

type BillBulkPayload =
  | z.infer<typeof setStatusPayloadSchema>
  | z.infer<typeof markScheduledPayloadSchema>
  | z.infer<typeof markPaidPayloadSchema>;

function storageStatusForPaid(amountCents: number, paidCents: number): string {
  if (paidCents <= 0) return "open";
  if (paidCents >= amountCents) return "paid";
  return "partial";
}

async function handleBillBulk(ctx: BulkPerEntityContext<BillBulkPayload>): Promise<BulkPerEntityResult> {
  const { id, action, payload, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;

  const oldRes = await client.query(
    `
      SELECT *
      FROM accounting.bills
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const oldRow = oldRes.rows[0] as Record<string, unknown> | undefined;
  if (!oldRow) {
    return { ok: false, code: "E_NOT_FOUND", message: "Bill not found" };
  }
  if (oldRow.revoked_at) {
    return { ok: false, code: "E_STATE_INVALID", message: "Bill is voided" };
  }

  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "accounting.bills",
    operating_company_id: operatingCompanyId,
    reason: reason ?? null,
  };

  if (action === "set_status") {
    const statusPayload = payload as z.infer<typeof setStatusPayloadSchema>;
    if (statusPayload.status === "voided" && Number(oldRow.paid_cents ?? 0) > 0) {
      return { ok: false, code: "E_STATE_INVALID", message: "Bill has payments and cannot be voided via bulk" };
    }

    const storageStatus =
      statusPayload.status === "voided"
        ? "void"
        : statusPayload.status === "open"
          ? "open"
          : statusPayload.status;

    const updateRes = await client.query(
      `
        UPDATE accounting.bills
        SET status = $3,
            revoked_at = CASE WHEN $3 = 'void' THEN COALESCE(revoked_at, now()) ELSE revoked_at END,
            revoked_reason = CASE WHEN $3 = 'void' THEN $4 ELSE revoked_reason END,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, storageStatus, reason ?? null]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Bill status update failed" };
    }
    auditPayload.changes = buildPatchChanges({ status: statusPayload.status }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else if (action === "mark_scheduled") {
    const scheduledPayload = payload as z.infer<typeof markScheduledPayloadSchema>;
    if (String(oldRow.status) === "paid") {
      return { ok: false, code: "E_STATE_INVALID", message: "Paid bill cannot be scheduled" };
    }

    const updateRes = await client.query(
      `
        UPDATE accounting.bills
        SET due_date = $3::date,
            memo = CASE
              WHEN memo IS NULL OR memo = '' THEN $4
              WHEN memo LIKE 'SCHEDULED:%' THEN $4
              ELSE memo || ' | ' || $4
            END,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, scheduledPayload.scheduled_date, `SCHEDULED:${scheduledPayload.scheduled_date}`]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Bill mark scheduled failed" };
    }
    auditPayload.changes = buildPatchChanges(
      { scheduled_date: scheduledPayload.scheduled_date, due_date: scheduledPayload.scheduled_date },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else if (action === "mark_paid") {
    const paidPayload = payload as z.infer<typeof markPaidPayloadSchema>;
    if (String(oldRow.status) === "paid") {
      return { ok: false, code: "E_ALREADY_PAID", message: "Bill is already paid" };
    }
    if (paidPayload.payment_method === "check" && !paidPayload.check_number?.trim()) {
      return { ok: false, code: "E_CHECK_REQUIRED", message: "Check number required for check payments" };
    }

    const amountCents = Number(oldRow.amount_cents ?? 0);
    const paidCents = Number(oldRow.paid_cents ?? 0);
    const remaining = amountCents - paidCents;
    if (remaining <= 0) {
      return { ok: false, code: "E_STATE_INVALID", message: "Bill has no remaining balance" };
    }

    await client.query(
      `
        INSERT INTO accounting.bill_payments (
          operating_company_id,
          bill_id,
          vendor_id,
          payment_date,
          amount_cents,
          amount,
          payment_method,
          check_number,
          status,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'posted',$9,now(),now())
      `,
      [
        operatingCompanyId,
        id,
        oldRow.vendor_id,
        paidPayload.paid_at,
        remaining,
        remaining / 100,
        paidPayload.payment_method,
        paidPayload.check_number ?? null,
        actorUserId,
      ]
    );

    const newPaidCents = paidCents + remaining;
    const updateRes = await client.query(
      `
        UPDATE accounting.bills
        SET paid_cents = $3,
            paid_amount = $4,
            status = $5,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, newPaidCents, newPaidCents / 100, storageStatusForPaid(amountCents, newPaidCents)]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Bill mark paid failed" };
    }
    auditPayload.changes = buildPatchChanges(
      { status: "paid", paid_at: paidPayload.paid_at, payment_method: paidPayload.payment_method },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }

  await appendBulkCrudAudit(client, actorUserId, "bill", action, bulkCallId, auditPayload);
  return { ok: true };
}

export async function registerBillsBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/accounting/bills/bulk-update",
    domain: "accounting",
    resource: "bills",
    entityType: "bill",
    requireReasonActions: ["set_status", "mark_paid"],
    destructiveActions: ["set_status", "mark_paid"],
    actionMap: {
      set_status: setStatusPayloadSchema,
      mark_scheduled: markScheduledPayloadSchema,
      mark_paid: markPaidPayloadSchema,
    },
    perEntityHandler: handleBillBulk,
  });
}

export default fp(async (app) => {
  await registerBillsBulkRoutes(app);
}, { name: "accounting.registerBillsBulkRoutes" });
