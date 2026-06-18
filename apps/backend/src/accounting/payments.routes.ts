import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { nextPaymentDisplayId } from "./display-id.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";

const paymentMethodSchema = z.enum([
  "ach",
  "wire",
  "check",
  "cash",
  "factoring_advance",
  "factoring_reserve",
  "credit_card",
  "other",
]);

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["active", "voided", "all"]).default("active"),
  customer_id: z.string().uuid().optional(),
  payment_method: paymentMethodSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBodySchema = z.object({
  customer_id: z.string().uuid(),
  payment_method: paymentMethodSchema,
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(200).optional(),
  amount_cents: z.coerce.number().int().positive(),
  deposited_to_account_id: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(5000).optional(),
  // Draft id for create-time payment attachments (check/ACH/wire confirmations); reconciled onto the
  // real payment id in the same txn (Option B inc 2 — docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md).
  attachment_draft_id: z.string().uuid().optional().nullable(),
  apply_to: z
    .array(
      z.object({
        invoice_id: z.string().uuid(),
        amount_cents: z.coerce.number().int().positive(),
      })
    )
    .optional()
    .default([]),
});

const voidBodySchema = z.object({
  void_reason: z.string().trim().min(3).max(500),
});

async function fetchPaymentDetail(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  paymentId: string
) {
  const paymentRes = await client.query(
    `
      SELECT
        p.*,
        c.customer_name
      FROM accounting.payments p
      JOIN mdata.customers c ON c.id = p.customer_id
      WHERE p.id = $1
      LIMIT 1
    `,
    [paymentId]
  );
  const payment = paymentRes.rows[0] ?? null;
  if (!payment) return null;

  const applicationsRes = await client.query(
    `
      SELECT
        pa.id,
        pa.payment_id,
        pa.invoice_id,
        pa.target_kind,
        pa.target_id,
        pa.amount_cents,
        pa.amount_applied,
        pa.applied_at,
        i.display_id AS invoice_display_id,
        i.amount_open_cents AS invoice_amount_open_cents
      FROM accounting.payment_applications pa
      LEFT JOIN accounting.invoices i ON i.id = pa.invoice_id
      WHERE pa.payment_id = $1
      ORDER BY pa.applied_at DESC
    `,
    [paymentId]
  );

  return {
    ...payment,
    applications: applicationsRes.rows,
  };
}

