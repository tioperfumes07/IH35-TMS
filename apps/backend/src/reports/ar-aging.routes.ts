import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, reportBasisSchema, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

// REPORTS-1 — the Reports-module A/R aging report is now sourced from the CANONICAL aging objects
// (the same bucket math the Finance Hub FIN-20 screen and the statement exports trace to), instead of
// the stale inline copy this route used to carry. Canonical source of truth:
//   • live (as_of = today)  -> views.ar_aging          (security_invoker, opco-scoped, 5-bucket split)
//   • historical (as_of<today) -> accounting.ar_aging_as_of(opco, as_of)  (TRUE point-in-time balances)
// Both expose the same column contract: current | 1-30 | 31-60 | 61-90 | 91+ plus the open total. The
// old inline SQL (a) re-invented the bucket math and (b) collapsed "current" (not-yet-due) into the
// first bucket, and (c) for a PAST as_of used today's open balance with shifted boundaries (wrong
// historical) — the canonical objects fix all three. This route stays READ-ONLY.
//
// Wire contract is preserved and made additive: `bucket_0_30_cents` is retained (= current + 1-30) so
// existing consumers keep working, and `current_cents` + `bucket_1_30_cents` are exposed as the true
// split.

const arAgingQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
  basis: reportBasisSchema,
});

type ArAgingRow = {
  customer_id: string;
  customer_name: string;
  total_cents: number;
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_0_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_91_plus_cents: number;
  last_payment_date: string | null;
  invoice_count: number;
};

type ArAgingPayload = {
  as_of_date: string;
  basis: "cash" | "accrual";
  totals: {
    total_outstanding_cents: number;
    current_cents: number;
    bucket_1_30_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
  };
  rows: ArAgingRow[];
};

const cache = createTtlCache<ArAgingPayload>();

// FINANCIAL-REPORTS-AS-OF-DATE-USES-UTC-NOT-COMPANY-TIMEZONE: this used to compute "today" as
// new Date().toISOString().slice(0, 10) — the UTC calendar date, which after ~19:00 Central has
// already rolled to the next day (see company-business-date.ts's own header comment for the real
// production precedent this class of bug already caused). companyBusinessDate() is the canonical
// fix, already proven in production elsewhere (fixed-assets.math.js's asOfToday()).
function todayIsoDate(): string {
  return companyBusinessDate();
}

// A true historical request is a valid YYYY-MM-DD strictly before today. Today (or a future date) stays
// on the live canonical view; a past date reconstructs open-as-of via accounting.ar_aging_as_of.
function isHistorical(asOfDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) && asOfDate < todayIsoDate();
}

const num = (v: unknown): number => Number(v ?? 0);

export async function registerReportsArAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ar-aging", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = arAgingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOf = query.data.as_of_date ?? todayIsoDate();
    const cacheKey = `${query.data.operating_company_id}:${asOf}:${query.data.basis}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = isHistorical(asOf)
        ? await client.query(
            // TRUE HISTORICAL: open balance reconstructed AS OF asOf (canonical opco-scoped function).
            `
              SELECT
                customer_id::text        AS customer_id,
                COALESCE(customer_name, '') AS customer_name,
                open_invoice_count::bigint  AS open_invoice_count,
                current_cents::bigint       AS current_cents,
                bucket_1_30_cents::bigint   AS bucket_1_30_cents,
                bucket_31_60_cents::bigint  AS bucket_31_60_cents,
                bucket_61_90_cents::bigint  AS bucket_61_90_cents,
                bucket_91_plus_cents::bigint AS bucket_91_plus_cents,
                total_open_cents::bigint    AS total_open_cents
              FROM accounting.ar_aging_as_of($1::uuid, $2::date)
              WHERE total_open_cents > 0
              ORDER BY total_open_cents DESC, customer_name ASC
            `,
            [query.data.operating_company_id, asOf]
          )
        : await client.query(
            // LIVE: canonical opco-scoped view (security_invoker; buckets computed at CURRENT_DATE).
            `
              SELECT
                customer_id::text        AS customer_id,
                COALESCE(customer_name, '') AS customer_name,
                open_invoice_count::bigint  AS open_invoice_count,
                current_cents::bigint       AS current_cents,
                bucket_1_30_cents::bigint   AS bucket_1_30_cents,
                bucket_31_60_cents::bigint  AS bucket_31_60_cents,
                bucket_61_90_cents::bigint  AS bucket_61_90_cents,
                bucket_91_plus_cents::bigint AS bucket_91_plus_cents,
                total_open_cents::bigint    AS total_open_cents
              FROM views.ar_aging
              WHERE operating_company_id = $1::uuid
                AND total_open_cents > 0
              ORDER BY total_open_cents DESC, customer_name ASC
            `,
            [query.data.operating_company_id]
          );

      const rawRows = res.rows as Array<Record<string, unknown>>;

      const lastPay = await client.query(
        `
          SELECT i.customer_id, MAX(p.payment_date)::text AS last_payment_date
          FROM accounting.payments p
          JOIN accounting.payment_applications pa ON pa.payment_id = p.id
                                                              AND pa.operating_company_id = p.operating_company_id
          JOIN accounting.invoices i ON i.id = pa.invoice_id
                                               AND i.operating_company_id = pa.operating_company_id
          WHERE p.voided_at IS NULL
            AND p.payment_date <= $2::date
            AND i.operating_company_id = $1::uuid
            AND p.operating_company_id = $1::uuid
          GROUP BY i.customer_id
        `,
        [query.data.operating_company_id, asOf]
      );
      const lastPayRows = lastPay.rows as Array<{ customer_id: string; last_payment_date: string | null }>;
      const lastPayMap = new Map(lastPayRows.map((r) => [r.customer_id, r.last_payment_date]));

      const rows: ArAgingRow[] = rawRows.map((row) => {
        const current = num(row.current_cents);
        const b1_30 = num(row.bucket_1_30_cents);
        const customerId = String(row.customer_id);
        return {
          customer_id: customerId,
          customer_name: String(row.customer_name ?? ""),
          total_cents: num(row.total_open_cents),
          current_cents: current,
          bucket_1_30_cents: b1_30,
          bucket_0_30_cents: current + b1_30,
          bucket_31_60_cents: num(row.bucket_31_60_cents),
          bucket_61_90_cents: num(row.bucket_61_90_cents),
          bucket_91_plus_cents: num(row.bucket_91_plus_cents),
          last_payment_date: lastPayMap.get(customerId) ?? null,
          invoice_count: num(row.open_invoice_count),
        };
      });

      const totals = rows.reduce(
        (acc, row) => {
          acc.total_outstanding_cents += row.total_cents;
          acc.current_cents += row.current_cents;
          acc.bucket_1_30_cents += row.bucket_1_30_cents;
          acc.bucket_0_30_cents += row.bucket_0_30_cents;
          acc.bucket_31_60_cents += row.bucket_31_60_cents;
          acc.bucket_61_90_cents += row.bucket_61_90_cents;
          acc.bucket_91_plus_cents += row.bucket_91_plus_cents;
          return acc;
        },
        {
          total_outstanding_cents: 0,
          current_cents: 0,
          bucket_1_30_cents: 0,
          bucket_0_30_cents: 0,
          bucket_31_60_cents: 0,
          bucket_61_90_cents: 0,
          bucket_91_plus_cents: 0,
        }
      );

      const body: ArAgingPayload = { as_of_date: asOf, totals, rows, basis: query.data.basis };
      return body;
    });

    cache.set(cacheKey, payload, 5 * 60 * 1000);
    return payload;
  });
}
