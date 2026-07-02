import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ id: z.string().uuid() });
const w8benParamsSchema = z.object({ id: z.string().uuid(), w8ben_id: z.string().uuid() });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// W-8BEN Part I + Part II + Part III fields (IRS "Certificate of Foreign Status of
// Beneficial Owner"). Only legal name, country of citizenship and signed date are
// required to file; everything else is optional (US TIN is usually blank for B-1 drivers).
const createW8benSchema = z.object({
  full_legal_name: z.string().trim().min(1).max(200),
  country_of_citizenship: z.string().trim().min(1).max(100),
  permanent_residence_street: z.string().trim().max(300).optional(),
  permanent_residence_city: z.string().trim().max(120).optional(),
  permanent_residence_country: z.string().trim().max(100).optional(),
  mailing_address_street: z.string().trim().max(300).optional(),
  mailing_address_city: z.string().trim().max(120).optional(),
  mailing_address_country: z.string().trim().max(100).optional(),
  us_tin: z.string().trim().max(40).optional(),
  foreign_tin: z.string().trim().max(60).optional(),
  reference_numbers: z.string().trim().max(200).optional(),
  date_of_birth: dateStr.optional(),
  treaty_country: z.string().trim().max(100).optional(),
  treaty_article: z.string().trim().max(120).optional(),
  certification_name: z.string().trim().max(200).optional(),
  signed_date: dateStr,
  notes: z.string().trim().max(2000).optional(),
});

