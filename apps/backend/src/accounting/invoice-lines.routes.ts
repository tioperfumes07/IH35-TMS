import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { ExpenseCategoryMapResolutionError, resolveInvoiceLineRevenueAccountId } from "../invoices/invoice-line-revenue-resolution.service.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope, recomputeInvoiceTotals } from "./shared.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const lineParamsSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

const lineTypeSchema = z.enum(["linehaul", "fsc", "detention", "layover", "lumper", "tonu", "accessorial", "tax", "adjustment", "other"]);

const createLineBodySchema = z.object({
  line_type: lineTypeSchema,
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().default(1),
  unit_amount_cents: z.coerce.number().int().min(0),
  source_load_id: z.string().uuid().optional(),
  qbo_class_snapshot: z.string().trim().max(120).optional(),
  qbo_item_id: z.string().trim().max(120).optional(),
  display_order: z.coerce.number().int().min(0).optional(),
});

const patchLineBodySchema = z
  .object({
    line_type: lineTypeSchema.optional(),
    description: z.string().trim().min(1).max(500).optional(),
    quantity: z.coerce.number().positive().optional(),
    unit_amount_cents: z.coerce.number().int().min(0).optional(),
    source_load_id: z.string().uuid().nullable().optional(),
    qbo_class_snapshot: z.string().trim().max(120).nullable().optional(),
    qbo_item_id: z.string().trim().max(120).nullable().optional(),
    display_order: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

async function ensureDraftInvoice(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, invoiceId: string, operatingCompanyId: string) {
  const invoiceRes = await client.query(
    `
      SELECT *
      FROM accounting.invoices
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [invoiceId, operatingCompanyId]
  );
  const invoice = invoiceRes.rows[0] ?? null;
  if (!invoice) return { ok: false as const, code: 404 as const, error: "invoice_not_found" };
  if (String(invoice.status) !== "draft") return { ok: false as const, code: 409 as const, error: "invoice_not_draft" };
  return { ok: true as const, invoice };
}

export async function registerInvoiceLineRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/invoices/:id/lines", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createLineBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const guard = await ensureDraftInvoice(client, params.data.id, query.data.operating_company_id);
        if (!guard.ok) return guard;
        const lineTotal = Math.round(body.data.quantity * body.data.unit_amount_cents);
        const revenueResolution = await resolveInvoiceLineRevenueAccountId(query.data.operating_company_id, {
          line_type: body.data.line_type,
        });
        const rowRes = await client.query(
          `
            INSERT INTO accounting.invoice_lines (
              operating_company_id,
              invoice_id,
              source_load_id,
              line_type,
              revenue_code,
              account_id,
              description,
              quantity,
              unit_amount_cents,
              line_total_cents,
              qbo_class_snapshot,
              qbo_item_id,
              display_order
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
              COALESCE($13, (
                SELECT COALESCE(MAX(display_order), -1) + 1
                FROM accounting.invoice_lines
                WHERE invoice_id = $2
              ))
            )
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            params.data.id,
            body.data.source_load_id ?? null,
            body.data.line_type,
            revenueResolution.revenue_code,
            revenueResolution.account_id,
            body.data.description,
            body.data.quantity,
            body.data.unit_amount_cents,
            lineTotal,
            body.data.qbo_class_snapshot ?? null,
            body.data.qbo_item_id ?? null,
            body.data.display_order ?? null,
          ]
        );
        const line = rowRes.rows[0] ?? null;
        if (!line) return { ok: false as const, code: 500 as const, error: "invoice_line_create_failed" };
        const totals = await recomputeInvoiceTotals(client, params.data.id);
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.invoice_lines.created",
          {
            resource_type: "accounting.invoice_lines",
            resource_id: line.id,
            invoice_id: params.data.id,
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
        return { ok: true as const, code: 201 as const, data: { line, totals } };
      });

      if (!result.ok) return reply.code(result.code).send({ error: result.error });
      return reply.code(result.code).send(result.data);
    } catch (error) {
      if (error instanceof ExpenseCategoryMapResolutionError) {
        return reply.code(409).send({ error: "invoice_line_revenue_account_mapping_missing" });
      }
      throw error;
    }
  });

  app.patch("/api/v1/accounting/invoices/:id/lines/:lineId", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = lineParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = patchLineBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const guard = await ensureDraftInvoice(client, params.data.id, query.data.operating_company_id);
        if (!guard.ok) return guard;

      const oldRes = await client.query(
        `
          SELECT *
          FROM accounting.invoice_lines
          WHERE id = $1
            AND invoice_id = $2
          LIMIT 1
        `,
        [params.data.lineId, params.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return { ok: false as const, code: 404 as const, error: "invoice_line_not_found" };

      const nextQuantity = body.data.quantity ?? Number(oldRow.quantity ?? 1);
      const nextUnitAmount = body.data.unit_amount_cents ?? Number(oldRow.unit_amount_cents ?? 0);
      const nextLineTotal = Math.round(nextQuantity * nextUnitAmount);

      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, value: unknown) => {
        values.push(value);
        setParts.push(`${col} = $${values.length}`);
      };

      if ("line_type" in body.data) add("line_type", body.data.line_type);
      if ("description" in body.data) add("description", body.data.description);
      if ("quantity" in body.data) add("quantity", body.data.quantity);
      if ("unit_amount_cents" in body.data) add("unit_amount_cents", body.data.unit_amount_cents);
      if ("source_load_id" in body.data) add("source_load_id", body.data.source_load_id ?? null);
      if ("qbo_class_snapshot" in body.data) add("qbo_class_snapshot", body.data.qbo_class_snapshot ?? null);
      if ("qbo_item_id" in body.data) add("qbo_item_id", body.data.qbo_item_id ?? null);
      if ("display_order" in body.data) add("display_order", body.data.display_order);
      add("line_total_cents", nextLineTotal);
      values.push(params.data.lineId);
      values.push(params.data.id);

        const resolvedLineType = body.data.line_type ?? String(oldRow.line_type ?? "");
        const revenueResolution = await resolveInvoiceLineRevenueAccountId(query.data.operating_company_id, {
          line_type: resolvedLineType,
        });
        add("revenue_code", revenueResolution.revenue_code);
        add("account_id", revenueResolution.account_id);

        const rowRes = await client.query(
        `
          UPDATE accounting.invoice_lines
          SET ${setParts.join(", ")}
          WHERE id = $${values.length - 1}
            AND invoice_id = $${values.length}
          RETURNING *
        `,
        values
      );
        const line = rowRes.rows[0] ?? null;
        if (!line) return { ok: false as const, code: 404 as const, error: "invoice_line_not_found" };
        const totals = await recomputeInvoiceTotals(client, params.data.id);
        const changes = buildPatchChanges(body.data as Record<string, unknown>, oldRow as Record<string, unknown>, line as Record<string, unknown>);
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.invoice_lines.updated",
          {
            resource_type: "accounting.invoice_lines",
            resource_id: line.id,
            invoice_id: params.data.id,
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
        return { ok: true as const, code: 200 as const, data: { line, totals } };
      });

      if (!result.ok) return reply.code(result.code).send({ error: result.error });
      return reply.code(result.code).send(result.data);
    } catch (error) {
      if (error instanceof ExpenseCategoryMapResolutionError) {
        return reply.code(409).send({ error: "invoice_line_revenue_account_mapping_missing" });
      }
      throw error;
    }
  });

  app.delete("/api/v1/accounting/invoices/:id/lines/:lineId", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = lineParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const guard = await ensureDraftInvoice(client, params.data.id, query.data.operating_company_id);
      if (!guard.ok) return guard;
      // INV-2: void-never-delete — soft-delete, never hard-delete invoice line evidence.
      const rowRes = await client.query(
        `
          UPDATE accounting.invoice_lines
          SET soft_deleted_at = now(), soft_deleted_by = $3
          WHERE id = $1
            AND invoice_id = $2
            AND soft_deleted_at IS NULL
          RETURNING *
        `,
        [params.data.lineId, params.data.id, user.uuid]
      );
      const deleted = rowRes.rows[0] ?? null;
      if (!deleted) return { ok: false as const, code: 404 as const, error: "invoice_line_not_found" };
      const totals = await recomputeInvoiceTotals(client, params.data.id);
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.invoice_lines.updated",
        {
          resource_type: "accounting.invoice_lines",
          resource_id: params.data.lineId,
          invoice_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          action: "soft_deleted",
        },
        "warning",
        "P3-T11.20.2-INVOICE-FLOW"
      );
      await enqueueTmsInvoicePushRequested(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: params.data.id,
        operation: "update",
      });
      return { ok: true as const, code: 200 as const, data: { ok: true, totals } };
    });

    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}


export default fp(async (app) => {
  await registerInvoiceLineRoutes(app);
}, { name: "accounting.registerInvoiceLineRoutes" });
