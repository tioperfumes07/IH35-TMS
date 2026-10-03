import { openAndRunIntake } from "../driver-finance/feed-gate/feed-gate.service.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueAccountingOutbox } from "./outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { assertBankAccountUsable } from "../banking/bank-account-visibility.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { getAppliedVendorCreditsCents, getAppliedBillPaymentApplicationsCents } from "./bills.service.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
import { isBillPaymentGlPostingEnabled } from "./bill-payment-gl.service.js";
import { resolveVendorCreditDisplayId } from "./display-id.js";

const vendorIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const paymentMethodSchema = z.enum(["check", "ach", "wire", "cash", "credit_card"]);

const listVendorBillPaymentsQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createVendorBillPaymentBodySchema = z.object({
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  payment_method: paymentMethodSchema,
  bank_account_id: z.string().uuid().optional(),
  reference_number: z.string().trim().max(120).optional(),
  check_number: z.string().trim().max(80).optional(),
  memo: z.string().trim().max(2000).optional(),
  applications: z
    .array(
      z.object({
        bill_id: z.string().uuid(),
        amount_cents: z.coerce.number().int().positive(),
      })
    )
    .min(1),
});

export type VendorBillPaymentBatchInput = {
  paid_at: string;
  amount_cents: number;
  payment_method: "check" | "ach" | "wire" | "cash" | "credit_card";
  bank_account_id?: string;
  reference_number?: string;
  check_number?: string;
  memo?: string;
  applications: Array<{ bill_id: string; amount_cents: number }>;
};

export type VendorBillPaymentBatchResult =
  | {
      code: 201;
      data: {
        payment_batch_id: string;
        bill_payment_ids: string[];
        vendor_credit_id?: string | null;
        vendor_credit_display_id?: string | null;
        overpay_cents?: number;
      };
    }
  | { code: 400 | 404 | 409 | 500; error: string };

type QueryClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> };

function storageStatusForPaid(total: number, paid: number): string {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partially_paid";
}

function billAmountCents(row: { amount_cents: unknown; total_amount: unknown }) {
  return Number(row.amount_cents ?? Math.round(Number(row.total_amount ?? 0) * 100));
}

function billPaidCents(row: { paid_cents: unknown; paid_amount: unknown; status: unknown; amount_cents: unknown; total_amount: unknown }) {
  const amount = billAmountCents(row);
  if (String(row.status) === "paid") return amount;
  return Number(row.paid_cents ?? Math.round(Number(row.paid_amount ?? 0) * 100));
}

async function updateBankBalance(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount?: number }> },
  operatingCompanyId: string,
  bankAccountId: string,
  deltaCents: number
) {
  const res = await client.query(
    `
      UPDATE banking.bank_accounts
      SET current_balance_cents = current_balance_cents + $3,
          updated_at = now()
      WHERE id = $1
        AND operating_company_id = $2::uuid
    `,
    [bankAccountId, operatingCompanyId, deltaCents]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new Error("bank_account_not_found_for_payment");
  }
}

// ACCT-F5582: POST /:id/bill-payments directly debits banking.bank_accounts.current_balance_cents
// (updateBankBalance below) and marks real vendor bills as paid -- yet had no role gate at all, any
// authenticated company member could fabricate a bill-payment record that deducts money from the
// tracked bank balance. Reuses the canonical void/cancel executor role set
// (Owner/Administrator/Accountant, Jorge-locked 2026-06-29) since recording a disbursement is the
// same tier of financial-executor operation, not because this is a void/cancel action.
function requirePaymentWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "recording a vendor bill payment requires an accounting role" });
    return false;
  }
  return true;
}

/**
 * R-172 step 5 -- the core "apply a payment across N bills, atomically, as one batch" logic, extracted
 * verbatim from this file's own POST /:id/bill-payments handler so the check engine's "Add" (open
 * bills -> Bill Payment (Check)) drawer reuses the SAME real engine instead of a second/third
 * implementation. checks.routes.ts's new POST /api/v1/checks/pay-bills calls this exact function,
 * inside its OWN withCompanyScope(...) transaction (so a check-number-registry reservation can share
 * the same atomic unit as the applications it protects) -- no new GL math, no new poster, the identical
 * postSourceTransactionInClientTx('bill_payment') call this route has always made.
 *
 * NOTE (disclosed, not fixed here -- out of this step's lane): a second, separately-implemented
 * multi-bill batch writer also exists at POST /api/v1/ap/bill-payments
 * (apps/backend/src/ap/payment-application.routes.ts), reachable from the Bills page's
 * BillPaymentModal.tsx. This function does not consolidate that pre-existing duplication; it reuses
 * THIS route's own engine (the one this file already owns) rather than adding a third copy.
 */
