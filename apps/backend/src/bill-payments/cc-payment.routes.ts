import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueAccountingOutbox } from "../accounting/outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { buildQboCcBillPaymentPayload } from "./qbo-cc-payment-poster.js";

const createCcPaymentBodySchema = z.object({
  bill_id: z.string().uuid(),
  cc_account_id: z.string().uuid(),
  payment_amount_cents: z.coerce.number().int().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().max(2000).optional(),
});

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

export async function registerCcPaymentRoutes(app: FastifyInstance) {
  app.post("/api/v1/bill-payments/cc", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createCcPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const ccProbe = await client.query(
          `SELECT account_type::text, qbo_account_id FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid AND active = true LIMIT 1`,
          [body.data.cc_account_id, query.data.operating_company_id]
        );
        const ccAccount = ccProbe.rows[0] as { account_type: string; qbo_account_id: string | null } | undefined;
        if (!ccAccount) return { code: 400 as const, error: "cc_account_not_found" as const };
        if (!String(ccAccount.account_type).toLowerCase().includes("credit")) {
          return { code: 400 as const, error: "cc_account_must_be_credit_card_liability" as const };
        }

        const billRes = await client.query(`SELECT * FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`, [
          body.data.bill_id,
          query.data.operating_company_id,
        ]);
        const billRaw = billRes.rows[0] as Record<string, unknown> | undefined;
        if (!billRaw) return { code: 404 as const, error: "bill_not_found" as const };
        if (billRaw.revoked_at) return { code: 409 as const, error: "bill_voided" as const };

        const amount = billAmountCents(billRaw as { amount_cents: unknown; total_amount: unknown });
        const paid = billPaidCents(billRaw as { paid_cents: unknown; paid_amount: unknown; status: unknown; amount_cents: unknown; total_amount: unknown });
        const remaining = amount - paid;
        if (remaining <= 0) return { code: 409 as const, error: "bill_already_paid" as const };
        if (body.data.payment_amount_cents > remaining) return { code: 400 as const, error: "payment_exceeds_remaining_balance" as const };

        const vendorId = String(billRaw.vendor_id ?? billRaw.vendor_uuid ?? "");
        const qboBillId = billRaw.qbo_bill_id ? String(billRaw.qbo_bill_id) : null;

        const paymentRes = await client.query(
          `INSERT INTO accounting.bill_payments (
            operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount,
            payment_method, cc_account_id, memo, status, created_by_user_id, created_at, updated_at, payment_source_kind
          ) VALUES ($1,$2,$3,$4,$5,$6,'cc',$7,$8,'posted',$9,now(),now(),'cc_bill_payment') RETURNING id::text AS id`,
          [
            query.data.operating_company_id,
            body.data.bill_id,
            vendorId,
            body.data.payment_date,
            body.data.payment_amount_cents,
            body.data.payment_amount_cents / 100,
            body.data.cc_account_id,
            body.data.memo ?? null,
            user.uuid,
          ]
        );
        const paymentId = String((paymentRes.rows[0] as { id?: string } | undefined)?.id ?? "");
        if (!paymentId) return { code: 500 as const, error: "bill_payment_insert_failed" as const };

        const newPaidCents = paid + body.data.payment_amount_cents;
        const storageStatus = storageStatusForPaid(amount, newPaidCents);
        await client.query(`UPDATE accounting.bills SET paid_cents = $2, paid_amount = $3, status = $4, updated_at = now() WHERE id = $1::uuid`, [
          body.data.bill_id,
          newPaidCents,
          newPaidCents / 100,
          storageStatus,
        ]);

        let qboBillPaymentId: string | null = null;
        if (qboBillId && ccAccount.qbo_account_id) {
          const vendorQboRes = await client.query(
            `SELECT qbo_id FROM mdata.qbo_vendors WHERE operating_company_id = $1::uuid AND active = true AND (vendor_id::text = $2 OR id::text = $2) ORDER BY mirrored_at DESC NULLS LAST LIMIT 1`,
            [query.data.operating_company_id, vendorId]
          );
          const vendorQboId = (vendorQboRes.rows[0] as { qbo_id?: string } | undefined)?.qbo_id ?? null;
          if (vendorQboId) {
            const qboPayload = buildQboCcBillPaymentPayload({
              vendorQboId,
              ccLiabilityQboAccountId: String(ccAccount.qbo_account_id),
              paymentDate: body.data.payment_date,
              memo: body.data.memo,
              allocations: [{ billId: body.data.bill_id, qboBillId, amountCents: body.data.payment_amount_cents }],
            });
            qboBillPaymentId = `qbo-cc-${randomUUID()}`;
            await client.query(
              `UPDATE accounting.bill_payments SET qbo_bill_payment_id = $3, qbo_idempotency_key = $4, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
              [paymentId, query.data.operating_company_id, qboBillPaymentId, `cc-pay-${paymentId}`]
            );
            await enqueueAccountingOutbox(client, query.data.operating_company_id, "qbo.cc_bill_payment.created", "vendor_bill_payment", paymentId, {
              bill_payment_id: paymentId,
              qbo_payload: qboPayload,
            });
          }
        }

        await appendCrudAudit(client, user.uuid, "accounting.cc_bill_payment.created.closure3", {
          resource_type: "accounting.bill_payments",
          resource_id: paymentId,
          bill_id: body.data.bill_id,
          cc_account_id: body.data.cc_account_id,
          amount_cents: body.data.payment_amount_cents,
        });

        return {
          code: 201 as const,
          data: {
            payment_id: paymentId,
            qbo_billpayment_id: qboBillPaymentId,
            bill_status: storageStatus === "partially_paid" ? "partial" : storageStatus,
          },
        };
      });

      if ("error" in result) return reply.code(result.code).send({ error: result.error });
      return reply.code(result.code).send(result.data);
    } catch (error) {
      return reply.code(500).send({ error: String((error as Error)?.message ?? "cc_bill_payment_failed") });
    }
  });
}

export default fp(async (app) => registerCcPaymentRoutes(app), { name: "bill-payments.registerCcPaymentRoutes" });
