import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/**
 * D1 (owner law, 2026-09-13, verbatim: "the exception queue BECOMES the navigation") — three
 * standing exception counts that don't yet have a home elsewhere: unmatched fuel, loads with no
 * driver bill, loads with no tour. Read-only, no posting, no auto-anything (Owner Law B). The
 * OTHER two chips this round (insurance-schedule, duplicate-expenses) already have their own
 * live-computed counts — GET /api/v1/insurance/summary's policies_expiring_30d and
 * GET /api/v1/expenses/duplicates's group_count — and are consumed directly, not duplicated here.
 *
 * LOADS FENCE: this route only READS mdata.loads.presettlement_link_id / driver_finance rows to
 * count and list them for display. It writes nothing and does not touch load status, tours, or
 * trip linkage — those stay Cursor's.
 *
 * Every definition below is verified live against a bypass_rls query (pasted in the shipping PR)
 * to match the owner's own measured figures exactly (7 loads / 14 loads, load-number-for-load-number).
 */

const querySchema = companyQuerySchema;

function authUser(req: FastifyRequest, reply: FastifyReply) {
  return currentAuthUser(req, reply);
}

export async function registerExceptionQueueRoutes(app: FastifyInstance) {
  // Standing count: non-cancelled loads with no driver_finance.driver_bills row at all — includes
  // the driverless/orphan case (no driver, no unit, no tour, no bill) the owner explicitly wants
  // counted, not just loads that already have a driver assigned but no bill yet.
  app.get(
    "/api/v1/reports/exception-queue-counts",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      const counts = await withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client: Queryable) => {
        const loadsWithoutDriverBill = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
              FROM mdata.loads l
              LEFT JOIN driver_finance.driver_bills db ON db.load_id = l.id
             WHERE l.operating_company_id = $1::uuid
               AND l.soft_deleted_at IS NULL
               AND l.status <> 'cancelled'
               AND db.id IS NULL
          `,
          [parsed.data.operating_company_id]
        );
        // "No tour" = mdata.loads.presettlement_link_id IS NULL — the same predicate the load-to-cash
        // chain law names for Chain Link 2. tour_id is deliberately NOT also checked: a load can carry
        // a tour_id while still lacking the presettlement link that is the actual settlement anchor
        // (owner-confirmed live: load 13580 has a tour_id but presettlement_link_id IS NULL and is on
        // the owner's own named 14-load list).
        const loadsWithoutTour = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
              FROM mdata.loads l
             WHERE l.operating_company_id = $1::uuid
               AND l.soft_deleted_at IS NULL
               AND l.status <> 'cancelled'
               AND l.presettlement_link_id IS NULL
          `,
          [parsed.data.operating_company_id]
        );
        // "Unmatched fuel" = a fuel transaction with no unit resolved either directly or via its
        // matched load — the same predicate the Fuel Reconciliation report already uses per-period
        // (fuel-reconciliation.routes.ts), applied here with no date range for a standing count.
        const unmatchedFuel = await client.query<{ count: string }>(
          `
            SELECT count(*)::text AS count
              FROM fuel.fuel_transactions ft
              LEFT JOIN mdata.loads l
                ON l.id = ft.load_id
               AND l.operating_company_id = ft.operating_company_id
               AND l.soft_deleted_at IS NULL
             WHERE ft.operating_company_id = $1::uuid
               AND ft.archived_at IS NULL
               AND COALESCE(ft.unit_id, l.assigned_unit_id) IS NULL
          `,
          [parsed.data.operating_company_id]
        );
        return {
          loads_without_driver_bill_count: Number(loadsWithoutDriverBill.rows[0]?.count ?? 0),
          loads_without_tour_count: Number(loadsWithoutTour.rows[0]?.count ?? 0),
          unmatched_fuel_count: Number(unmatchedFuel.rows[0]?.count ?? 0),
        };
      });

      return reply.code(200).send(counts);
    }
  );

  // The actual 7 rows behind "Loads without a driver bill" — the broader, standing-visibility list
  // (includes the 3 fully driverless orphans) distinct from the narrower
  // /api/v1/mdata/loads/needs-driver-bill-remint, which intentionally requires a seated driver
  // because that endpoint's own POST mints a bill and cannot do so with no driver to bill against.
  // This list exists so the 3 orphans are visible somewhere at all, per the owner's own framing
  // ("orphans end to end. Report what created them.").
  app.get(
    "/api/v1/reports/loads-without-driver-bill",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      const rows = await withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client: Queryable) => {
        return client.query<{
          id: string;
          load_number: string;
          status: string;
          driver_id: string | null;
          driver_name: string | null;
          unit_id: string | null;
          unit_number: string | null;
        }>(
          `
            SELECT l.id::text, l.load_number, l.status::text,
                   d.id::text AS driver_id,
                   NULLIF(TRIM(CONCAT(d.first_name, ' ', d.last_name)), '') AS driver_name,
                   u.id::text AS unit_id, u.unit_number
              FROM mdata.loads l
              LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                        AND d.operating_company_id = l.operating_company_id
              LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
              LEFT JOIN driver_finance.driver_bills db ON db.load_id = l.id
             WHERE l.operating_company_id = $1::uuid
               AND l.soft_deleted_at IS NULL
               AND l.status <> 'cancelled'
               AND db.id IS NULL
             ORDER BY l.load_number ASC
          `,
          [parsed.data.operating_company_id]
        );
      });

      return reply.code(200).send({ loads: rows.rows, total_count: rows.rows.length });
    }
  );

  // The actual 14 rows behind "Loads without a tour" — same predicate as the count above, plus the
  // fields a dispatcher needs to act (driver/unit if any, status). Read-only; no new page needed
  // beyond this data source (LoadsWithoutTourPage.tsx consumes it).
  app.get(
    "/api/v1/reports/loads-without-tour",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      const rows = await withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client: Queryable) => {
        return client.query<{
          id: string;
          load_number: string;
          status: string;
          driver_id: string | null;
          driver_name: string | null;
          unit_id: string | null;
          unit_number: string | null;
        }>(
          `
            SELECT l.id::text, l.load_number, l.status::text,
                   d.id::text AS driver_id,
                   NULLIF(TRIM(CONCAT(d.first_name, ' ', d.last_name)), '') AS driver_name,
                   u.id::text AS unit_id, u.unit_number
              FROM mdata.loads l
              LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                        AND d.operating_company_id = l.operating_company_id
              LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
             WHERE l.operating_company_id = $1::uuid
               AND l.soft_deleted_at IS NULL
               AND l.status <> 'cancelled'
               AND l.presettlement_link_id IS NULL
             ORDER BY l.load_number ASC
          `,
          [parsed.data.operating_company_id]
        );
      });

      return reply.code(200).send({ loads: rows.rows, total_count: rows.rows.length });
    }
  );
}
