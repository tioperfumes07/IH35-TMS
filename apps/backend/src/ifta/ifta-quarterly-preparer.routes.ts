import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { buildIftaCsvContent, buildIftaCsvObjectKey } from "./ifta-csv-generator.js";
import { aggregateStateGallons } from "./ifta-state-gallons-aggregator.js";
import { aggregateStateMiles, quarterWindow } from "./ifta-state-miles-aggregator.js";
import { calculateStateTaxes } from "./ifta-tax-calculator.js";
import { generatePresignedDownloadUrl, isR2Configured, putObjectBytes } from "../storage/r2-client.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createBodySchema = z.object({
  quarter: z.coerce.number().int().min(1).max(4),
  year: z.coerce.number().int().min(2000).max(2100),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

function currentAuthUser(req: any, reply: any) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function loadPreparation(client: any, operatingCompanyId: string, id: string) {
  const res = await client.query(
    `
      SELECT *
      FROM ifta.quarterly_preparations
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

export async function registerIftaQuarterlyPreparerRoutes(app: FastifyInstance) {
  app.post("/api/v1/ifta/preparations", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const data = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const insertRes = await client.query(
        `
          INSERT INTO ifta.quarterly_preparations (operating_company_id, quarter, year, status)
          VALUES ($1::uuid, $2, $3, 'draft')
          ON CONFLICT (operating_company_id, quarter, year)
          DO UPDATE SET updated_at = now()
          RETURNING *
        `,
        [query.data.operating_company_id, body.data.quarter, body.data.year]
      );
      return insertRes.rows[0];
    });
    return reply.code(201).send(data);
  });

  app.get("/api/v1/ifta/preparations/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return null;
      const milesRes = await client.query(
        `SELECT state, miles, source, override_miles FROM ifta.state_miles_by_quarter WHERE preparation_id = $1::uuid ORDER BY state`,
        [params.data.id]
      );
      const gallonsRes = await client.query(
        `SELECT state, gallons, source, source_records, override_gallons FROM ifta.state_gallons_by_quarter WHERE preparation_id = $1::uuid ORDER BY state`,
        [params.data.id]
      );
      const taxRes = await client.query(
        `SELECT state, miles_in_state, taxable_gallons, gallons_purchased_in_state, net_taxable_gallons, tax_rate_per_gallon, tax_owed, mpg_in_state, calculated_at FROM ifta.state_tax_by_quarter WHERE preparation_id = $1::uuid ORDER BY state`,
        [params.data.id]
      );
      return { ...prep, state_miles: milesRes.rows, state_gallons: gallonsRes.rows, state_taxes: taxRes.rows };
    });
    if (!payload) return reply.code(404).send({ error: "preparation_not_found" });
    return payload;
  });

  app.post("/api/v1/ifta/preparations/:id/aggregate-miles", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return { code: 404 as const, error: "preparation_not_found" as const };

      const window = quarterWindow(Number(prep.quarter), Number(prep.year));
      const rows = await aggregateStateMiles(client, query.data.operating_company_id, window);

      await client.query(`DELETE FROM ifta.state_miles_by_quarter WHERE preparation_id = $1::uuid`, [params.data.id]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO ifta.state_miles_by_quarter (preparation_id, state, miles, source) VALUES ($1::uuid, $2, $3, $4)`,
          [params.data.id, row.state, row.miles, row.source]
        );
      }
      await client.query(
        `
          UPDATE ifta.quarterly_preparations
          SET status = 'miles_aggregated', miles_aggregated_at = now(), updated_at = now()
          WHERE id = $1::uuid
        `,
        [params.data.id]
      );
      return { code: 200 as const, data: { rows, total_miles: rows.reduce((sum, row) => sum + row.miles, 0) } };
    });

    if ("error" in payload) return reply.code(payload.code).send({ error: payload.error });
    return payload.data;
  });

  app.post("/api/v1/ifta/preparations/:id/aggregate-gallons", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return { code: 404 as const, error: "preparation_not_found" as const };

      const window = quarterWindow(Number(prep.quarter), Number(prep.year));
      const rows = await aggregateStateGallons(client, query.data.operating_company_id, window);

      await client.query(`DELETE FROM ifta.state_gallons_by_quarter WHERE preparation_id = $1::uuid`, [params.data.id]);
      for (const row of rows) {
        await client.query(
          `INSERT INTO ifta.state_gallons_by_quarter (preparation_id, state, gallons, source, source_records) VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
          [params.data.id, row.state, row.gallons, row.source, JSON.stringify(row.source_records)]
        );
      }
      await client.query(
        `
          UPDATE ifta.quarterly_preparations
          SET status = CASE WHEN status = 'draft' THEN 'gallons_aggregated' ELSE status END,
              gallons_aggregated_at = now(), updated_at = now()
          WHERE id = $1::uuid
        `,
        [params.data.id]
      );
      return { code: 200 as const, data: { rows, total_gallons: rows.reduce((sum, row) => sum + row.gallons, 0) } };
    });

    if ("error" in payload) return reply.code(payload.code).send({ error: payload.error });
    return payload.data;
  });

  app.post("/api/v1/ifta/preparations/:id/calculate-tax", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return { code: 404 as const, error: "preparation_not_found" as const };

      const milesRes = await client.query(`SELECT state, miles, override_miles FROM ifta.state_miles_by_quarter WHERE preparation_id = $1::uuid`, [
        params.data.id,
      ]);
      const gallonsRes = await client.query(
        `SELECT state, gallons, override_gallons FROM ifta.state_gallons_by_quarter WHERE preparation_id = $1::uuid`,
        [params.data.id]
      );
      if (milesRes.rows.length === 0 || gallonsRes.rows.length === 0) {
        return { code: 400 as const, error: "missing_miles_or_gallons" as const };
      }

      const calc = calculateStateTaxes({
        quarter: Number(prep.quarter),
        year: Number(prep.year),
        stateMiles: milesRes.rows,
        stateGallons: gallonsRes.rows,
      });

      await client.query(`DELETE FROM ifta.state_tax_by_quarter WHERE preparation_id = $1::uuid`, [params.data.id]);
      for (const row of calc.rows) {
        await client.query(
          `
            INSERT INTO ifta.state_tax_by_quarter (
              preparation_id, state, miles_in_state, taxable_gallons, gallons_purchased_in_state,
              net_taxable_gallons, tax_rate_per_gallon, tax_owed, mpg_in_state, calculated_at
            ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, now())
          `,
          [
            params.data.id,
            row.state,
            row.miles_in_state,
            row.taxable_gallons,
            row.gallons_purchased_in_state,
            row.net_taxable_gallons,
            row.tax_rate_per_gallon,
            row.tax_owed,
            row.mpg_in_state,
          ]
        );
      }
      await client.query(
        `
          UPDATE ifta.quarterly_preparations
          SET status = 'tax_calculated', tax_calculated_at = now(), updated_at = now()
          WHERE id = $1::uuid
        `,
        [params.data.id]
      );
      return { code: 200 as const, data: { rows: calc.rows, fleet_mpg: calc.fleetMpg, total_tax_owed: calc.totalTaxOwed } };
    });

    if ("error" in payload) return reply.code(payload.code).send({ error: payload.error });
    return payload.data;
  });

  app.post("/api/v1/ifta/preparations/:id/generate-csv", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return { code: 404 as const, error: "preparation_not_found" as const };

      const taxRes = await client.query(
        `SELECT state, miles_in_state, taxable_gallons, gallons_purchased_in_state, net_taxable_gallons, tax_rate_per_gallon, tax_owed, mpg_in_state FROM ifta.state_tax_by_quarter WHERE preparation_id = $1::uuid ORDER BY state`,
        [params.data.id]
      );
      if (taxRes.rows.length === 0) return { code: 400 as const, error: "tax_not_calculated" as const };

      const companyRes = await client.query(`SELECT code, legal_name FROM org.companies WHERE id = $1::uuid LIMIT 1`, [
        query.data.operating_company_id,
      ]);
      const carrierIfta = String(companyRes.rows[0]?.code ?? companyRes.rows[0]?.legal_name ?? "UNKNOWN");

      const csv = buildIftaCsvContent({
        carrierIftaNumber: carrierIfta,
        quarter: Number(prep.quarter),
        year: Number(prep.year),
        stateTaxRows: taxRes.rows.map((row: Record<string, unknown>) => ({
          state: String(row.state),
          miles_in_state: Number(row.miles_in_state),
          taxable_gallons: Number(row.taxable_gallons),
          gallons_purchased_in_state: Number(row.gallons_purchased_in_state),
          net_taxable_gallons: Number(row.net_taxable_gallons),
          tax_rate_per_gallon: Number(row.tax_rate_per_gallon),
          tax_owed: Number(row.tax_owed),
          mpg_in_state: row.mpg_in_state != null ? Number(row.mpg_in_state) : null,
        })),
      });

      const objectKey = buildIftaCsvObjectKey(query.data.operating_company_id, params.data.id, Number(prep.quarter), Number(prep.year));
      await putObjectBytes(objectKey, Buffer.from(csv, "utf8"), "text/csv");
      const signed = await generatePresignedDownloadUrl(objectKey, 3600);

      await client.query(
        `
          UPDATE ifta.quarterly_preparations
          SET status = 'csv_generated', csv_generated_at = now(), csv_url = $2, updated_at = now()
          WHERE id = $1::uuid
        `,
        [params.data.id, objectKey]
      );

      return { code: 200 as const, data: { download_url: signed.url, csv_object_key: objectKey, expires_in_seconds: signed.expires_in_seconds } };
    });

    if ("error" in payload) return reply.code(payload.code).send({ error: payload.error });
    return payload.data;
  });

  app.get("/api/v1/ifta/preparations/:id/csv", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return { code: 404 as const, error: "preparation_not_found" as const };
      const objectKey = prep.csv_url ? String(prep.csv_url) : "";
      if (!objectKey) return { code: 404 as const, error: "csv_not_generated" as const };
      const signed = await generatePresignedDownloadUrl(objectKey, 300);
      return { code: 302 as const, url: signed.url };
    });

    if ("error" in payload) return reply.code(payload.code).send({ error: payload.error });
    return reply.redirect(payload.url);
  });

  app.post("/api/v1/ifta/preparations/:id/submit", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const prep = await loadPreparation(client, query.data.operating_company_id, params.data.id);
      if (!prep) return { code: 404 as const, error: "preparation_not_found" as const };
      if (!prep.csv_url) return { code: 400 as const, error: "csv_not_generated" as const };

      const res = await client.query(
        `
          UPDATE ifta.quarterly_preparations
          SET status = 'submitted', submitted_at = now(), updated_at = now()
          WHERE id = $1::uuid
          RETURNING *
        `,
        [params.data.id]
      );
      return { code: 200 as const, data: res.rows[0] };
    });

    if ("error" in payload) return reply.code(payload.code).send({ error: payload.error });
    return payload.data;
  });
}

export default fp(async (app) => {
  await registerIftaQuarterlyPreparerRoutes(app);
}, { name: "ifta.registerIftaQuarterlyPreparerRoutes" });
