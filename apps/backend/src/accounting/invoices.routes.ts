import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { enqueueEmail } from "../email/queue.service.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { nextInvoiceDisplayId } from "./display-id.js";
import { buildInvoiceFromLoad } from "./from-load.js";
import { createExpandedInvoice } from "./invoices.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope, recomputeInvoiceTotals } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { auditVoid, isVoidEnforcementEnabled, postVoidReversal, type VoidReversalResult } from "./void.service.js";
import { requireVoidCancelExecutor } from "../lib/authz/void-cancel-authz.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = companyQuerySchema.extend({
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
  customer_id: z.string().uuid().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Aging / open-AR drill: filter full entity set by open balance BEFORE LIMIT/OFFSET
  // (mirrors accounting bills has_balance). Excludes draft/voided; includes sent/partial/etc.
  has_balance: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBodySchema = z.object({
  customer_id: z.string().uuid(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payment_terms_id: z.string().uuid().optional(),
  internal_notes: z.string().trim().max(5000).optional(),
  customer_notes: z.string().trim().max(5000).optional(),
  currency_code: z.enum(["USD", "MXN"]).optional(),
  // Draft id for create-time invoice attachments (rate cons / BOL); reconciled onto the real invoice id
  // in the same txn (Option B inc 2 — docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md).
  attachment_draft_id: z.string().uuid().optional().nullable(),
  // CUSTVEND-PAR-1: Manager+ override when customer is at/over credit limit.
  override_credit_limit: z.boolean().optional(),
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
  // Draft id for create-time invoice attachments (rate cons / BOL); reconciled onto the real invoice id
  // in the same txn. These manual/driver-misc/driver-damage routes are what the invoice modals actually
  // hit (the plain /accounting/invoices route is a separate path).
  attachment_draft_id: z.string().uuid().optional().nullable(),
  // CUSTVEND-PAR-1: Manager+ override when customer is at/over credit limit.
  override_credit_limit: z.boolean().optional(),
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
        l.customer_chargeback_reason AS source_load_chargeback_reason,
        l.load_number AS source_load_number
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
      SELECT
        il.*,
        a.account_number AS income_account_number,
        a.account_name AS income_account_name
      FROM accounting.invoice_lines il
      LEFT JOIN catalogs.accounts a ON a.id = il.account_id
      WHERE il.invoice_id = $1
      ORDER BY il.display_order ASC, il.created_at ASC
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
  // Law §9 forward: invoice → GL JE (+ payment JEs applied to this invoice). Read-only; no new GL math.
  const journalEntriesRes = await client.query(
    `
      SELECT DISTINCT ON (je.id)
        je.id::text AS journal_entry_id,
        je.entry_date::text AS entry_date,
        je.status,
        je.source,
        jep.source_transaction_type,
        jep.source_transaction_id,
        jep.posting_batch_id::text AS posting_batch_id
      FROM accounting.journal_entry_postings jep
      JOIN accounting.journal_entries je
        ON je.id = jep.journal_entry_uuid
       AND je.operating_company_id = jep.operating_company_id
      WHERE jep.operating_company_id = $2
        AND (
          (jep.source_transaction_type = 'invoice' AND jep.source_transaction_id = $1::text)
          OR (
            jep.source_transaction_type = 'customer_payment'
            AND jep.source_transaction_id IN (
              SELECT pa.payment_id::text
              FROM accounting.payment_applications pa
              WHERE pa.invoice_id = $1::uuid
            )
          )
        )
      ORDER BY je.id, je.entry_date DESC, jep.line_sequence ASC
    `,
    [invoiceId, invoice.operating_company_id]
  );
  return {
    ...invoice,
    lines: linesRes.rows,
    payment_applications: applicationsRes.rows,
    journal_entries: journalEntriesRes.rows,
  };
}

export async function registerInvoiceRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/invoices", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const q = query.data;
    const listed = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      // Extra filters only — entity predicates are SQL literals in BOTH count + list templates
      // (verify-mdata-entity-scope scans template text; interpolated JS where-clauses alone are insufficient).
      const extraWhere: string[] = [];
      const values: unknown[] = [q.operating_company_id];
      if (q.status) {
        values.push(q.status);
        extraWhere.push(`i.status = $${values.length}`);
      }
      if (q.customer_id) {
        values.push(q.customer_id);
        extraWhere.push(`i.customer_id = $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        extraWhere.push(`(i.display_id ILIKE $${idx} OR c.customer_name ILIKE $${idx})`);
      }
      if (q.from_date) {
        values.push(q.from_date);
        extraWhere.push(`i.issue_date >= $${values.length}::date`);
      }
      if (q.to_date) {
        values.push(q.to_date);
        extraWhere.push(`i.issue_date <= $${values.length}::date`);
      }
      // has_balance: aging-compatible open AR — apply BEFORE LIMIT/OFFSET so pagination is truthful.
      if (q.has_balance) {
        extraWhere.push("COALESCE(i.amount_open_cents, 0) > 0");
        extraWhere.push("i.voided_at IS NULL");
        extraWhere.push("i.status NOT IN ('draft', 'void', 'voided', 'paid')");
      }
      // Same extra filters for COUNT and LIST (bind indices identical until LIMIT/OFFSET appended).
      const extraSql = extraWhere.length ? `AND ${extraWhere.join(" AND ")}` : "";
      const countRes = await client.query(
        `
          SELECT COUNT(*)::int AS total
          FROM accounting.invoices i
          JOIN mdata.customers c
            ON c.id = i.customer_id
           AND c.operating_company_id = i.operating_company_id
           AND c.operating_company_id = $1
          WHERE i.operating_company_id = $1
            ${extraSql}
        `,
        values
      );
      const total = Number(countRes.rows[0]?.total ?? 0);
      values.push(q.limit);
      const limitIdx = values.length;
      values.push(q.offset);
      const offsetIdx = values.length;
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
              FROM accounting.invoice_lines il
              WHERE il.invoice_id = i.id
            )::int AS line_count
          FROM accounting.invoices i
          JOIN mdata.customers c
            ON c.id = i.customer_id
           AND c.operating_company_id = i.operating_company_id
           AND c.operating_company_id = $1
          LEFT JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
          LEFT JOIN mdata.loads l
            ON l.id = i.source_load_id
           AND l.operating_company_id = i.operating_company_id
          WHERE i.operating_company_id = $1
            ${extraSql}
          ORDER BY i.issue_date DESC, i.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );
      return { rows: res.rows, total };
    });
    const invoices = listed.rows;
    const total = listed.total;
    return {
      invoices,
      total,
      limit: q.limit,
      offset: q.offset,
      has_more: q.offset + invoices.length < total,
    };
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
          SELECT c.id, c.payment_terms_id, c.ar_email, c.ar_phone, c.credit_limit_cents, c.credit_limit_source,
                 pt.terms_name, pt.days_until_due
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

      // CUSTVEND-PAR-1: Credit-limit enforcement. Check open exposure vs stored limit.
      // Includes open invoices + unbilled active loads. Factor-sourced limits show the source.
      if (customer.credit_limit_cents != null) {
        const canOverride = ["Owner", "Administrator", "Manager"].includes(user.role);
        if (!body.data.override_credit_limit || !canOverride) {
          const exposureRes = await client.query(
            `SELECT
               COALESCE((
                 SELECT SUM(i.total_cents)
                 FROM accounting.invoices i
                 WHERE i.customer_id = $1
                   AND i.operating_company_id = $2
                   AND i.status NOT IN ('void', 'paid')
               ), 0)::bigint AS open_invoice_cents,
               COALESCE((
                 SELECT SUM(l.rate_total_cents)
                 FROM mdata.loads l
                 WHERE l.customer_id = $1
                   AND l.operating_company_id = $2
                   AND l.status NOT IN ('draft', 'invoiced', 'paid', 'closed', 'cancelled')
               ), 0)::bigint AS unbilled_load_cents`,
            [body.data.customer_id, query.data.operating_company_id]
          );
          const openCents = Number(exposureRes.rows[0]?.open_invoice_cents ?? 0);
          const loadCents = Number(exposureRes.rows[0]?.unbilled_load_cents ?? 0);
          const totalExposure = openCents + loadCents;
          const limitCents = Number(customer.credit_limit_cents);
          if (totalExposure >= limitCents) {
            return {
              code: 422 as const,
              error: "credit_limit_exceeded" as const,
              exposure_cents: totalExposure,
              limit_cents: limitCents,
              credit_limit_source: customer.credit_limit_source ?? null,
              can_override: canOverride,
            };
          }
        }
        if (body.data.override_credit_limit && canOverride) {
          await appendCrudAudit(
            client, user.uuid,
            "accounting.invoices.credit_limit_override",
            { customer_id: body.data.customer_id, operating_company_id: query.data.operating_company_id },
            "warning",
            "CUSTVEND-PAR-1"
          );
        }
      }

      const issueDate = body.data.issue_date ?? companyBusinessDate();
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
      // Option B inc 2: link create-time draft attachments (rate cons / BOL) to the real invoice id,
      // atomically in this txn.
      await reassignDraftAttachments(client, {
        operatingCompanyId: query.data.operating_company_id,
        entityType: "invoice",
        draftId: body.data.attachment_draft_id,
        newId: invoiceId,
      });
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
    void withCompanyScope(user.uuid, (created as { data?: { operating_company_id?: string } })?.data?.operating_company_id ?? "", (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: (created as { data?: { operating_company_id?: string } })?.data?.operating_company_id ?? "",
        actor_user_id: user.uuid,
        event_type: "invoice.created",
        entity_id: (created as { data?: { id?: string } })?.data?.id ?? "",
        entity_type: "invoice",
        source_table: "accounting.invoices",
      })
    ).catch((err) =>
      req.log.warn(
        {
          err,
          invoice_id: (created as { data?: { id?: string } })?.data?.id ?? null,
          company_id: (created as { data?: { operating_company_id?: string } })?.data?.operating_company_id ?? null,
        },
        "spine_emit_invoice_created_failed"
      )
    );
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
        type CreditBlock = { _creditBlock: { code: number; error: string; exposure_cents: number; limit_cents: number; credit_limit_source: string | null; can_override: boolean } };
        const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
          // CUSTVEND-PAR-1: Credit-limit enforcement for customer-facing invoice types.
          if (body.data.bill_to_entity_type === "customer") {
            const custRes = await client.query(
              `SELECT credit_limit_cents, credit_limit_source FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
              [body.data.customer_id, query.data.operating_company_id]
            );
            const cust = custRes.rows[0];
            if (cust?.credit_limit_cents != null) {
              const canOverride = ["Owner", "Administrator", "Manager"].includes(user.role);
              if (!body.data.override_credit_limit || !canOverride) {
                const expRes = await client.query(
                  `SELECT
                     COALESCE((SELECT SUM(i.total_cents) FROM accounting.invoices i
                       WHERE i.customer_id = $1 AND i.operating_company_id = $2
                         AND i.status NOT IN ('void','paid')), 0)::bigint AS open_invoice_cents,
                     COALESCE((SELECT SUM(l.rate_total_cents) FROM mdata.loads l
                       WHERE l.customer_id = $1 AND l.operating_company_id = $2
                         AND l.status NOT IN ('draft','invoiced','paid','closed','cancelled')), 0)::bigint AS unbilled_load_cents`,
                  [body.data.customer_id, query.data.operating_company_id]
                );
                const exposure = Number(expRes.rows[0]?.open_invoice_cents ?? 0) + Number(expRes.rows[0]?.unbilled_load_cents ?? 0);
                if (exposure >= Number(cust.credit_limit_cents)) {
                  return {
                    _creditBlock: {
                      code: 422,
                      error: "credit_limit_exceeded",
                      exposure_cents: exposure,
                      limit_cents: Number(cust.credit_limit_cents),
                      credit_limit_source: cust.credit_limit_source ?? null,
                      can_override: canOverride,
                    },
                  };
                }
              }
              if (body.data.override_credit_limit && canOverride) {
                await appendCrudAudit(client, user.uuid, "accounting.invoices.credit_limit_override",
                  { customer_id: body.data.customer_id, operating_company_id: query.data.operating_company_id },
                  "warning", "CUSTVEND-PAR-1");
              }
            }
          }

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
          // Option B: link create-time draft attachments to the real invoice id, atomically in this txn.
          await reassignDraftAttachments(client, {
            operatingCompanyId: query.data.operating_company_id,
            entityType: "invoice",
            draftId: body.data.attachment_draft_id,
            newId: created.id,
          });
          await enqueueTmsInvoicePushRequested(client, {
            operating_company_id: query.data.operating_company_id,
            invoice_id: created.id,
            operation: "create",
          });
          return enrichInvoice(client, created.id);
        });
        if ((result as CreditBlock)._creditBlock) {
          const cb = (result as CreditBlock)._creditBlock;
          return reply.code(cb.code).send({ error: cb.error, exposure_cents: cb.exposure_cents, limit_cents: cb.limit_cents, credit_limit_source: cb.credit_limit_source, can_override: cb.can_override });
        }
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
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: user.uuid,
        event_type: "invoice.updated",
        entity_id: params.data.id,
        entity_type: "invoice",
        source_table: "accounting.invoices",
      })
    ).catch((err) =>
      req.log.warn(
        { err, invoice_id: params.data.id, company_id: query.data.operating_company_id },
        "spine_emit_invoice_updated_failed"
      )
    );
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

      // FACT-PAR-2: 422 guard — customer with active factor assignment requires NOA config on the factor
      const invoiceDate = String(current.issue_date);
      const noaCheck = await client.query(
        `
          SELECT
            f.id::text AS factor_id,
            f.name AS factor_name,
            f.noa_stamp_text,
            f.noa_remit_to_name
          FROM factoring.customer_factor_assignment a
          JOIN factoring.factor f ON f.id = a.factor_id
          WHERE a.tenant_id = $1::uuid
            AND a.customer_id = $2::uuid
            AND a.effective_from <= $3::date
            AND (a.effective_to IS NULL OR a.effective_to > $3::date)
          ORDER BY a.effective_from DESC
          LIMIT 1
        `,
        [query.data.operating_company_id, current.customer_id, invoiceDate]
      );
      const noaRow = noaCheck.rows[0] ?? null;
      if (noaRow && !noaRow.noa_stamp_text && !noaRow.noa_remit_to_name) {
        return {
          code: 422 as const,
          error: "noa_config_missing",
          factor_id: String(noaRow.factor_id),
          factor_name: String(noaRow.factor_name),
        };
      }

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
    if ("error" in result) {
      if (result.error === "noa_config_missing" && "factor_id" in result) {
        return reply.code(result.code).send({
          error: result.error,
          message: `Factor "${result.factor_name}" has an active assignment for this customer but is missing NOA stamp text or remit-to address. Configure NOA fields on the factor profile before sending this invoice.`,
          factor_id: result.factor_id,
        });
      }
      return reply.code(result.code).send({ error: result.error });
    }
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: user.uuid,
        event_type: "invoice.sent",
        entity_id: params.data.id,
        entity_type: "invoice",
        source_table: "accounting.invoices",
      })
    ).catch((err) =>
      req.log.warn(
        { err, invoice_id: params.data.id, company_id: query.data.operating_company_id },
        "spine_emit_invoice_sent_failed"
      )
    );
    return result.data;
  });

  app.post("/api/v1/accounting/invoices/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // G9-C3: voiding an invoice is an EXECUTOR-only action (Owner|Administrator|Accountant). This gate is
    // OUTSIDE the VOID-EVERYWHERE flag — previously the role check lived only inside the flag-ON path, so
    // in the default (flag-OFF) state anyone could void. Route through the shared governance authz so
    // non-executors must FILE a void/cancel request for approval.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
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

      // VOID-EVERYWHERE (gated): when ON, post the equal-and-opposite reversing JE first (same transaction =
      // atomic with the status flip), enforce VOID = Owner+Accountant and a required reason. When OFF (default),
      // behaviour is unchanged — status flip + audit only, no reversing entry.
      const flagOn = await isVoidEnforcementEnabled(client, query.data.operating_company_id, user.uuid);
      let reversal: VoidReversalResult = {
        reversal_journal_entry_id: null,
        reversal_date: null,
        closed_period_reversal: false,
        reversed_line_count: 0,
      };
      if (flagOn) {
        // Executor role already enforced above (requireVoidCancelExecutor, OUTSIDE the flag). The flag-ON
        // path only adds the reversing-JE + required-reason obligations.
        if (!body.data.reason || !body.data.reason.trim()) return { code: 400 as const, error: "void_reason_required" };
        const rawDate = current.issue_date as unknown;
        const originalDate =
          typeof rawDate === "string" ? rawDate.slice(0, 10) : new Date(rawDate as string).toISOString().slice(0, 10);
        reversal = await postVoidReversal(
          client,
          {
            operatingCompanyId: query.data.operating_company_id,
            entityType: "invoice",
            entityId: params.data.id,
            originalDate,
            memo: `Void reversal of invoice ${params.data.id}: ${body.data.reason}`,
          },
          { userId: user.uuid }
        );
      }

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
      if (flagOn) {
        await auditVoid(client, user.uuid, "invoice", {
          operatingCompanyId: query.data.operating_company_id,
          entityId: params.data.id,
          reason: body.data.reason ?? "",
          reversal,
        });
      } else {
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
      }
      await enqueueTmsInvoicePushRequested(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: params.data.id,
        operation: "update",
      });
      const detail = await enrichInvoice(client, params.data.id);
      return { code: 200 as const, data: detail };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: user.uuid,
        event_type: "invoice.voided",
        entity_id: params.data.id,
        entity_type: "invoice",
        source_table: "accounting.invoices",
        payload: { reason: body.data.reason ?? null },
      })
    ).catch((err) =>
      req.log.warn(
        { err, invoice_id: params.data.id, company_id: query.data.operating_company_id },
        "spine_emit_invoice_voided_failed"
      )
    );
    return result.data;
  });
}


export default fp(async (app) => {
  await registerInvoiceRoutes(app);
}, { name: "accounting.registerInvoiceRoutes" });
