import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

// GAP — Load cancellations analytics (read-only). The Load Cancellations report screen requests one
// group_by dimension per call (reason | driver | customer | date) and renders count + cancelled-rate
// + charge totals per group. SELECT-only aggregation over dispatch.load_cancellations joined to
// mdata.loads (rate_total_cents = GROSS customer rate). Per-entity scoped via withCompanyScope
// (assertCompanyMembership + app.operating_company_id + RLS), so TRANSP only sees TRANSP rows.
// No writes, no GL posting — this is a reporting endpoint.

const groupByEnum = z.enum(["reason", "driver", "customer", "date"]);

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  group_by: groupByEnum.optional(),
});

type GroupBy = z.infer<typeof groupByEnum>;

type Row = {
  reason_code: string | null;
  reason_label: string | null;
  cancellation_charge_cents: number | null;
  rate_total_cents: number | null;
  cancelled_on: string | null;
  customer_id: string | null;
  customer_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
};

type ReportClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

type AnalyticsRow = {
  group_key: string;
  group_label: string;
  cancellation_count: number;
  total_charge_cents: number;
  total_rate_cents: number;
};

function keyAndLabel(row: Row, groupBy: GroupBy): { key: string; label: string } {
  switch (groupBy) {
    case "driver":
      return { key: row.driver_id ?? "unassigned", label: row.driver_name ?? "Unassigned" };
    case "customer":
      return { key: row.customer_id ?? "unknown", label: row.customer_name ?? "Unknown customer" };
    case "date":
      return { key: row.cancelled_on ?? "unknown", label: row.cancelled_on ?? "Unknown date" };
    case "reason":
    default:
      return { key: row.reason_code ?? "unknown", label: row.reason_label ?? row.reason_code ?? "Unknown" };
  }
}

// Group-and-sum into a stable, sorted list (count desc, then label).
function groupRows(rows: Row[], groupBy: GroupBy): AnalyticsRow[] {
  const map = new Map<string, AnalyticsRow>();
  for (const r of rows) {
    const { key, label } = keyAndLabel(r, groupBy);
    const b =
      map.get(key) ?? { group_key: key, group_label: label, cancellation_count: 0, total_charge_cents: 0, total_rate_cents: 0 };
    b.cancellation_count += 1;
    b.total_charge_cents += Number(r.cancellation_charge_cents ?? 0);
    b.total_rate_cents += Number(r.rate_total_cents ?? 0);
    map.set(key, b);
  }
  return [...map.values()].sort(
    (a, b) => b.cancellation_count - a.cancellation_count || a.group_label.localeCompare(b.group_label)
  );
}

export async function registerLoadCancellationsAnalyticsRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/load-cancellations/analytics", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = querySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const { operating_company_id: oci, from, to } = q.data;
    const groupBy: GroupBy = q.data.group_by ?? "reason";

    const result = await withCompanyScope(user.uuid, oci, async (client: ReportClient) => {
      const res = await client.query<Row>(
        `
          SELECT
            lc.reason_code,
            COALESCE(r.reason_label, lc.reason_code) AS reason_label,
            lc.cancellation_charge_cents,
            l.rate_total_cents,
            to_char(lc.cancelled_at AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS cancelled_on,
            l.customer_id,
            c.customer_name,
            l.assigned_primary_driver_id AS driver_id,
            NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
          FROM dispatch.load_cancellations lc
          LEFT JOIN mdata.loads l ON l.id = lc.load_id
          LEFT JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN catalogs.cancellation_reasons r ON r.reason_code = lc.reason_code
          WHERE lc.operating_company_id = $1::uuid
            AND ($2::date IS NULL OR lc.cancelled_at >= $2::date)
            AND ($3::date IS NULL OR lc.cancelled_at < ($3::date + 1))
          ORDER BY lc.cancelled_at DESC NULLS LAST
        `,
        [oci, from ?? null, to ?? null]
      );

      return {
        period: { from: from ?? null, to: to ?? null },
        group_by: groupBy,
        rows: groupRows(res.rows, groupBy),
      };
    });

    return reply.send(result);
  });
}
