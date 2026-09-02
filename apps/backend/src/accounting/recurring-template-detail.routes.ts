import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const paramsSchema = z.object({ id: z.string().uuid() });

/** Exact, read-only reverse surface for accounting.recurring_templates (not recurring_bill_templates). */
const listQuerySchema = companyQuerySchema.extend({
  customer_id: z.string().uuid(),
  kind: z.enum(["invoice", "bill", "expense", "journal_entry"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// GO-23 Wave 6 L4 (owner: "TRK -> USMCA lease at monthly x 1.16") — accounting.recurring_templates
// has carried a genuine kind='invoice' materializer (materializeInvoice, this same file's sibling
// recurring.worker.ts) and a live 15-minute cron (cron/recurring-templates.cron.ts) since P7 Wave 2
// — confirmed 0 rows in prod, live-verified this session, because NOTHING anywhere ever inserted a
// row. accounting.recurring_bill_templates (the OLDER, bill-only table RecurringBillCreate.tsx
// posts to) is a separate table entirely — this is the missing create/deactivate pair for the
// generic, kind-based table the worker actually reads. No new table, no new worker logic; only the
// send-side was missing.
function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

const lineSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  quantity: z.number().positive().default(1),
  unit_amount_cents: z.coerce.number().int().positive(),
  line_type: z.string().trim().max(60).optional(),
  revenue_code: z.string().trim().max(120).optional(),
});

const createTemplateBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  kind: z.literal("invoice"),
  template_name: z.string().trim().min(1).max(255),
  customer_id: z.string().uuid(),
  cadence: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annually", "custom_cron"]),
  cron_expression: z.string().trim().max(200).optional().nullable(),
  next_run_at: z.string().datetime({ offset: true }),
  internal_notes: z.string().trim().max(4000).optional().nullable(),
  customer_notes: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const deactivateParamsSchema = z.object({ id: z.string().uuid() });

export async function registerRecurringTemplateDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/recurring-templates", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const kind = query.data.kind ?? "invoice";
    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const values = [opco, kind, query.data.customer_id];
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
           FROM accounting.recurring_templates rt
          WHERE rt.operating_company_id = $1::uuid
            AND rt.kind = $2
            AND rt.template_payload->>'customer_id' = $3`,
        values,
      );
      const result = await client.query(
        `SELECT rt.id::text, rt.kind, rt.cadence, rt.cron_expression, rt.next_run_at::text,
                rt.template_payload, rt.is_active, rt.last_run_at::text, rt.run_count,
                rt.created_at::text, rt.updated_at::text
           FROM accounting.recurring_templates rt
          WHERE rt.operating_company_id = $1::uuid
            AND rt.kind = $2
            AND rt.template_payload->>'customer_id' = $3
          ORDER BY rt.next_run_at ASC, rt.created_at DESC
          LIMIT $4 OFFSET $5`,
        [...values, query.data.limit, query.data.offset],
      );
      return {
        rows: result.rows,
        total: Number(count.rows[0]?.total ?? 0),
        limit: query.data.limit,
        offset: query.data.offset,
      };
    });
    return reply.send(payload);
  });

  app.get("/api/v1/accounting/recurring-templates/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const detail = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const result = await client.query(
        `SELECT rt.id::text, rt.kind, rt.cadence, rt.cron_expression, rt.next_run_at::text,
                rt.template_payload, rt.is_active, rt.last_run_at::text, rt.run_count,
                rt.created_at::text, rt.updated_at::text,
                COALESCE(NULLIF(TRIM(CONCAT(iu.first_name, ' ', iu.last_name)), ''), iu.email) AS created_by_name
           FROM accounting.recurring_templates rt
           LEFT JOIN identity.users iu ON iu.id = rt.created_by_user_id
          WHERE rt.operating_company_id = $1::uuid AND rt.id = $2::uuid
          LIMIT 1`,
        [opco, params.data.id],
      );
      return result.rows[0] ?? null;
    });
    if (!detail) return reply.code(404).send({ error: "RECURRING_TEMPLATE_NOT_FOUND", message: "Recurring template not found for this operating company." });
    return reply.send(detail);
  });

  // GO-23 Wave 6 L4 — the create side accounting.recurring_templates never had. template_payload
  // shape here matches materializeInvoice's own reads exactly (recurring.worker.ts): customer_id,
  // issue_date/due_date (left absent -> materializeInvoice defaults to companyBusinessDate() / the
  // customer's own payment terms, same as a normal invoice), internal_notes, customer_notes, and
  // lines[] (quantity, unit_amount_cents, line_type, revenue_code, description). template_name is
  // stored in the payload too — the materializer ignores unknown keys, this list UI reads it back.
  app.post("/api/v1/accounting/recurring-templates", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const body = createTemplateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const opco = body.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);

    const templatePayload = {
      template_name: body.data.template_name,
      customer_id: body.data.customer_id,
      internal_notes: body.data.internal_notes ?? undefined,
      customer_notes: body.data.customer_notes ?? undefined,
      lines: body.data.lines,
    };

    const created = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      // Real customer, same company — never trust an id the caller invented.
      const cust = await client.query(
        `SELECT id FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [body.data.customer_id, opco]
      );
      if (!cust.rows[0]) throw new Error("recurring_invoice_customer_not_in_company");

      const res = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.recurring_templates (
            operating_company_id, kind, cadence, cron_expression, next_run_at,
            template_payload, is_active, created_by_user_id
          )
          VALUES ($1::uuid, 'invoice', $2, $3, $4::timestamptz, $5::jsonb, true, $6::uuid)
          RETURNING id::text
        `,
        [
          opco,
          body.data.cadence,
          body.data.cron_expression ?? null,
          body.data.next_run_at,
          JSON.stringify(templatePayload),
          user.uuid,
        ]
      );
      const id = res.rows[0]?.id;
      if (!id) throw new Error("recurring_invoice_template_insert_failed");
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.recurring_template.created",
        { template_id: id, kind: "invoice", operating_company_id: opco, customer_id: body.data.customer_id, cadence: body.data.cadence },
        "info",
        "GO-23-L4-RECURRING-INVOICE"
      );
      return id;
    });

    return reply.code(201).send({ id: created });
  });

  app.post(
    "/api/v1/accounting/recurring-templates/:id/deactivate",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      const params = deactivateParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const opco = query.data.operating_company_id;
      await assertCompanyMembership(user.uuid, opco);

      const updated = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
        const res = await client.query<{ id: string }>(
          `UPDATE accounting.recurring_templates
              SET is_active = false, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING id::text`,
          [params.data.id, opco]
        );
        const id = res.rows[0]?.id;
        if (id) {
          await appendCrudAudit(
            client,
            user.uuid,
            "accounting.recurring_template.deactivated",
            { template_id: id, operating_company_id: opco },
            "info",
            "GO-23-L4-RECURRING-INVOICE"
          );
        }
        return id ?? null;
      });
      if (!updated) return reply.code(404).send({ error: "RECURRING_TEMPLATE_NOT_FOUND" });
      return reply.send({ id: updated });
    }
  );
}

export default fp(registerRecurringTemplateDetailRoutes, { name: "accounting-recurring-template-detail-routes" });