export async function registerPaymentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const q = query.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = ["p.operating_company_id = $1"];
      const values: unknown[] = [q.operating_company_id];

      if (q.status === "active") where.push("p.voided_at IS NULL");
      if (q.status === "voided") where.push("p.voided_at IS NOT NULL");
      if (q.customer_id) {
        values.push(q.customer_id);
        where.push(`p.customer_id = $${values.length}`);
      }
      if (q.payment_method) {
        values.push(q.payment_method);
        where.push(`p.payment_method = $${values.length}`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`p.payment_date >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`p.payment_date <= $${values.length}::date`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(p.display_id ILIKE $${idx} OR c.customer_name ILIKE $${idx})`);
      }

      const countRes = await client.query(
        `
          SELECT COUNT(*)::int AS total
          FROM accounting.payments p
          JOIN mdata.customers c ON c.id = p.customer_id
          WHERE ${where.join(" AND ")}
        `,
        values
      );

      values.push(q.limit);
      values.push(q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            p.*,
            c.customer_name
          FROM accounting.payments p
          JOIN mdata.customers c ON c.id = p.customer_id
          WHERE ${where.join(" AND ")}
          ORDER BY p.payment_date DESC, p.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? 0),
      };
    });

    return payload;
  });

  app.get("/api/v1/accounting/payments/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return fetchPaymentDetail(client, params.data.id);
    });

    if (!detail) return reply.code(404).send({ error: "payment_not_found" });
    return detail;
  });

  app.post("/api/v1/accounting/payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const sumApplied = (body.data.apply_to ?? []).reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    if (sumApplied > body.data.amount_cents) {
      return reply.code(400).send({ error: "payment_apply_exceeds_total" });
    }

    const duplicateIds = new Set<string>();
    for (const row of body.data.apply_to ?? []) {
      if (duplicateIds.has(row.invoice_id)) return reply.code(400).send({ error: "duplicate_invoice_in_apply_to" });
      duplicateIds.add(row.invoice_id);
    }

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const customerRes = await client.query(
        `
          SELECT id
          FROM mdata.customers
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [body.data.customer_id, query.data.operating_company_id]
      );
      if (!customerRes.rows[0]) return { code: 404 as const, error: "customer_not_found" };

      const displayId = await nextPaymentDisplayId(client, query.data.operating_company_id, new Date(`${body.data.payment_date}T00:00:00.000Z`));

      const paymentRes = await client.query(
        `
          INSERT INTO accounting.payments (
            operating_company_id,
            customer_id,
            display_id,
            payment_method,
            payment_date,
            reference,
            amount_cents,
            deposited_to_account_id,
            notes,
            created_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id, display_id, amount_unapplied_cents
        `,
        [
          query.data.operating_company_id,
          body.data.customer_id,
          displayId,
          body.data.payment_method,
          body.data.payment_date,
          body.data.reference ?? null,
          body.data.amount_cents,
          body.data.deposited_to_account_id ?? "ops_checking",
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const payment = paymentRes.rows[0] as { id: string; display_id: string; amount_unapplied_cents: number } | undefined;
      if (!payment?.id) return { code: 500 as const, error: "payment_create_failed" };
      // Option B inc 2: link create-time draft attachments (check/ACH/wire confirmations) to the real
      // payment id, atomically in this txn.
      await reassignDraftAttachments(client, {
        operatingCompanyId: query.data.operating_company_id,
        entityType: "payment",
        draftId: body.data.attachment_draft_id,
        newId: payment.id,
      });

      let applicationsCount = 0;
      for (const applyRow of body.data.apply_to ?? []) {
        const invoiceRes = await client.query(
          `
            SELECT id, amount_open_cents, status
            FROM accounting.invoices
            WHERE id = $1
              AND operating_company_id = $2
              AND customer_id = $3
            LIMIT 1
          `,
          [applyRow.invoice_id, query.data.operating_company_id, body.data.customer_id]
        );
        const invoice = invoiceRes.rows[0] as { id: string; amount_open_cents: number; status: string } | null;
        if (!invoice) return { code: 404 as const, error: "invoice_not_found_for_payment_customer" };
        if (!["sent", "partial"].includes(String(invoice.status))) return { code: 409 as const, error: "invoice_not_open_for_payment" };
        if (Number(applyRow.amount_cents) > Number(invoice.amount_open_cents ?? 0)) return { code: 400 as const, error: "apply_amount_exceeds_invoice_open" };

        await client.query(
          `
            INSERT INTO accounting.payment_applications (
              operating_company_id,
              payment_id,
              invoice_id,
              target_kind,
              target_id,
              amount_cents,
              amount_applied,
              applied_by_user_id,
              applied_by_user_uuid
            ) VALUES ($1,$2,$3,'invoice',$3,$4,$5,$6,$6)
          `,
          [
            query.data.operating_company_id,
            payment.id,
            applyRow.invoice_id,
            applyRow.amount_cents,
            applyRow.amount_cents / 100,
            user.uuid,
          ]
        );
        applicationsCount += 1;
      }

      const refreshedRes = await client.query(
        `SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`,
        [payment.id]
      );
      const refreshed = refreshedRes.rows[0] ?? { amount_unapplied_cents: 0 };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_recorded",
        {
          resource_type: "accounting.payments",
          resource_id: payment.id,
          operating_company_id: query.data.operating_company_id,
          customer_id: body.data.customer_id,
          display_id: payment.display_id,
          applications_count: applicationsCount,
        },
        "info",
        "P3-T11.20.3-PAYMENT-RECORDING"
      );

      return {
        code: 201 as const,
        data: {
          id: payment.id,
          display_id: payment.display_id,
          amount_unapplied_cents: Number(refreshed.amount_unapplied_cents ?? 0),
          applications_count: applicationsCount,
        },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "payment.created",
        entity_id: (result as { data?: { id?: string } })?.data?.id ?? "",
        entity_type: "payment",
        source_table: "accounting.payments",
      })
    ).catch(() => undefined);
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/accounting/payments/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const paymentRes = await client.query(
        `
          SELECT *
          FROM accounting.payments
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const payment = paymentRes.rows[0] ?? null;
      if (!payment) return { code: 404 as const, error: "payment_not_found" };
      if (payment.voided_at) return { code: 409 as const, error: "payment_already_voided" };

      await client.query(
        `
          UPDATE accounting.payments
          SET voided_at = now(),
              voided_by_user_id = $2,
              void_reason = $3
          WHERE id = $1
        `,
        [params.data.id, user.uuid, body.data.void_reason]
      );

      await client.query(`DELETE FROM accounting.payment_applications WHERE payment_id = $1`, [params.data.id]);

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_voided",
        {
          resource_type: "accounting.payments",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          void_reason: body.data.void_reason,
        },
        "warning",
        "P3-T11.20.3-PAYMENT-RECORDING"
      );

      const detail = await fetchPaymentDetail(client, params.data.id);
      return { code: 200 as const, data: detail };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "payment.voided",
        entity_id: params.data.id,
        entity_type: "payment",
        source_table: "accounting.payments",
        payload: { void_reason: body.data.void_reason ?? null },
      })
    ).catch(() => undefined);
    return result.data;
  });
}


export default fp(async (app) => {
  await registerPaymentsRoutes(app);
}, { name: "accounting.registerPaymentsRoutes" });
