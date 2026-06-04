import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, reportBasisSchema, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";

const arAgingQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
  basis: reportBasisSchema,
});

type ArAgingPayload = {
  as_of_date: string;
  basis: "cash" | "accrual";
  totals: {
    total_outstanding_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
  };
  rows: Array<{
    customer_id: string;
    customer_name: string;
    total_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
    last_payment_date: string | null;
    invoice_count: number;
  }>;
};

const cache = createTtlCache<ArAgingPayload>();

export async function registerArAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ar-aging", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = arAgingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOf = query.data.as_of_date ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `${query.data.operating_company_id}:${asOf}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            i.customer_id,
            c.customer_name AS customer_name,
            COUNT(*) FILTER (WHERE i.amount_open_cents > 0)::int AS open_invoice_count,
            COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date >= ($2::date - INTERVAL '30 days')), 0)::bigint AS bucket_0_30_cents,
            COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < ($2::date - INTERVAL '30 days') AND i.due_date >= ($2::date - INTERVAL '60 days')), 0)::bigint AS bucket_31_60_cents,
            COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < ($2::date - INTERVAL '60 days') AND i.due_date >= ($2::date - INTERVAL '90 days')), 0)::bigint AS bucket_61_90_cents,
            COALESCE(SUM(i.amount_open_cents) FILTER (WHERE i.due_date < ($2::date - INTERVAL '90 days')), 0)::bigint AS bucket_91_plus_cents,
            COALESCE(SUM(i.amount_open_cents), 0)::bigint AS total_open_cents
          FROM accounting.invoices i
          JOIN mdata.customers c ON c.id = i.customer_id
          WHERE i.status IN ('sent', 'partial')
            AND i.voided_at IS NULL
            AND i.operating_company_id = $1
          GROUP BY i.customer_id, c.customer_name
          ORDER BY total_open_cents DESC
        `,
        [query.data.operating_company_id, asOf]
      );

      const rows = res.rows as Array<{
        customer_id: string;
        customer_name: string;
        open_invoice_count: number;
        bucket_0_30_cents: bigint;
        bucket_31_60_cents: bigint;
        bucket_61_90_cents: bigint;
        bucket_91_plus_cents: bigint;
        total_open_cents: bigint;
      }>;

      const lastPay = await client.query(
        `
          SELECT i.customer_id, MAX(p.payment_date)::text AS last_payment_date
          FROM accounting.payments p
          JOIN accounting.payment_applications pa ON pa.payment_id = p.id
          JOIN accounting.invoices i ON i.id = pa.invoice_id
          WHERE p.voided_at IS NULL
            AND p.payment_date <= $2::date
            AND i.operating_company_id = $1
          GROUP BY i.customer_id
        `,
        [query.data.operating_company_id, asOf]
      );
      const lastPayRows = lastPay.rows as Array<{ customer_id: string; last_payment_date: string | null }>;
      const lastPayMap = new Map(lastPayRows.map((r) => [r.customer_id, r.last_payment_date]));

      const mappedRows = rows.map((row) => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        total_cents: Number(row.total_open_cents ?? 0),
        bucket_0_30_cents: Number(row.bucket_0_30_cents ?? 0),
        bucket_31_60_cents: Number(row.bucket_31_60_cents ?? 0),
        bucket_61_90_cents: Number(row.bucket_61_90_cents ?? 0),
        bucket_91_plus_cents: Number(row.bucket_91_plus_cents ?? 0),
        last_payment_date: lastPayMap.get(row.customer_id) ?? null,
        invoice_count: Number(row.open_invoice_count ?? 0),
      }));

      const totals = mappedRows.reduce(
        (acc, row) => {
          acc.total_outstanding_cents += row.total_cents;
          acc.bucket_0_30_cents += row.bucket_0_30_cents;
          acc.bucket_31_60_cents += row.bucket_31_60_cents;
          acc.bucket_61_90_cents += row.bucket_61_90_cents;
          acc.bucket_91_plus_cents += row.bucket_91_plus_cents;
          return acc;
        },
        {
          total_outstanding_cents: 0,
          bucket_0_30_cents: 0,
          bucket_31_60_cents: 0,
          bucket_61_90_cents: 0,
          bucket_91_plus_cents: 0,
        }
      );

      const body: ArAgingPayload = { as_of_date: asOf, totals, rows: mappedRows, basis: query.data.basis };
      return body;
    });

    cache.set(cacheKey, payload, 5 * 60 * 1000);
    return payload;
  });
}
