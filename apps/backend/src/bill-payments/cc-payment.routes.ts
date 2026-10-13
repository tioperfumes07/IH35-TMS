import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { postBillPaymentGlIfEnabledInClientTx } from "../accounting/bill-payment-gl.service.js";

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
  app.post("/api/v1/bill-payments/cc", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createCcPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const ccProbe = await client.query(
          `SELECT account_type::text, account_subtype::text, account_name::text, qbo_account_id FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
          [body.data.cc_account_id, query.data.operating_company_id]
        );
        const ccAccount = ccProbe.rows[0] as
          | { account_type: string; account_subtype: string | null; account_name: string; qbo_account_id: string | null }
          | undefined;
        if (!ccAccount) return { code: 400 as const, error: "cc_account_not_found" as const };
        // Mirrors CCPaymentModal.tsx's own account-eligibility signal: account_type is always one of the
        // 8 broad CHECK-constrained categories (never literally "credit"), so the real "is this a credit
        // card" signal is account_subtype/account_name, scoped to Liability (never accept a non-liability
        // account, e.g. an Expense account named "credit" something).
        const isCreditCardLiability =
          String(ccAccount.account_type).toLowerCase() === "liability" &&
          (String(ccAccount.account_subtype ?? "").toLowerCase().includes("credit") ||
            String(ccAccount.account_name ?? "").toLowerCase().includes("credit card"));
        if (!isCreditCardLiability) {
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

        const paymentRes = await client.query(
          // ACCT-F353 — derive from the BILL being paid (billRaw.is_sample_data, already fetched
          // above via SELECT *), matching bills.service.ts's own bill_payment writer precedent.
          `INSERT INTO accounting.bill_payments (
            operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount,
            payment_method, cc_account_id, memo, status, created_by_user_id, created_at, updated_at, payment_source_kind, is_sample_data
          ) VALUES ($1,$2,$3,$4,$5,$6,'cc',$7,$8,'posted',$9,now(),now(),'cc_bill_payment',$10) RETURNING id::text AS id`,
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
            Boolean(billRaw.is_sample_data),
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

        // ACCT-F4431380 (Lead 443.137 item 9e; owner ruling — QuickBooks is a READ-ONLY ARCHIVE).
        //   OLD: when the bill carried a qbo_bill_id, this route read mdata.qbo_vendors, stamped a FABRICATED
        //        qbo_bill_payment_id ('qbo-cc-<uuid>' — never issued by QuickBooks) onto the native
        //        accounting.bill_payments row and enqueued a 'qbo.cc_bill_payment.created' outbox event to
        //        push the payment to QuickBooks (no handler consumed it).
        //   NEW: the native payment + GL posting below are the whole write. No QBO id is stamped, nothing
        //        is queued for QuickBooks, and the response reports qbo_billpayment_id: null honestly.
        //   WHY: a native money row must never carry a QuickBooks identity QuickBooks did not issue, and
        //        nothing in the TMS writes to QuickBooks. Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs.
        const qboBillPaymentId: string | null = null;

        // ROUND 363-CC1-B — Dr the bill's payable / Cr the CC-liability account, posted on THIS transaction as the payment
        // is created (it used to post after commit and log a failure, leaving a committed payment with no postings).
        await postBillPaymentGlIfEnabledInClientTx(client as never, query.data.operating_company_id, paymentId, { userId: user.uuid });

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
