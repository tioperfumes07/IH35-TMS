import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";

// A10 — GET list read-model for the frontend FuelTransactionsTable
// (apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx), which takes a `rows: FuelTransactionRow[]`
// prop (id, transaction_date, driver_name, gallons, amount_cents, station) but had no fetch hook / API
// call wired to it yet — fuel.fuel_transactions (0300 + 202607050840) had a writer (FUEL-1 import) but
// no list reader. Read-only, entity-scoped, paginated; joins driver/unit/load/vendor for names + also
// returns the raw ids so a consumer can drill through (Law of the Land — total connectivity).

const listFuelTransactionsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerFuelTransactionsRoutes(app: FastifyInstance) {
  // List fuel.fuel_transactions for the FuelTransactionsTable / transaction-register surfaces.
  // Entity-scoped via app.operating_company_id (RLS policy fuel_tx_company_isolation, migration 0300).
  app.get("/api/v1/fuel/transactions", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = listFuelTransactionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const result = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const tableExists = await client.query(
        `SELECT to_regclass('fuel.fuel_transactions') IS NOT NULL AS ok`
      );
      if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) return { unavailable: true as const };

      const values: unknown[] = [q.operating_company_id];
      const filters: string[] = ["ft.operating_company_id = $1", "ft.archived_at IS NULL"];
      if (q.driver_id) {
        values.push(q.driver_id);
        filters.push(`ft.driver_id = $${values.length}`);
      }
      if (q.unit_id) {
        values.push(q.unit_id);
        filters.push(`ft.unit_id = $${values.length}`);
      }
      if (q.load_id) {
        values.push(q.load_id);
        filters.push(`ft.load_id = $${values.length}`);
      }
      if (q.from) {
        values.push(q.from);
        filters.push(`ft.transaction_at::date >= $${values.length}::date`);
      }
      if (q.to) {
        values.push(q.to);
        filters.push(`ft.transaction_at::date <= $${values.length}::date`);
      }
      const whereClause = `WHERE ${filters.join(" AND ")}`;

      const countRes = await client.query(
        `SELECT count(*)::int AS total FROM fuel.fuel_transactions ft ${whereClause}`,
        values
      );

      values.push(q.limit);
      values.push(q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            ft.id,
            ft.transaction_at,
            ft.purchased_at,
            ft.load_id,
            l.load_number,
            ft.driver_id,
            NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), '') AS driver_name,
            ft.unit_id,
            u.unit_number,
            ft.vendor_id,
            v.vendor_name,
            ft.fuel_type,
            ft.gallons,
            ft.price_per_gallon,
            ft.total_cost,
            ft.location_city,
            ft.location_state,
            ft.source,
            ft.load_required,
            ft.load_exemption_reason,
            ft.created_at
          FROM fuel.fuel_transactions ft
          -- Entity-scope the joins to the SAME company as the transaction (defense in depth: a
          -- load_id/driver_id/unit_id should never point cross-company, but never trust that silently).
          LEFT JOIN mdata.loads l ON l.id = ft.load_id AND l.operating_company_id = ft.operating_company_id
          LEFT JOIN mdata.drivers d ON d.id = ft.driver_id AND d.operating_company_id = ft.operating_company_id
          LEFT JOIN mdata.units u ON u.id = ft.unit_id
            AND (u.owner_company_id = ft.operating_company_id OR u.currently_leased_to_company_id = ft.operating_company_id)
          LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
          ${whereClause}
          ORDER BY ft.transaction_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        rows: rowsRes.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          // FuelTransactionRow shape:
          transaction_date: row.transaction_at,
          driver_name: (row.driver_name as string | null) ?? "Unassigned",
          gallons: row.gallons === null ? 0 : Number(row.gallons),
          amount_cents: Math.round(Number(row.total_cost ?? 0) * 100),
          station:
            (row.vendor_name as string | null) ??
            ([row.location_city, row.location_state].filter(Boolean).join(", ") || "Unknown"),
          // Drill-through linkage (Law of the Land — total connectivity): raw ids/refs alongside the
          // display shape so a consumer can link to the driver/unit/load without a second lookup.
          driver_id: row.driver_id,
          unit_id: row.unit_id,
          unit_number: row.unit_number,
          load_id: row.load_id,
          load_number: row.load_number,
          vendor_id: row.vendor_id,
          fuel_type: row.fuel_type,
          price_per_gallon: row.price_per_gallon === null ? null : Number(row.price_per_gallon),
          source: row.source,
          load_required: row.load_required,
          load_exemption_reason: row.load_exemption_reason,
          purchased_at: row.purchased_at,
          created_at: row.created_at,
        })),
        total: Number((countRes.rows[0] as { total?: number } | undefined)?.total ?? 0),
      };
    });

    if ("unavailable" in result) {
      return reply.code(501).send({ error: "fuel_transactions_unavailable" });
    }
    return {
      transactions: result.rows,
      total_count: result.total,
      has_more: q.offset + q.limit < result.total,
    };
  });
}
