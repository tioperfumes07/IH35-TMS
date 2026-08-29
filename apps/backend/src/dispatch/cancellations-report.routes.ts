import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

// GAP-10 — Load cancellations analytics report. Read-only aggregation over dispatch.load_cancellations,
// grouped by reason / driver / customer / date in one response. Per-entity scoped via withCompanyScope
// (assertCompanyMembership + app.operating_company_id + RLS), so TRANSP only sees TRANSP cancellations.

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type Row = {
  reason_code: string | null;
  reason_label: string | null;
  cancellation_charge_cents: number | null;
  billable_to_customer: boolean | null;
  cancelled_on: string | null;
  customer_id: string | null;
  customer_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
};

type ReportClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

type Bucket = { key: string; label: string; count: number; total_charge_cents: number; billable_count: number };

// Generic group-and-sum into a stable, sorted bucket list (count desc, then label).
function groupBy(rows: Row[], keyOf: (r: Row) => string, labelOf: (r: Row) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const key = keyOf(r);
    const label = labelOf(r);
    const b = map.get(key) ?? { key, label, count: 0, total_charge_cents: 0, billable_count: 0 };
    b.count += 1;
    b.total_charge_cents += Number(r.cancellation_charge_cents ?? 0);
    if (r.billable_to_customer) b.billable_count += 1;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function registerCancellationsReportRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/cancellations-report", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = querySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const { operating_company_id: oci, from, to } = q.data;

    const result = await withCompanyScope(user.uuid, oci, async (client: ReportClient) => {
      const res = await client.query<Row>(
        `
          SELECT
            lc.reason_code,
            -- Resolve the label from the catalog dispatch actually writes from
            -- (catalogs.load_cancellation_reasons, entity-scoped, 21 distinct codes) and keep the
            -- legacy global catalog as a fallback tier. Joining only the legacy 9-row table left
            -- 12 of those 21 codes unmatched, so the report rendered raw codes like FORCE_WEATHER
            -- and CUST_NO_SHOW_AT_PICKUP. Both tiers are kept so no label can regress.
            COALESCE(lcr.display_name, r.reason_label, lc.reason_code) AS reason_label,
            lc.cancellation_charge_cents,
            lc.billable_to_customer,
            to_char(lc.cancelled_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS cancelled_on,
            l.customer_id,
            -- CANCELLATIONS-REPORT-CUSTOMER-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS: mdata.customers'
            -- own FORCE RLS policy excludes deactivated-but-not-deleted rows for a non-bypass
            -- reader, so a plain join produces a NULL-extended row (never "Unknown customer" by
            -- data, just by RLS visibility) for any cancellation whose customer was later
            -- deactivated -- confirmed live (TEST-Customer-One-20260806, deactivated_at set).
            -- Same fix family as AUDIT-TRAIL-SUBJECT-LABEL-LOST-FOR-DEACTIVATED-ENTITIES: fall back
            -- to the canonical same-company resolver instead of widening RLS or the join.
            COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, lc.operating_company_id)) AS customer_name,
            l.assigned_primary_driver_id AS driver_id,
            COALESCE(
              NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), ''),
              mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, lc.operating_company_id)
            ) AS driver_name
          FROM dispatch.load_cancellations lc
          LEFT JOIN mdata.loads l ON l.id = lc.load_id
                                 AND l.operating_company_id = lc.operating_company_id
          LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                     AND c.operating_company_id = lc.operating_company_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                   AND (d.operating_company_id = lc.operating_company_id OR EXISTS (
                                     SELECT 1 FROM mdata.driver_company_authorizations cancellation_report_driver_dca
                                      WHERE cancellation_report_driver_dca.driver_id = d.id
                                        AND cancellation_report_driver_dca.company_id = lc.operating_company_id
                                        AND cancellation_report_driver_dca.is_authorized = true
                                        AND cancellation_report_driver_dca.deactivated_at IS NULL
                                   ))
          LEFT JOIN catalogs.load_cancellation_reasons lcr
            ON lcr.reason_code = lc.reason_code
           AND lcr.operating_company_id = lc.operating_company_id
          LEFT JOIN catalogs.cancellation_reasons r ON r.reason_code = lc.reason_code
          WHERE lc.operating_company_id = $1::uuid
            AND ($2::date IS NULL OR lc.cancelled_at >= $2::date)
            AND ($3::date IS NULL OR lc.cancelled_at < ($3::date + 1))
          ORDER BY lc.cancelled_at DESC NULLS LAST
        `,
        [oci, from ?? null, to ?? null]
      );
      const rows = res.rows;

      const total = rows.reduce(
        (acc, r) => {
          acc.count += 1;
          acc.total_charge_cents += Number(r.cancellation_charge_cents ?? 0);
          if (r.billable_to_customer) acc.billable_count += 1;
          return acc;
        },
        { count: 0, total_charge_cents: 0, billable_count: 0 }
      );

      return {
        operating_company_id: oci,
        from: from ?? null,
        to: to ?? null,
        total,
        by_reason: groupBy(rows, (r) => r.reason_code ?? "unknown", (r) => r.reason_label ?? r.reason_code ?? "Unknown"),
        by_driver: groupBy(rows, (r) => r.driver_id ?? "unassigned", (r) => r.driver_name ?? "Unassigned"),
        by_customer: groupBy(rows, (r) => r.customer_id ?? "unknown", (r) => r.customer_name ?? "Unknown customer"),
        by_date: groupBy(rows, (r) => r.cancelled_on ?? "unknown", (r) => r.cancelled_on ?? "Unknown date"),
      };
    });

    return reply.send(result);
  });
}