export async function applyVendorBillPaymentBatch(
  client: QueryClient,
  operatingCompanyId: string,
  vendorId: string,
  actorUserId: string,
  body: VendorBillPaymentBatchInput
): Promise<VendorBillPaymentBatchResult> {
  const sumApplied = body.applications.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
  if (sumApplied > body.amount_cents) return { code: 400, error: "payment_apply_exceeds_total" };

  const dup = new Set<string>();
  for (const row of body.applications) {
    if (dup.has(row.bill_id)) return { code: 400, error: "duplicate_bill_in_applications" };
    dup.add(row.bill_id);
  }

  if (body.payment_method === "check") {
    const checkNumber = body.check_number?.trim() || body.reference_number?.trim();
    if (!checkNumber) return { code: 400, error: "check_number_required" };
  }

  const glPostingEnabled = await isBillPaymentGlPostingEnabled(operatingCompanyId, actorUserId);

  if (body.bank_account_id) {
    const acctProbe = await client.query(
      `SELECT id FROM banking.bank_accounts WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [body.bank_account_id, operatingCompanyId]
    );
    if (!acctProbe.rows[0]) return { code: 400, error: "bank_account_not_found_for_payment" };
    if (!(await assertBankAccountUsable(client as never, body.bank_account_id, operatingCompanyId))) {
      return { code: 400, error: "bank_account_not_found_for_payment" };
    }
  }

  const batchId = randomUUID();
  const paymentIds: string[] = [];
  const checkNumberForInsert = body.payment_method === "check" ? body.check_number?.trim() || body.reference_number?.trim() || null : null;

  for (const applyRow of body.applications) {
    const billRes = await client.query(
      `
        SELECT *
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [applyRow.bill_id, operatingCompanyId]
    );
    const billRaw = billRes.rows[0] as Record<string, unknown> | undefined;
    if (!billRaw) return { code: 404, error: "bill_not_found" };

    const vendorKey = String(billRaw.vendor_id ?? billRaw.vendor_uuid ?? "");
    if (!vendorKey || vendorKey !== vendorId) return { code: 409, error: "bill_vendor_mismatch" };

    if (billRaw.revoked_at) return { code: 409, error: "bill_voided" };

    const amount = billAmountCents(billRaw as { amount_cents: unknown; total_amount: unknown });
    const paid = billPaidCents(billRaw as { paid_cents: unknown; paid_amount: unknown; status: unknown; amount_cents: unknown; total_amount: unknown });
    const appliedCreditsCents = await getAppliedVendorCreditsCents(client as never, applyRow.bill_id, operatingCompanyId);
    const appliedPaymentApplicationsCents = await getAppliedBillPaymentApplicationsCents(client as never, applyRow.bill_id, operatingCompanyId);
    const remaining = amount - paid - appliedCreditsCents - appliedPaymentApplicationsCents;
    if (remaining <= 0) return { code: 409, error: "bill_already_paid" };
    if (applyRow.amount_cents > remaining) return { code: 400, error: "payment_exceeds_remaining_balance" };

    const paymentRes = await client.query(
      `
        INSERT INTO accounting.bill_payments (
          operating_company_id,
          bill_id,
          vendor_id,
          payment_date,
          amount_cents,
          amount,
          payment_method,
          from_bank_account_id,
          check_number,
          reference_number,
          memo,
          status,
          created_by_user_id,
          created_at,
          updated_at,
          payment_batch_id,
          payment_source_kind,
          source_bank_transaction_id,
          is_sample_data
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'posted',$12,now(),now(),$13,'manual',$14,
          COALESCE((SELECT b.is_sample_data FROM accounting.bills b WHERE b.id = $2::uuid AND b.operating_company_id = $1::uuid), false))
        RETURNING id
      `,
      [
        operatingCompanyId,
        applyRow.bill_id,
        vendorId,
        body.paid_at,
        applyRow.amount_cents,
        applyRow.amount_cents / 100,
        body.payment_method,
        body.bank_account_id ?? null,
        checkNumberForInsert,
        body.reference_number ?? null,
        body.memo ?? null,
        actorUserId,
        batchId,
        null,
      ]
    );
    const paymentId = paymentRes.rows[0]?.id as string | undefined;
    if (!paymentId) return { code: 500, error: "bill_payment_insert_failed" };
    paymentIds.push(paymentId);

    const newPaidCents = paid + applyRow.amount_cents;
    const storageStatus = storageStatusForPaid(amount, newPaidCents);
    await client.query(
      `
        UPDATE accounting.bills
        SET paid_cents = $2,
            paid_amount = $3,
            status = $4,
            updated_at = now()
        WHERE id = $1
      `,
      [applyRow.bill_id, newPaidCents, newPaidCents / 100, storageStatus]
    );

    const isQboBill = String(billRaw.source_system ?? "").toLowerCase() === "qbo";
    if (glPostingEnabled && !isQboBill) {
      await postSourceTransactionInClientTx(
        client as never,
        {
          operating_company_id: operatingCompanyId,
          source_transaction_type: "bill_payment",
          source_transaction_id: paymentId,
        },
        { userId: actorUserId }
      );
    }

    await enqueueAccountingOutbox(client as never, operatingCompanyId, "qbo.vendor_bill_payment.created", "vendor_bill_payment", paymentId, {
      bill_payment_id: paymentId,
      bill_id: applyRow.bill_id,
      vendor_id: vendorId,
      amount_cents: applyRow.amount_cents,
      payment_date: body.paid_at,
      payment_batch_id: batchId,
    });
  }

  if (body.bank_account_id) {
    await updateBankBalance(client, operatingCompanyId, body.bank_account_id, -Math.abs(body.amount_cents));
  }

  // BANK-F91038 — Amount to Credit: cash left the bank above applied bills → vendor credit +
  // Dr A/P / Cr cash JE (same accounts as bill_payment) + spine in the same posting txn.
  // Mirrors AR customer_payment overpay → credit_memo subledger; GL is the cash/AP pair only —
  // no new GL math. Manual vendor credits (no source_bill_payment_id) stay subledger-only.
  const overpayCents = body.amount_cents - sumApplied;
  let vendorCreditId: string | null = null;
  let vendorCreditDisplayId: string | null = null;
  if (overpayCents > 0) {
    if (!body.bank_account_id) {
      return { code: 400, error: "bank_account_required_for_overpayment_credit" };
    }
    if (paymentIds.length === 0) {
      return { code: 400, error: "overpayment_requires_at_least_one_application" };
    }
    const sourceBillPaymentId = paymentIds[0]!;
    const displayId = await resolveVendorCreditDisplayId(
      client as never,
      operatingCompanyId,
      new Date(`${body.paid_at}T00:00:00.000Z`)
    );
    const creditIns = await client.query(
      `
        INSERT INTO accounting.vendor_credits (
          operating_company_id,
          vendor_id,
          display_id,
          status,
          issue_date,
          amount_cents,
          notes,
          created_by_user_id,
          source_bill_payment_id
        ) VALUES (
          $1::uuid, $2, $3, 'open', $4::date, $5,
          $6, $7::uuid, $8::uuid
        )
        RETURNING id::text, display_id
      `,
      [
        operatingCompanyId,
        vendorId,
        displayId,
        body.paid_at,
        overpayCents,
        `Auto-created from bill-payment overpay on batch ${batchId} (source bill_payment ${sourceBillPaymentId})`,
        actorUserId,
        sourceBillPaymentId,
      ]
    );
    vendorCreditId = (creditIns.rows[0]?.id as string | undefined) ?? null;
    vendorCreditDisplayId = (creditIns.rows[0]?.display_id as string | undefined) ?? null;
    if (!vendorCreditId) return { code: 500, error: "vendor_credit_create_failed" };

    if (glPostingEnabled) {
      await postSourceTransactionInClientTx(
        client as never,
        {
          operating_company_id: operatingCompanyId,
          source_transaction_type: "vendor_credit",
          source_transaction_id: vendorCreditId,
          posting_purpose: "initial_post",
        },
        { userId: actorUserId }
      );
    }

    await appendCrudAudit(client as never, actorUserId, "accounting.vendor_credits.created.from_bill_payment_overpay", {
      resource_type: "accounting.vendor_credits",
      resource_id: vendorCreditId,
      display_id: vendorCreditDisplayId,
      operating_company_id: operatingCompanyId,
      vendor_id: vendorId,
      amount_cents: overpayCents,
      source_bill_payment_id: sourceBillPaymentId,
      payment_batch_id: batchId,
    });
  }

  await appendCrudAudit(client as never, actorUserId, "accounting.vendor_bill_payment_batch.created.p6_t11204", {
    resource_type: "accounting.bill_payments",
    resource_id: batchId,
    operating_company_id: operatingCompanyId,
    vendor_id: vendorId,
    payment_ids: paymentIds,
    applications: body.applications.length,
    overpay_cents: overpayCents,
    vendor_credit_id: vendorCreditId,
  });

  return {
    code: 201,
    data: {
      payment_batch_id: batchId,
      bill_payment_ids: paymentIds,
      vendor_credit_id: vendorCreditId,
      vendor_credit_display_id: vendorCreditDisplayId,
      overpay_cents: overpayCents,
    },
  };
}

