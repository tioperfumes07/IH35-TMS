import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

// REPORTS-1 — the Reports-module A/P aging report is now sourced from the CANONICAL aging objects
// (the same bucket math the Finance Hub FIN-20 screen and the statement exports trace to), instead of
// the stale inline copy this route used to carry. Canonical source of truth:
//   • live (as_of = today)  -> views.ap_aging          (security_invoker, opco-scoped, 5-bucket split)
//   • historical (as_of<today) -> accounting.ap_aging_as_of(opco, as_of)  (TRUE point-in-time balances)
// Both expose the same column contract: current | 1-30 | 31-60 | 61-90 | 91+ plus the open total. The
// old inline SQL re-invented the bucket math, collapsed "current" (not-yet-due) into the first bucket,
// and for a PAST as_of used today's open balance with shifted boundaries (wrong historical). This route
// stays READ-ONLY.
//
// Wire contract is preserved and made additive: `bucket_0_30_cents` is retained (= current + 1-30) so
// existing consumers keep working, and `current_cents` + `bucket_1_30_cents` are exposed as the true
// split.

const apAgingQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
});

type ApAgingRow = {
  vendor_id: string;
  vendor_name: string;
  total_cents: number;
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_0_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_91_plus_cents: number;
  last_payment_date: string | null;
  bill_count: number;
};

type ApAgingPayload = {
  as_of_date: string;
  totals: {
    total_outstanding_cents: number;
    current_cents: number;
    bucket_1_30_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
  };
  rows: ApAgingRow[];
};

const cache = createTtlCache<ApAgingPayload>();

// FINANCIAL-REPORTS-AS-OF-DATE-USES-UTC-NOT-COMPANY-TIMEZONE: see ar-aging.routes.ts's sibling
// comment — this used to compute "today" as new Date().toISOString().slice(0, 10) (UTC calendar
// date, rolls early relative to Central). companyBusinessDate() is the canonical fix.
function todayIsoDate(): string {
  return companyBusinessDate();
}

// A true historical request is a valid YYYY-MM-DD strictly before today. Today (or a future date) stays
// on the live canonical view; a past date reconstructs open-as-of via accounting.ap_aging_as_of.
function isHistorical(asOfDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) && asOfDate < todayIsoDate();
}

const num = (v: unknown): number => Number(v ?? 0);

// RPT-F03 — named registerReportsApAgingRoutes, not registerApAgingRoutes, because
// apps/backend/src/accounting/ap-aging.routes.ts already exports the latter for a DIFFERENT path
// (/api/v1/accounting/ap-aging). Two modules exporting one registrar name is genuinely ambiguous:
// scripts/verify-no-duplicate-routes.mjs resolves manual mounts by function NAME, so it attributed
// the accounting module's route to this module's mount and reported a duplicate that does not exist
// at runtime. The same collision misled me while verifying this PR. Renaming removes the ambiguity
// at its source rather than teaching the guard to tolerate it, and matches this directory's own
// convention — registerReportsArAgingRoutes, registerReportsIftaRoutes, registerReportsScheduledCrudRoutes.
export async function registerReportsApAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ap-aging", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = apAgingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const asOf = query.data.as_of_date ?? todayIsoDate();
    const cacheKey = `${query.data.operating_company_id}:${asOf}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = isHistorical(asOf)
        ? await client.query(
            // TRUE HISTORICAL: open balance reconstructed AS OF asOf (canonical opco-scoped function).
            `
              SELECT
                vendor_id::text          AS vendor_id,
                COALESCE(vendor_name, 'Unknown vendor') AS vendor_name,
                open_bill_count::bigint     AS open_bill_count,
                current_cents::bigint       AS current_cents,
                bucket_1_30_cents::bigint   AS bucket_1_30_cents,
                bucket_31_60_cents::bigint  AS bucket_31_60_cents,
                bucket_61_90_cents::bigint  AS bucket_61_90_cents,
                bucket_91_plus_cents::bigint AS bucket_91_plus_cents,
                total_open_cents::bigint    AS total_open_cents
              FROM accounting.ap_aging_as_of($1::uuid, $2::date)
              WHERE total_open_cents > 0
              ORDER BY total_open_cents DESC, vendor_name ASC
            `,
            [query.data.operating_company_id, asOf]
          )
        : await client.query(
            // LIVE: canonical opco-scoped view (security_invoker; buckets computed at CURRENT_DATE).
            `
              SELECT
                vendor_id::text          AS vendor_id,
                COALESCE(vendor_name, 'Unknown vendor') AS vendor_name,
                open_bill_count::bigint     AS open_bill_count,
                current_cents::bigint       AS current_cents,
                bucket_1_30_cents::bigint   AS bucket_1_30_cents,
                bucket_31_60_cents::bigint  AS bucket_31_60_cents,
                bucket_61_90_cents::bigint  AS bucket_61_90_cents,
                bucket_91_plus_cents::bigint AS bucket_91_plus_cents,
                total_open_cents::bigint    AS total_open_cents
              FROM views.ap_aging
              WHERE operating_company_id = $1::uuid
                AND total_open_cents > 0
              ORDER BY total_open_cents DESC, vendor_name ASC
            `,
            [query.data.operating_company_id]
          );

      const rawRows = res.rows as Array<Record<string, unknown>>;

      const lastPay = await client.query(
        `
          SELECT
            COALESCE(NULLIF(trim(b.vendor_uuid), ''), b.vendor_id, 'unknown') AS vendor_key,
            MAX(bp.payment_date)::text AS last_payment_date
          FROM accounting.bill_payments bp
          JOIN accounting.bills b ON b.id = bp.bill_id
                                        AND b.operating_company_id = bp.operating_company_id
          WHERE bp.revoked_at IS NULL
            AND bp.payment_date <= $2::date
            AND bp.operating_company_id = $1::uuid
            AND b.operating_company_id = $1::uuid
          GROUP BY COALESCE(NULLIF(trim(b.vendor_uuid), ''), b.vendor_id, 'unknown')
        `,
        [query.data.operating_company_id, asOf]
      );
      const lastPayRows = lastPay.rows as Array<{ vendor_key: string; last_payment_date: string | null }>;
      const lastPayMap = new Map(lastPayRows.map((r) => [r.vendor_key, r.last_payment_date]));

      const rows: ApAgingRow[] = rawRows.map((row) => {
        const current = num(row.current_cents);
        const b1_30 = num(row.bucket_1_30_cents);
        const vendorId = String(row.vendor_id);
        return {
          vendor_id: vendorId,
          vendor_name: String(row.vendor_name ?? "Unknown vendor"),
          total_cents: num(row.total_open_cents),
          current_cents: current,
          bucket_1_30_cents: b1_30,
          bucket_0_30_cents: current + b1_30,
          bucket_31_60_cents: num(row.bucket_31_60_cents),
          bucket_61_90_cents: num(row.bucket_61_90_cents),
          bucket_91_plus_cents: num(row.bucket_91_plus_cents),
          last_payment_date: lastPayMap.get(vendorId) ?? null,
          bill_count: num(row.open_bill_count),
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

      return { as_of_date: asOf, totals, rows } satisfies ApAgingPayload;
    });

    cache.set(cacheKey, payload, 5 * 60 * 1000);
    return payload;
  });
}
