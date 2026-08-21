import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { canAccessDriverLoadBills } from "./driver-bills-access.js";

const querySchema = companyQuerySchema.extend({
  load_id: z.string().uuid(),
});

const openBillsQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerDriverFinanceDriverBillsRoutes(app: FastifyInstance) {
  // Rate-limited (CodeQL js/missing-rate-limiting). Pre-existing; the plugin is global:false so an
  // un-configured route has NO limit at all. Surfaced because this PR touched the file.
  app.get("/api/v1/driver-finance/driver-bills", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const reg = await client.query(`SELECT to_regclass('driver_finance.driver_bills') IS NOT NULL AS ok`);
      if (!Boolean(reg.rows[0]?.ok)) return { kind: "unavailable" as const };

      const loadRes = await client.query(
        `
          SELECT
            l.id,
            l.load_number,
            d1.identity_user_id AS primary_identity_user_id,
            d2.identity_user_id AS secondary_identity_user_id
          FROM mdata.loads l
          -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED): the load is scoped, the drivers it resolves were
          -- not. These supply identity_user_id, which downstream decides WHO may see a driver bill — so an
          -- unscoped match here is an authorization input, not just a label.
          LEFT JOIN mdata.drivers d1 ON d1.id = l.assigned_primary_driver_id
                                    AND d1.operating_company_id = l.operating_company_id
          LEFT JOIN mdata.drivers d2 ON d2.id = l.assigned_secondary_driver_id
                                    AND d2.operating_company_id = l.operating_company_id
          WHERE l.id = $1
            AND l.operating_company_id = $2::uuid
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [parsed.data.load_id, parsed.data.operating_company_id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return { kind: "not_found" as const };

      if (
        !canAccessDriverLoadBills(
          String(user.role ?? ""),
          user.uuid,
          load.primary_identity_user_id,
          load.secondary_identity_user_id
        )
      ) {
        return { kind: "forbidden" as const };
      }

      // DISPATCH-DRIVER-PAY-BILL-DRIVER-HUMAN-LABEL-MISSING — this endpoint returned no
      // driver_name (SELECT * has no driver join at all), so the mounted LoadDetailDriverPayTab
      // EntityLink rendered a hardcoded generic "Driver" label instead of the driver's own name.
      // Same-company LEFT JOIN mdata.drivers, mirroring the identical pattern already used by the
      // sibling /driver-bills/open route below — never a cross-entity guess.
      const billsRes = await client.query(
        `
          SELECT
            db.*,
            concat_ws(' ', d.first_name, d.last_name) AS driver_name
          FROM driver_finance.driver_bills db
          LEFT JOIN mdata.drivers d ON d.id = db.driver_id AND d.operating_company_id = db.operating_company_id
          WHERE db.operating_company_id = $1::uuid
            AND db.load_id = $2
          ORDER BY db.created_at ASC
        `,
        [parsed.data.operating_company_id, parsed.data.load_id]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.driver_bills.viewed",
        {
          operating_company_id: parsed.data.operating_company_id,
          load_id: parsed.data.load_id,
          load_number: load.load_number ?? null,
          bill_count: billsRes.rows.length,
        },
        "info",
        "P6-T11172"
      );

      return { kind: "ok" as const, bills: billsRes.rows };
    });

    if (!payload) return reply.code(500).send({ error: "driver_bills_failed" });
    if (payload.kind === "unavailable") return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (payload.kind === "not_found") return reply.code(404).send({ error: "load_not_found" });
    if (payload.kind === "forbidden") return reply.code(403).send({ error: "forbidden" });

    return { driver_bills: payload.bills };
  });

  /**
   * GET /api/v1/driver-finance/driver-bills/open
   * Returns all open (unsettled) driver bills for the company, optionally filtered by driver.
   * Powers the Settlements page KPI + list/detail "open driver bills" bands so unsettled driver
   * pay is visible instead of appearing stuck at $0.
   */
  app.get("/api/v1/driver-finance/driver-bills/open", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = openBillsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const reg = await client.query(`SELECT to_regclass('driver_finance.driver_bills') IS NOT NULL AS ok`);
      if (!Boolean(reg.rows[0]?.ok)) return { kind: "unavailable" as const };

      const driverFilter = parsed.data.driver_id ? "AND db.driver_id = $2" : "";
      const countValues: unknown[] = [parsed.data.operating_company_id];
      const queryValues: unknown[] = [parsed.data.operating_company_id];
      if (parsed.data.driver_id) {
        countValues.push(parsed.data.driver_id);
        queryValues.push(parsed.data.driver_id);
      }
      queryValues.push(parsed.data.limit, parsed.data.offset);

      const countRes = await client.query(
        `SELECT count(*)::int AS cnt, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS total_gross_cents
         FROM driver_finance.driver_bills db
         WHERE db.operating_company_id = $1::uuid AND db.status = 'open' ${driverFilter}`,
        countValues
      );

      const billsRes = await client.query(
        `
          SELECT
            db.id,
            db.load_id,
            db.load_number,
            db.bill_number,
            db.driver_id,
            db.gross_amount_cents,
            db.miles_basis,
            db.miles_basis_type,
            db.rate_per_mile_cents,
            db.created_at,
            concat_ws(' ', d.first_name, d.last_name) AS driver_name
          FROM driver_finance.driver_bills db
          LEFT JOIN mdata.drivers d ON d.id = db.driver_id AND d.operating_company_id = db.operating_company_id
          WHERE db.operating_company_id = $1::uuid AND db.status = 'open' ${driverFilter}
          ORDER BY db.created_at DESC
          LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}
        `,
        queryValues
      );

      return {
        kind: "ok" as const,
        total_count: Number(countRes.rows[0]?.cnt ?? 0),
        total_gross_cents: Number(countRes.rows[0]?.total_gross_cents ?? 0),
        bills: billsRes.rows,
      };
    });

    if (!payload) return reply.code(500).send({ error: "driver_bills_failed" });
    if (payload.kind === "unavailable") return reply.code(501).send({ error: "driver_finance_schema_not_available" });

    return {
      open_driver_bills: {
        total_count: payload.total_count,
        total_gross_cents: payload.total_gross_cents,
        items: payload.bills,
      },
    };
  });
}
