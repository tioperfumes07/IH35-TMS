import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { enqueueEmail } from "../email/queue.service.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { nextInvoiceDisplayId } from "./display-id.js";
import { buildInvoiceFromLoad } from "./from-load.js";
import { createExpandedInvoice } from "./invoices.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope, recomputeInvoiceTotals } from "./shared.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = companyQuerySchema.extend({
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
  customer_id: z.string().uuid().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const createBodySchema = z.object({
  customer_id: z.string().uuid(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payment_terms_id: z.string().uuid().optional(),
  internal_notes: z.string().trim().max(5000).optional(),
  customer_notes: z.string().trim().max(5000).optional(),
  currency_code: z.enum(["USD", "MXN"]).optional(),
});

const fromLoadBodySchema = z.object({
  load_id: z.string().uuid(),
});

const expandedInvoiceBodySchema = z.object({
  customer_id: z.string().uuid(),
  bill_to_entity_type: z.enum(["customer", "driver", "vendor", "other"]),
  bill_to_entity_id: z.string().uuid().nullable().optional(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  internal_notes: z.string().trim().max(5000).optional(),
  customer_notes: z.string().trim().max(5000).optional(),
  auto_deduct_settlement: z.boolean().optional(),
});

const patchBodySchema = z
  .object({
    issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    payment_terms_id: z.string().uuid().nullable().optional(),
    internal_notes: z.string().trim().max(5000).nullable().optional(),
    customer_notes: z.string().trim().max(5000).nullable().optional(),
    ar_email_snapshot: z.string().trim().max(200).nullable().optional(),
    ar_phone_snapshot: z.string().trim().max(50).nullable().optional(),
    currency_code: z.enum(["USD", "MXN"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const voidBodySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export async function enrichInvoice(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, invoiceId: string) {
  const invoiceRes = await client.query(
    `
      SELECT
        i.*,
        c.customer_name,
        fa.display_id AS factoring_display_id,
        COALESCE(l.customer_chargeback_requested, false) AS source_load_chargeback_requested,
        l.customer_chargeback_reason AS source_load_chargeback_reason
      FROM accounting.invoices i
      JOIN mdata.customers c ON c.id = i.customer_id
      LEFT JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
      LEFT JOIN mdata.loads l ON l.id = i.source_load_id
      WHERE i.id = $1
      LIMIT 1
    `,
    [invoiceId]
  );
  const invoice = invoiceRes.rows[0] ?? null;
  if (!invoice) return null;
  const linesRes = await client.query(
    `
      SELECT *
      FROM accounting.invoice_lines
      WHERE invoice_id = $1
      ORDER BY display_order ASC, created_at ASC
    `,
    [invoiceId]
  );
  const applicationsRes = await client.query(
    `
      SELECT pa.*, p.display_id AS payment_display_id, p.payment_date
      FROM accounting.payment_applications pa
      JOIN accounting.payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = $1
      ORDER BY pa.applied_at DESC
      LIMIT 50
    `,
    [invoiceId]
  );
  return {
    ...invoice,
    lines: linesRes.rows,
    payment_applications: applicationsRes.rows,
  };
}

export async function registerInvoiceRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/invoices", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const q = query.data;
    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = ["i.operating_company_id = $1"];
      const values: unknown[] = [q.operating_company_id];
      if (q.status) {
        values.push(q.status);
        where.push(`i.status = $${values.length}`);
      }
      if (q.customer_id) {
        values.push(q.customer_id);
        where.push(`i.customer_id = $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(i.display_id ILIKE $${idx} OR c.customer_name ILIKE $${idx})`);
      }
      if (q.from_date) {
        values.push(q.from_date);
        where.push(`i.issue_date >= $${values.length}::date`);
      }
      if (q.to_date) {
        values.push(q.to_date);
        where.push(`i.issue_date <= $${values.length}::date`);
      }
      values.push(q.limit);
      const limitIdx = values.length;
      const res = await client.query(
        `
          SELECT
            i.*,
            c.customer_name,
            fa.display_id AS factoring_display_id,
            COALESCE(l.customer_chargeback_requested, false) AS source_load_chargeback_requested,
            l.customer_chargeback_reason AS source_load_chargeback_reason,
            (
              SELECT COUNT(*)
              FROM accounting.invoice_lines l
              WHERE l.invoice_id = i.id
            )::int AS line_count
          FROM accounting.invoices i
          JOIN mdata.customers c ON c.id = i.customer_id
          LEFT JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
          LEFT JOIN mdata.loads l ON l.id = i.source_load_id
          WHERE ${where.join(" AND ")}
          ORDER BY i.issue_date DESC, i.created_at DESC
          LIMIT $${limitIdx}
        `,
        values
      );
      return res.rows;
    });
    return { invoices: rows };
  });

  app.get("/api/v1/accounting/invoices/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return enrichInvoice(client, params.data.id);
    });
    if (!detail) return reply.code(404).send({ error: "invoice_not_found" });
    return detail;
  });

  app.post("/api/v1/accounting/invoices", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const customerRes = await client.query(
        `
          SELECT c.id, c.payment_terms_id, c.ar_email, c.ar_phone, pt.terms_name, pt.days_until_due
          FROM mdata.customers c
          LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
          WHERE c.id = $1
            AND c.operating_company_id = $2
          LIMIT 1
        `,
        [body.data.customer_id, query.data.operating_company_id]
      );
      const customer = customerRes.rows[0] ?? null;
      if (!customer) return { code: 404 as const, error: "customer_not_found" };

      const issueDate = body.data.issue_date ?? new Date().toISOString().slice(0, 10);
      const termsDays = Number(customer.days_until_due ?? 30);
      const dueDate = body.data.due_date ?? new Date(new Date(`${issueDate}T00:00:00.000Z`).getTime() + termsDays * 86400000).toISOString().slice(0, 10);
      const displayId = await nextInvoiceDisplayId(client, query.data.operating_company_id, new Date(`${issueDate}T00:00:00.000Z`));
      const insertRes = await client.query(
        `
          INSERT INTO accounting.invoices (
            operating_company_id,
            customer_id,
            display_id,
            status,
            issue_date,
            due_date,
            payment_terms_id,
            payment_terms_label,
            payment_terms_days,
            ar_email_snapshot,
            ar_phone_snapshot,
            internal_notes,
            customer_notes,
            currency_code,
            created_by_user_id,
            updated_by_user_id
          ) VALUES (
            $1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14
          )
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          body.data.customer_id,
          displayId,
          issueDate,
          dueDate,
          body.data.payment_terms_id ?? customer.payment_terms_id ?? null,
          customer.terms_name ?? null,
          termsDays,
          customer.ar_email ?? null,
          customer.ar_phone ?? null,
          body.data.internal_notes ?? null,
          body.data.customer_notes ?? null,
          body.data.currency_code ?? "USD",
          user.uuid,
        ]
      );
      const invoiceId = String(insertRes.rows[0]?.id ?? "");
      if (!invoiceId) return { code: 500 as const, error: "invoice_create_failed" };
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.invoices.created",
        {
          resource_type: "accounting.invoices",
          resource_id: invoiceId,
          operating_company_id: query.data.operating_company_id,
          display_id: displayId,
        },
        "info",
        "P3-T11.20.2-INVOICE-FLOW"
      );
      await enqueueTmsInvoicePushRequested(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: invoiceId,
        operation: "create",
      });
      const detail = await enrichInvoice(client, invoiceId);
      return { code: 201 as const, data: detail };
    });
    if ("error" in created) return reply.code(created.code).send({ error: created.error });
    return reply.code(created.code).send(created.data);
  });

  app.post("/api/v1/accounting/invoices/from-load", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = fromLoadBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const built = await buildInvoiceFromLoad(client, {
          userId: user.uuid,
          operatingCompanyId: query.data.operating_company_id,
          loadId: body.data.load_id,
        });
        const invoiceId = String((built.invoice as { id?: unknown }).id ?? "");
        if (invoiceId) {
          await enqueueTmsInvoicePushRequested(client, {
            operating_company_id: query.data.operating_company_id,
            invoice_id: invoiceId,
            operation: built.idempotent ? "update" : "create",
          });
        }
        return built;
      });
      return reply.code(result.idempotent ? 200 : 201).send(result);
    } catch (error) {
      if ((error as { code?: string }).code === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
      throw error;
    }
  });

  const registerExpandedRoute = (path: string, invoiceType: "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual") => {
    app.post(path, async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      const body = expandedInvoiceBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
          const created = await createExpandedInvoice(client, {
            operatingCompanyId: query.data.operating_company_id,
            userId: user.uuid,
            invoiceType,
            customerId: body.data.customer_id,
            billToEntityType: body.data.bill_to_entity_type,
            billToEntityId: body.data.bill_to_entity_id ?? null,
            issueDate: body.data.issue_date,
            dueDate: body.data.due_date,
            internalNotes: body.data.internal_notes,
            customerNotes: body.data.customer_notes,
            autoDeductSettlement: body.data.auto_deduct_settlement,
          });
          await enqueueTmsInvoicePushRequested(client, {
            operating_company_id: query.data.operating_company_id,
            invoice_id: created.id,
            operation: "create",
          });
          return enrichInvoice(client, created.id);
        });
        return reply.code(201).send(result);
      } catch (error) {
        if (String((error as Error).message ?? "") === "customer_not_found")
          return reply.code(404).send({
            error: "customer_not_found",
            message: "Customer not found",
            fieldErrors: { customer_id: "Invalid or inaccessible customer" },
          });
        return reply.code(500).send({ error: "invoice_create_failed" });
      }
    });
  };

  registerExpandedRoute("/api/v1/accounting/invoices/driver-damage", "driver_damage");
  registerExpandedRoute("/api/v1/accounting/invoices/driver-misc", "driver_misc");
  registerExpandedRoute("/api/v1/accounting/invoices/vendor-chargeback", "vendor_chargeback");
  registerExpandedRoute("/api/v1/accounting/invoices/customer-adjustment", "customer_adjustment");
  registerExpandedRoute("/api/v1/accounting/invoices/manual", "manual");

  app.patch("/api/v1/accounting/invoices/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const oldRes = await client.query(`SELECT * FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return { code: 404 as const, error: "invoice_not_found" };
      if (String(oldRow.status) !== "draft") return { code: 409 as const, error: "invoice_not_draft" };

      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, value: unknown) => {
        values.push(value);
        setParts.push(`${col} = $${values.length}`);
      };
      if ("issue_date" in body.data) add("issue_date", body.data.issue_date);
      if ("due_date" in body.data) add("due_date", body.data.due_date);
      if ("delivery_date" in body.data) add("delivery_date", body.data.delivery_date ?? null);
      if ("payment_terms_id" in body.data) add("payment_terms_id", body.data.payment_terms_id ?? null);
      if ("internal_notes" in body.data) add("internal_notes", body.data.internal_notes ?? null);
      if ("customer_notes" in body.data) add("customer_notes", body.data.customer_notes ?? null);
      if ("ar_email_snapshot" in body.data) add("ar_email_snapshot", body.data.ar_email_snapshot ?? null);
      if ("ar_phone_snapshot" in body.data) add("ar_phone_snapshot", body.data.ar_phone_snapshot ?? null);
      if ("currency_code" in body.data) add("currency_code", body.data.currency_code);
      add("updated_by_user_id", user.uuid);
      add("updated_at", new Date().toISOString());
      values.push(params.data.id);

      const updatedRes = await client.query(
        `
          UPDATE accounting.invoices
          SET ${setParts.join(", ")}
          WHERE id = $${values.length}
          RETURNING *
        `,
        values
      );
      const updated = updatedRes.rows[0] ?? null;
      if (!updated) return { code: 404 as const, error: "invoice_not_found" };

      const changes = buildPatchChanges(body.data as Record<string, unknown>, oldRow as Record<string, unknown>, updated as Record<string, unknown>);
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.invoices.updated",
        {
          resource_type: "accounting.invoices",
          resource_id: updated.id,
          operating_company_id: query.data.operating_company_id,
          changes,
        },
        "info",
        "P3-T11.20.2-INVOICE-FLOW"
      );
      await enqueueTmsInvoicePushRequested(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: params.data.id,
        operation: "update",
      });
      const detail = await enrichInvoice(client, params.data.id);
      return { code: 200 as const, data: detail };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/invoices/:id/send", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const currentRes = await client.query(`SELECT * FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const current = currentRes.rows[0] ?? null;
      if (!current) return { code: 404 as const, error: "invoice_not_found" };
      if (String(current.status) !== "draft") return { code: 409 as const, error: "invoice_not_draft" };
      await recomputeInvoiceTotals(client, params.data.id);
      await client.query(
        `
          UPDATE accounting.invoices
          SET status = 'sent',
              sent_at = now(),
              updated_at = now(),
              updated_by_user_id = $2
          WHERE id = $1
        `,
        [params.data.id, user.uuid]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.invoices.sent",
        {
          resource_type: "accounting.invoices",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.20.2-INVOICE-FLOW"
      );
      await enqueueTmsInvoicePushRequested(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: params.data.id,
        operation: "update",
      });
      const detail = await enrichInvoice(client, params.data.id);
      if (detail) {
        const invoiceRow = detail as Record<string, unknown>;
        const notifyRes = await client.query(
          `
            SELECT
              COALESCE(
                NULLIF(TRIM(c.ap_email), ''),
                NULLIF(TRIM(c.billing_email), ''),
                NULLIF(TRIM(c.ar_email), ''),
                NULLIF(TRIM(i.ar_email_snapshot), '')
              ) AS customer_email
            FROM accounting.invoices i
            JOIN mdata.customers c ON c.id = i.customer_id
            WHERE i.id = $1
            LIMIT 1
          `,
          [params.data.id]
        );
        const customerEmail = notifyRes.rows[0]?.customer_email ? String(notifyRes.rows[0].customer_email).trim() : "";
        if (customerEmail) {
          const total = (Number(invoiceRow.total_cents ?? 0) / 100).toFixed(2);
          void enqueueEmail({
            operatingCompanyId: query.data.operating_company_id,
            toAddresses: [customerEmail],
            subject: `Invoice ${invoiceRow.display_id} — IH 35 TMS`,
            templateKey: "invoice-send",
            templateVars: {
              invoiceDisplayId: String(invoiceRow.display_id ?? ""),
              customerName: String(invoiceRow.customer_name ?? "Customer"),
              issueDate: String(invoiceRow.issue_date ?? ""),
              currency: String(invoiceRow.currency_code ?? "USD"),
              total,
              memo: String(invoiceRow.customer_notes ?? invoiceRow.internal_notes ?? ""),
            },
            queuedByUserId: user.uuid,
          }).catch(() => undefined);
        }
      }
      return { code: 200 as const, data: detail };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/invoices/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const currentRes = await client.query(`SELECT * FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const current = currentRes.rows[0] ?? null;
      if (!current) return { code: 404 as const, error: "invoice_not_found" };
      if (String(current.status) === "paid") return { code: 409 as const, error: "invoice_paid_cannot_void" };
      if (String(current.status) === "void") return { code: 409 as const, error: "invoice_already_void" };
      await client.query(
        `
          UPDATE accounting.invoices
          SET status = 'void',
              voided_at = now(),
              void_reason = $2,
              updated_at = now(),
              updated_by_user_id = $3
          WHERE id = $1
        `,
        [params.data.id, body.data.reason ?? null, user.uuid]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.invoices.voided",
        {
          resource_type: "accounting.invoices",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          reason: body.data.reason ?? null,
        },
        "warning",
        "P3-T11.20.2-INVOICE-FLOW"
      );
      await enqueueTmsInvoicePushRequested(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: params.data.id,
        operation: "update",
      });
      const detail = await enrichInvoice(client, params.data.id);
      return { code: 200 as const, data: detail };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}
