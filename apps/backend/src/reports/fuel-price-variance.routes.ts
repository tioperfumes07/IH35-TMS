import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
});

export async function registerFuelPriceVarianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/fuel-price-variance", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    if (parsed.data.from > parsed.data.to) {
      return reply.code(400).send({ error: "validation_error", details: { period: ["from must be on or before to"] } });
    }

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          WITH daily_state_benchmark AS (
            SELECT
              effective_date,
              upper(nullif(trim(state), '')) AS state,
              avg(price_per_gallon)::numeric AS benchmark_price_per_gallon
            FROM fuel.loves_prices_daily
            WHERE operating_company_id = $1::uuid
              AND effective_date BETWEEN $2::date AND $3::date
            GROUP BY effective_date, upper(nullif(trim(state), ''))
          )
          SELECT
            ft.id::text AS transaction_id,
            ft.transaction_at::date::text AS transaction_date,
            coalesce(v.vendor_name, nullif(trim(concat_ws(', ', ft.location_city, ft.location_state)), ''), 'Unknown station') AS station,
            u.id::text AS unit_id,
            u.unit_number::text AS unit_number,
            ft.gallons::numeric AS gallons,
            ft.price_per_gallon::numeric AS actual_price_per_gallon,
            b.benchmark_price_per_gallon,
            (ft.price_per_gallon - b.benchmark_price_per_gallon)::numeric AS variance_per_gallon,
            ((ft.price_per_gallon - b.benchmark_price_per_gallon) * coalesce(ft.gallons, 0))::numeric AS total_variance_dollars
          FROM fuel.fuel_transactions ft
          JOIN daily_state_benchmark b
            ON b.effective_date = ft.transaction_at::date
           AND b.state IS NOT DISTINCT FROM upper(nullif(trim(ft.location_state), ''))
          LEFT JOIN mdata.units u
            ON u.id = ft.unit_id
           AND (u.owner_company_id = ft.operating_company_id OR u.currently_leased_to_company_id = ft.operating_company_id)
          LEFT JOIN mdata.vendors v
            ON v.id = ft.vendor_id
           AND v.operating_company_id = ft.operating_company_id
          WHERE ft.operating_company_id = $1::uuid
            AND ft.archived_at IS NULL
            AND ft.transaction_at::date BETWEEN $2::date AND $3::date
            AND ft.price_per_gallon IS NOT NULL
          ORDER BY abs((ft.price_per_gallon - b.benchmark_price_per_gallon) * coalesce(ft.gallons, 0)) DESC,
                   ft.transaction_at DESC
        `,
        [parsed.data.operating_company_id, parsed.data.from, parsed.data.to]
      );
      return result.rows.map((row: Record<string, unknown>) => ({
        ...row,
        gallons: Number(row.gallons ?? 0),
        actual_price_per_gallon: Number(row.actual_price_per_gallon ?? 0),
        benchmark_price_per_gallon: Number(row.benchmark_price_per_gallon ?? 0),
        variance_per_gallon: Number(row.variance_per_gallon ?? 0),
        total_variance_dollars: Number(row.total_variance_dollars ?? 0),
      }));
    });
    return { period: { from: parsed.data.from, to: parsed.data.to }, benchmark: "company_daily_state_loves", rows };
  });
}
