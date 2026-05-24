import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueAccountingOutbox } from "./outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

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
        AND operating_company_id = $2
    `,
    [bankAccountId, operatingCompanyId, deltaCents]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new Error("bank_account_not_found_for_payment");
  }
}

export async function registerVendorBillPaymentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/vendors/:id/bill-payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = vendorIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listVendorBillPaymentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const groupedWhere = `
        bp.vendor_id = $2
        AND bp.operating_company_id = $1
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

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? 0),
      };
    });

    return payload;
  });

  app.post("/api/v1/vendors/:id/bill-payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = vendorIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createVendorBillPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const sumApplied = body.data.applications.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    if (sumApplied > body.data.amount_cents) {
      return reply.code(400).send({ error: "payment_apply_exceeds_total" });
    }

    const dup = new Set<string>();
    for (const row of body.data.applications) {
      if (dup.has(row.bill_id)) return reply.code(400).send({ error: "duplicate_bill_in_applications" });
      dup.add(row.bill_id);
    }

    if (body.data.payment_method === "check") {
      const checkNumber = body.data.check_number?.trim() || body.data.reference_number?.trim();
      if (!checkNumber) return reply.code(400).send({ error: "check_number_required" });
    }

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        if (body.data.bank_account_id) {
          const acctProbe = await client.query(
            `SELECT id FROM banking.bank_accounts WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
            [body.data.bank_account_id, query.data.operating_company_id]
          );
          if (!acctProbe.rows[0]) return { code: 400 as const, error: "bank_account_not_found_for_payment" as const };
        }

        const batchId = randomUUID();
        const paymentIds: string[] = [];
        const checkNumberForInsert =
          body.data.payment_method === "check"
            ? body.data.check_number?.trim() || body.data.reference_number?.trim() || null
            : null;

        for (const applyRow of body.data.applications) {
          const billRes = await client.query(
            `
              SELECT *
              FROM accounting.bills
              WHERE id = $1
                AND operating_company_id = $2
              LIMIT 1
              FOR UPDATE
            `,
            [applyRow.bill_id, query.data.operating_company_id]
          );
          const billRaw = billRes.rows[0] as Record<string, unknown> | undefined;
          if (!billRaw) return { code: 404 as const, error: "bill_not_found" as const };

          const vendorKey = String(billRaw.vendor_id ?? billRaw.vendor_uuid ?? "");
          if (!vendorKey || vendorKey !== params.data.id) return { code: 409 as const, error: "bill_vendor_mismatch" as const };

          if (billRaw.revoked_at) return { code: 409 as const, error: "bill_voided" as const };

          const amount = billAmountCents(billRaw as { amount_cents: unknown; total_amount: unknown });
          const paid = billPaidCents(
            billRaw as { paid_cents: unknown; paid_amount: unknown; status: unknown; amount_cents: unknown; total_amount: unknown }
          );
          const remaining = amount - paid;
          if (remaining <= 0) return { code: 409 as const, error: "bill_already_paid" as const };
          if (applyRow.amount_cents > remaining) return { code: 400 as const, error: "payment_exceeds_remaining_balance" as const };

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
                source_bank_transaction_id
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'posted',$12,now(),now(),$13,'manual',$14)
              RETURNING id
            `,
            [
              query.data.operating_company_id,
              applyRow.bill_id,
              params.data.id,
              body.data.paid_at,
              applyRow.amount_cents,
              applyRow.amount_cents / 100,
              body.data.payment_method,
              body.data.bank_account_id ?? null,
              checkNumberForInsert,
              body.data.reference_number ?? null,
              body.data.memo ?? null,
              user.uuid,
              batchId,
              null,
            ]
          );
          const paymentId = paymentRes.rows[0]?.id as string | undefined;
          if (!paymentId) return { code: 500 as const, error: "bill_payment_insert_failed" as const };
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

          await enqueueAccountingOutbox(client, query.data.operating_company_id, "qbo.vendor_bill_payment.created", "vendor_bill_payment", paymentId, {
            bill_payment_id: paymentId,
            bill_id: applyRow.bill_id,
            vendor_id: params.data.id,
            amount_cents: applyRow.amount_cents,
            payment_date: body.data.paid_at,
            payment_batch_id: batchId,
          });
        }

        if (body.data.bank_account_id) {
          await updateBankBalance(client, query.data.operating_company_id, body.data.bank_account_id, -Math.abs(body.data.amount_cents));
        }

        await appendCrudAudit(client, user.uuid, "accounting.vendor_bill_payment_batch.created.p6_t11204", {
          resource_type: "accounting.bill_payments",
          resource_id: batchId,
          operating_company_id: query.data.operating_company_id,
          vendor_id: params.data.id,
          payment_ids: paymentIds,
          applications: body.data.applications.length,
        });

        return {
          code: 201 as const,
          data: {
            payment_batch_id: batchId,
            bill_payment_ids: paymentIds,
          },
        };
      });

      if ("error" in result) return reply.code(result.code).send({ error: result.error });
      return reply.code(result.code).send(result.data);
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
