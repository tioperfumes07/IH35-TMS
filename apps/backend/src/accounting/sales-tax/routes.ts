import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";

const financeRoles = new Set(["Owner", "Administrator", "Accountant"]);

const listReturnsQuerySchema = companyQuerySchema.extend({
  start: z.string().date().optional(),
  end: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createAgencyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  jurisdiction: z.string().trim().max(160).optional(),
  agency_vendor_id: z.string().uuid().optional(),
});

const prepareReturnBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  agency_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const fileReturnBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const markPaidBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  paid_bill_id: z.string().uuid().optional(),
});

function finance(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerSalesTaxRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/sales-tax/agencies", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            a.id::text,
            a.operating_company_id::text,
            a.name,
            a.jurisdiction,
            a.agency_vendor_id::text,
            a.created_at::text,
            v.vendor_name AS agency_vendor_name
          FROM accounting.sales_tax_agencies a
          LEFT JOIN mdata.vendors v ON v.id = a.agency_vendor_id
          WHERE a.operating_company_id = $1::uuid
          ORDER BY a.name ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { agencies: rows };
  });

  app.post("/api/v1/accounting/sales-tax/agencies", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    const body = createAgencyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const created = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO accounting.sales_tax_agencies (
            operating_company_id,
            name,
            jurisdiction,
            agency_vendor_id,
            created_by_user_id
          )
          VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid)
          RETURNING id::text, operating_company_id::text, name, jurisdiction, agency_vendor_id::text, created_at::text
        `,
        [
          body.data.operating_company_id,
          body.data.name,
          body.data.jurisdiction ?? null,
          body.data.agency_vendor_id ?? null,
          user.uuid,
        ]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.sales_tax_agency.created",
          {
            resource_type: "accounting.sales_tax_agencies",
            resource_id: row.id,
            operating_company_id: body.data.operating_company_id,
          },
          "info",
          "BLOCK-31-SALES-TAX"
        );
      }
      return row;
    });
    return reply.code(201).send({ agency: created });
  });

  app.get("/api/v1/accounting/sales-tax/returns", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    const query = listReturnsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const where: string[] = ["r.operating_company_id = $1::uuid"];
      if (query.data.start) {
        values.push(query.data.start);
        where.push(`r.period_end >= $${values.length}::date`);
      }
      if (query.data.end) {
        values.push(query.data.end);
        where.push(`r.period_start <= $${values.length}::date`);
      }
      values.push(query.data.limit);
      const limitIndex = values.length;
      const res = await client.query(
        `
          SELECT
            r.id::text,
            r.operating_company_id::text,
            r.agency_id::text,
            a.name AS agency_name,
            r.period_start::text,
            r.period_end::text,
            r.taxable_sales_cents::bigint,
            r.non_taxable_sales_cents::bigint,
            r.tax_collected_cents::bigint,
            r.tax_owed_cents::bigint,
            r.status::text,
            r.filed_at::text,
            r.paid_bill_id::text,
            r.created_at::text
          FROM accounting.sales_tax_returns r
          JOIN accounting.sales_tax_agencies a ON a.id = r.agency_id
          WHERE ${where.join(" AND ")}
          ORDER BY r.period_end DESC, r.created_at DESC
          LIMIT $${limitIndex}
        `,
        values
      );
      return res.rows;
    });
    return { returns: rows };
  });

  app.post("/api/v1/accounting/sales-tax/returns/prepare", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    const body = prepareReturnBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const created = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const computed = await client.query(
        `
          SELECT
            COALESCE(SUM(i.subtotal_cents), 0)::bigint AS taxable_sales_cents,
            0::bigint AS non_taxable_sales_cents,
            COALESCE(SUM(i.tax_cents), 0)::bigint AS tax_collected_cents
          FROM accounting.invoices i
          WHERE i.operating_company_id = $1::uuid
            AND i.issue_date BETWEEN $2::date AND $3::date
            AND i.voided_at IS NULL
        `,
        [body.data.operating_company_id, body.data.period_start, body.data.period_end]
      );
      const totals = (computed.rows[0] as { taxable_sales_cents?: number; non_taxable_sales_cents?: number; tax_collected_cents?: number } | undefined) ?? {
        taxable_sales_cents: 0,
        non_taxable_sales_cents: 0,
        tax_collected_cents: 0,
      };
      const taxOwed = Number(totals.tax_collected_cents ?? 0);
      const existing = await client.query(
        `
          SELECT id::text
          FROM accounting.sales_tax_returns
          WHERE operating_company_id = $1::uuid
            AND agency_id = $2::uuid
            AND period_start = $3::date
            AND period_end = $4::date
          LIMIT 1
        `,
        [
          body.data.operating_company_id,
          body.data.agency_id,
          body.data.period_start,
          body.data.period_end,
        ]
      );
      const existingId = (existing.rows[0] as { id?: string } | undefined)?.id ?? null;
      const upsert = existingId
        ? await client.query(
            `
              UPDATE accounting.sales_tax_returns
              SET taxable_sales_cents = $2,
                  non_taxable_sales_cents = $3,
                  tax_collected_cents = $4,
                  tax_owed_cents = $5
              WHERE id = $1::uuid
              RETURNING id::text, operating_company_id::text, agency_id::text, period_start::text, period_end::text, taxable_sales_cents::bigint, non_taxable_sales_cents::bigint, tax_collected_cents::bigint, tax_owed_cents::bigint, status::text, created_at::text
            `,
            [
              existingId,
              Number(totals.taxable_sales_cents ?? 0),
              Number(totals.non_taxable_sales_cents ?? 0),
              Number(totals.tax_collected_cents ?? 0),
              taxOwed,
            ]
          )
        : await client.query(
            `
              INSERT INTO accounting.sales_tax_returns (
                operating_company_id,
                agency_id,
                period_start,
                period_end,
                taxable_sales_cents,
                non_taxable_sales_cents,
                tax_collected_cents,
                tax_owed_cents,
                status,
                created_by_user_id
              )
              VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5, $6, $7, $8, 'open', $9::uuid)
              RETURNING id::text, operating_company_id::text, agency_id::text, period_start::text, period_end::text, taxable_sales_cents::bigint, non_taxable_sales_cents::bigint, tax_collected_cents::bigint, tax_owed_cents::bigint, status::text, created_at::text
            `,
            [
              body.data.operating_company_id,
              body.data.agency_id,
              body.data.period_start,
              body.data.period_end,
              Number(totals.taxable_sales_cents ?? 0),
              Number(totals.non_taxable_sales_cents ?? 0),
              Number(totals.tax_collected_cents ?? 0),
              taxOwed,
              user.uuid,
            ]
          );
      const row = upsert.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.sales_tax_return.prepared",
          {
            resource_type: "accounting.sales_tax_returns",
            resource_id: row.id,
            operating_company_id: body.data.operating_company_id,
            period_start: body.data.period_start,
            period_end: body.data.period_end,
          },
          "info",
          "BLOCK-31-SALES-TAX"
        );
      }
      return row;
    });
    return reply.code(201).send({ sales_tax_return: created });
  });

  app.post("/api/v1/accounting/sales-tax/returns/:id/file", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = fileReturnBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE accounting.sales_tax_returns
          SET status = 'filed',
              filed_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id::text, status::text, filed_at::text
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.sales_tax_return.filed",
          {
            resource_type: "accounting.sales_tax_returns",
            resource_id: row.id,
            operating_company_id: body.data.operating_company_id,
          },
          "info",
          "BLOCK-31-SALES-TAX"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "sales_tax_return_not_found" });
    return { sales_tax_return: updated };
  });

  app.post("/api/v1/accounting/sales-tax/returns/:id/mark-paid", async (req, reply) => {
    const user = finance(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = markPaidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE accounting.sales_tax_returns
          SET status = 'paid',
              paid_bill_id = COALESCE($3::uuid, paid_bill_id)
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id::text, status::text, paid_bill_id::text
        `,
        [params.data.id, body.data.operating_company_id, body.data.paid_bill_id ?? null]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.sales_tax_return.paid",
          {
            resource_type: "accounting.sales_tax_returns",
            resource_id: row.id,
            operating_company_id: body.data.operating_company_id,
            paid_bill_id: row.paid_bill_id ?? null,
          },
          "info",
          "BLOCK-31-SALES-TAX"
        );
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "sales_tax_return_not_found" });
    return { sales_tax_return: updated };
  });
}