const patchW8benSchema = z.object({
  full_legal_name: z.string().trim().min(1).max(200).optional(),
  country_of_citizenship: z.string().trim().min(1).max(100).optional(),
  permanent_residence_street: z.string().trim().max(300).nullable().optional(),
  permanent_residence_city: z.string().trim().max(120).nullable().optional(),
  permanent_residence_country: z.string().trim().max(100).nullable().optional(),
  mailing_address_street: z.string().trim().max(300).nullable().optional(),
  mailing_address_city: z.string().trim().max(120).nullable().optional(),
  mailing_address_country: z.string().trim().max(100).nullable().optional(),
  us_tin: z.string().trim().max(40).nullable().optional(),
  foreign_tin: z.string().trim().max(60).nullable().optional(),
  reference_numbers: z.string().trim().max(200).nullable().optional(),
  date_of_birth: dateStr.nullable().optional(),
  treaty_country: z.string().trim().max(100).nullable().optional(),
  treaty_article: z.string().trim().max(120).nullable().optional(),
  certification_name: z.string().trim().max(200).nullable().optional(),
  signed_date: dateStr.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const RL = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
const RL_READ = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

const SELECT_COLS = `
  id::text,
  full_legal_name,
  country_of_citizenship,
  permanent_residence_street,
  permanent_residence_city,
  permanent_residence_country,
  mailing_address_street,
  mailing_address_city,
  mailing_address_country,
  us_tin,
  foreign_tin,
  reference_numbers,
  date_of_birth::text,
  treaty_country,
  treaty_article,
  certification_name,
  signed_date::text,
  irs_expiration_date::text,
  notes
`;

// IRS validity: last day of the 3rd calendar year after signing.
function irsExpirationFor(signedDate: string): string {
  const year = Number(signedDate.slice(0, 4));
  if (!Number.isFinite(year)) return signedDate;
  return `${year + 3}-12-31`;
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverW8benRoutes(app: FastifyInstance) {
  // List W-8BEN certificates for a driver (newest signing first).
  app.get("/api/v1/mdata/drivers/:id/w8ben", RL_READ, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT ${SELECT_COLS}
          FROM safety.driver_w8ben
          WHERE driver_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          ORDER BY signed_date DESC, created_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });

  app.post("/api/v1/mdata/drivers/:id/w8ben", RL, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createW8benSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const irsExpiration = irsExpirationFor(body.data.signed_date);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO safety.driver_w8ben (
            operating_company_id, driver_id,
            full_legal_name, country_of_citizenship,
            permanent_residence_street, permanent_residence_city, permanent_residence_country,
            mailing_address_street, mailing_address_city, mailing_address_country,
            us_tin, foreign_tin, reference_numbers, date_of_birth,
            treaty_country, treaty_article,
            certification_name, signed_date, irs_expiration_date, notes
          )
          VALUES (
            $1, $2,
            $3, $4,
            $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13, $14::date,
            $15, $16,
            $17, $18::date, $19::date, $20
          )
          RETURNING ${SELECT_COLS}
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          body.data.full_legal_name,
          body.data.country_of_citizenship,
          body.data.permanent_residence_street ?? null,
          body.data.permanent_residence_city ?? null,
          body.data.permanent_residence_country ?? null,
          body.data.mailing_address_street ?? null,
          body.data.mailing_address_city ?? null,
          body.data.mailing_address_country ?? null,
          body.data.us_tin ?? null,
          body.data.foreign_tin ?? null,
          body.data.reference_numbers ?? null,
          body.data.date_of_birth ?? null,
          body.data.treaty_country ?? null,
          body.data.treaty_article ?? null,
          body.data.certification_name ?? null,
          body.data.signed_date,
          irsExpiration,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(client, authUser.uuid, "safety.driver_w8ben.filed", {
        resource_type: "safety.driver_w8ben",
        resource_id: (res.rows[0] as { id?: string })?.id ?? null,
        operating_company_id: query.data.operating_company_id,
        driver_id: params.data.id,
      });
      return res.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/v1/mdata/drivers/:id/w8ben/:w8ben_id", RL, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = w8benParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = patchW8benSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const sets: string[] = [];
    const values: unknown[] = [query.data.operating_company_id, params.data.id, params.data.w8ben_id];

    const textCols: Array<keyof typeof body.data> = [
      "full_legal_name",
      "country_of_citizenship",
      "permanent_residence_street",
      "permanent_residence_city",
      "permanent_residence_country",
      "mailing_address_street",
      "mailing_address_city",
      "mailing_address_country",
      "us_tin",
      "foreign_tin",
      "reference_numbers",
      "treaty_country",
      "treaty_article",
      "certification_name",
      "notes",
    ];
    for (const col of textCols) {
      if (body.data[col] !== undefined) {
        values.push(body.data[col]);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (body.data.date_of_birth !== undefined) {
      values.push(body.data.date_of_birth);
      sets.push(`date_of_birth = $${values.length}::date`);
    }
    if (body.data.signed_date !== undefined) {
      values.push(body.data.signed_date);
      sets.push(`signed_date = $${values.length}::date`);
      values.push(irsExpirationFor(body.data.signed_date));
      sets.push(`irs_expiration_date = $${values.length}::date`);
    }
    if (sets.length === 0) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE safety.driver_w8ben
          SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $3::uuid
            AND driver_id = $2::uuid
            AND operating_company_id = $1::uuid
            AND voided_at IS NULL
          RETURNING ${SELECT_COLS}
        `,
        values
      );
      if (res.rows[0]) {
        await appendCrudAudit(client, authUser.uuid, "safety.driver_w8ben.updated", {
          resource_type: "safety.driver_w8ben",
          resource_id: params.data.w8ben_id,
          operating_company_id: query.data.operating_company_id,
          driver_id: params.data.id,
        });
      }
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "w8ben_not_found" });
    return row;
  });

  // Archive (void-not-delete) an existing certificate.
  app.post("/api/v1/mdata/drivers/:id/w8ben/:w8ben_id/archive", RL, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = w8benParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE safety.driver_w8ben
          SET voided_at = now(), voided_reason = 'archived_from_driver_profile'
          WHERE id = $3::uuid
            AND driver_id = $2::uuid
            AND operating_company_id = $1::uuid
            AND voided_at IS NULL
          RETURNING id::text
        `,
        [query.data.operating_company_id, params.data.id, params.data.w8ben_id]
      );
      if (res.rows[0]) {
        await appendCrudAudit(client, authUser.uuid, "safety.driver_w8ben.archived", {
          resource_type: "safety.driver_w8ben",
          resource_id: params.data.w8ben_id,
          operating_company_id: query.data.operating_company_id,
          driver_id: params.data.id,
        });
      }
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "w8ben_not_found" });
    return { ok: true, id: row.id };
  });
}