export async function registerVendorBillPaymentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/vendors/:id/bill-payments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = vendorIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listVendorBillPaymentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const groupedWhere = `
        bp.vendor_id = $2
        AND bp.operating_company_id = $1::uuid
        AND bp.revoked_at IS NULL
      `;
      const baseValues: unknown[] = [query.data.operating_company_id, params.data.id];

      const countRes = await client.query(
        `
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT COALESCE(bp.payment_batch_id, bp.id) AS group_id
            FROM accounting.bill_payments bp
            WHERE ${groupedWhere}
            GROUP BY COALESCE(bp.payment_batch_id, bp.id)
          ) x
        `,
        baseValues
      );

      const listValues = [...baseValues, query.data.limit, query.data.offset];
      const limitIdx = listValues.length - 1;
      const offsetIdx = listValues.length;

      const rowsRes = await client.query(
        `
          WITH grouped AS (
            SELECT
              COALESCE(bp.payment_batch_id, bp.id) AS group_id,
              MIN(bp.payment_date)::text AS date,
              SUM(bp.amount_cents)::bigint AS amount_cents,
              MIN(bp.payment_source_kind) AS source_kind,
              MAX(bp.source_bank_transaction_id::text) AS source_bank_transaction_id,
              MAX(bp.qbo_bill_payment_id) AS qbo_bill_payment_id,
              json_agg(
                json_build_object(
                  'bill_id', bp.bill_id,
                  'amount_cents', bp.amount_cents,
                  'bill_number', b.bill_number
                )
                ORDER BY bp.created_at
              ) AS applied_to_bills
            FROM accounting.bill_payments bp
            JOIN accounting.bills b ON b.id = bp.bill_id
             AND b.operating_company_id = bp.operating_company_id
            WHERE ${groupedWhere}
            GROUP BY COALESCE(bp.payment_batch_id, bp.id)
          )
          SELECT *
          FROM grouped
          ORDER BY date DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        listValues
      );

      const payments = rowsRes.rows.map((row: {
        group_id?: string;
        date?: string;
        amount_cents?: string | number;
        source_kind?: string | null;
        qbo_bill_payment_id?: string | null;
      }) => {
        const amount = Number(row.amount_cents ?? 0);
        return {
          id: String(row.group_id ?? ""),
          payment_date: String(row.date ?? ""),
          amount_cents: amount,
          payment_method: row.source_kind ?? undefined,
          amount_applied_cents: amount,
          reference: row.qbo_bill_payment_id ?? null,
        };
      });
      return {
        payments,
        rows: payments,
        total: Number(countRes.rows[0]?.total ?? 0),
      };
    });

    return payload;
  });

  app.post("/api/v1/vendors/:id/bill-payments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;

    const params = vendorIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createVendorBillPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        applyVendorBillPaymentBatch(client, query.data.operating_company_id, params.data.id, user.uuid, body.data)
      );
      if ("error" in result) return reply.code(result.code).send({ error: result.error });
      // FEED GATE (owner law 2026-10-01): one intake per bill payment created (bill, vendor match, paid-from account,
      // posted JE, bank-line match); returned so the Pay Bills screen shows the red rows per payment.
      const feed_gate: Array<{ bill_payment_id: string; intake_id: string; status: string; checks_failed: number; checks_total: number }> = [];
      for (const id of result.data.bill_payment_ids ?? []) {
        try {
          const run = await openAndRunIntake(user.uuid, query.data.operating_company_id, "bill_payment", id);
          feed_gate.push({ bill_payment_id: id, intake_id: run.intake.id, status: run.intake.status, checks_failed: run.intake.checks_failed, checks_total: run.intake.checks_total });
        } catch (intakeErr) {
          // Evidence only; the payment itself already committed through the canonical engine. The intake runs in its
          // own transaction, but its failure is logged — never silently dropped from the feed-gate trail.
          req.log.warn({ err: intakeErr, bill_payment_id: id }, "feed_gate_bill_payment_intake_failed");
        }
      }
      return reply.code(result.code).send({ ...result.data, feed_gate });
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_payment_failed");
      if (message === "bank_account_not_found_for_payment") return reply.code(409).send({ error: message });
      throw error;
    }
  });
}


export default fp(async (app) => {
  await registerVendorBillPaymentsRoutes(app);
}, { name: "accounting.registerVendorBillPaymentsRoutes" });
