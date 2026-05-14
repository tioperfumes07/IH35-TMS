import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";

const apAgingQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
});

type ApAgingPayload = {
  as_of_date: string;
  totals: {
    total_outstanding_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
  };
  rows: Array<{
    vendor_id: string;
    vendor_name: string;
    total_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
    last_payment_date: string | null;
    bill_count: number;
  }>;
};

const cache = createTtlCache<ApAgingPayload>();

export async function registerApAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ap-aging", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = apAgingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOf = query.data.as_of_date ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `${query.data.operating_company_id}:${asOf}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          WITH open_bills AS (
            SELECT
              b.vendor_uuid,
              b.vendor_id,
              GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0)::bigint AS open_cents,
              COALESCE(b.due_date, b.bill_date) AS eff_due
            FROM accounting.bills b
            WHERE b.revoked_at IS NULL
              AND b.status IN ('unpaid', 'partial')
              AND b.operating_company_id = $1
              AND GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0) > 0
          )
          SELECT
            COALESCE(NULLIF(trim(ob.vendor_uuid), ''), ob.vendor_id, 'unknown') AS vendor_id,
            COALESCE(v.vendor_name, ob.vendor_id, 'Unknown vendor') AS vendor_name,
            COUNT(*)::int AS open_bill_count,
            COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due >= ($2::date - INTERVAL '30 days')), 0)::bigint AS bucket_0_30_cents,
            COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < ($2::date - INTERVAL '30 days') AND ob.eff_due >= ($2::date - INTERVAL '60 days')), 0)::bigint AS bucket_31_60_cents,
            COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < ($2::date - INTERVAL '60 days') AND ob.eff_due >= ($2::date - INTERVAL '90 days')), 0)::bigint AS bucket_61_90_cents,
            COALESCE(SUM(ob.open_cents) FILTER (WHERE ob.eff_due < ($2::date - INTERVAL '90 days')), 0)::bigint AS bucket_91_plus_cents,
            COALESCE(SUM(ob.open_cents), 0)::bigint AS total_open_cents
          FROM open_bills ob
          LEFT JOIN mdata.vendors v ON ob.vendor_uuid IS NOT NULL AND v.id::text = trim(ob.vendor_uuid)
          GROUP BY COALESCE(NULLIF(trim(ob.vendor_uuid), ''), ob.vendor_id, 'unknown'), COALESCE(v.vendor_name, ob.vendor_id, 'Unknown vendor')
          ORDER BY total_open_cents DESC
        `,
        [query.data.operating_company_id, asOf]
      );

      const rows = res.rows as Array<{
        vendor_id: string;
        vendor_name: string;
        open_bill_count: number;
        bucket_0_30_cents: bigint;
        bucket_31_60_cents: bigint;
        bucket_61_90_cents: bigint;
        bucket_91_plus_cents: bigint;
        total_open_cents: bigint;
      }>;

      const lastPay = await client.query(
        `
          SELECT
            COALESCE(NULLIF(trim(b.vendor_uuid), ''), b.vendor_id, 'unknown') AS vendor_key,
            MAX(bp.payment_date)::text AS last_payment_date
          FROM accounting.bill_payments bp
          JOIN accounting.bills b ON b.id = bp.bill_id
          WHERE bp.revoked_at IS NULL
            AND bp.payment_date <= $2::date
            AND b.operating_company_id = $1
          GROUP BY COALESCE(NULLIF(trim(b.vendor_uuid), ''), b.vendor_id, 'unknown')
        `,
        [query.data.operating_company_id, asOf]
      );
      const lastPayRows = lastPay.rows as Array<{ vendor_key: string; last_payment_date: string | null }>;
      const lastPayMap = new Map(lastPayRows.map((r) => [r.vendor_key, r.last_payment_date]));

      const mappedRows = rows.map((row) => ({
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        total_cents: Number(row.total_open_cents ?? 0),
        bucket_0_30_cents: Number(row.bucket_0_30_cents ?? 0),
        bucket_31_60_cents: Number(row.bucket_31_60_cents ?? 0),
        bucket_61_90_cents: Number(row.bucket_61_90_cents ?? 0),
        bucket_91_plus_cents: Number(row.bucket_91_plus_cents ?? 0),
        last_payment_date: lastPayMap.get(row.vendor_id) ?? null,
        bill_count: Number(row.open_bill_count ?? 0),
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

      return { as_of_date: asOf, totals, rows: mappedRows } satisfies ApAgingPayload;
    });

    cache.set(cacheKey, payload, 5 * 60 * 1000);
    return payload;
  });
}
