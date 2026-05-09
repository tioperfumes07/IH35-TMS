import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

export async function registerArAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ar-aging", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            customer_id,
            customer_name,
            open_invoice_count,
            current_cents,
            bucket_1_30_cents,
            bucket_31_60_cents,
            bucket_61_90_cents,
            bucket_91_plus_cents,
            total_open_cents
          FROM views.ar_aging
          WHERE operating_company_id = $1
          ORDER BY total_open_cents DESC
        `,
        [query.data.operating_company_id]
      );
      return res.rows as Array<{
        customer_id: string;
        customer_name: string;
        open_invoice_count: number | string;
        current_cents: number | string | bigint;
        bucket_1_30_cents: number | string | bigint;
        bucket_31_60_cents: number | string | bigint;
        bucket_61_90_cents: number | string | bigint;
        bucket_91_plus_cents: number | string | bigint;
        total_open_cents: number | string | bigint;
      }>;
    });

    return {
      status: "real",
      generated_at: new Date().toISOString(),
      total_open_cents: rows.reduce((sum, row) => sum + Number(row.total_open_cents ?? 0), 0),
      total_open_invoices: rows.reduce((sum, row) => sum + Number(row.open_invoice_count ?? 0), 0),
      rows: rows.map((row) => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        open_invoice_count: Number(row.open_invoice_count ?? 0),
        current_cents: Number(row.current_cents ?? 0),
        bucket_1_30_cents: Number(row.bucket_1_30_cents ?? 0),
        bucket_31_60_cents: Number(row.bucket_31_60_cents ?? 0),
        bucket_61_90_cents: Number(row.bucket_61_90_cents ?? 0),
        bucket_91_plus_cents: Number(row.bucket_91_plus_cents ?? 0),
        total_open_cents: Number(row.total_open_cents ?? 0),
      })),
    };
  });
}
