import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

export const US_JURISDICTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "GU", "VI", "AS", "MP",
] as const;

export const MX_JURISDICTIONS = [
  "Federal",
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "CDMX",
  "Coahuila",
  "Colima",
  "Durango",
  "Estado de México",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas",
] as const;

const usSet = new Set<string>(US_JURISDICTIONS);
const mxSet = new Set<string>(MX_JURISDICTIONS);

export function validatePlateJurisdiction(country: "US" | "MX", jurisdiction: string): boolean {
  if (country === "US") return usSet.has(jurisdiction);
  return mxSet.has(jurisdiction);
}

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });
const plateParamsSchema = z.object({ id: z.string().uuid(), plate_id: z.string().uuid() });

const createPlateSchema = z.object({
  country: z.enum(["US", "MX"]),
  jurisdiction: z.string().trim().min(1).max(80),
  plate_number: z.string().trim().min(1).max(40),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const patchPlateSchema = z
  .object({
    jurisdiction: z.string().trim().min(1).max(80).optional(),
    plate_number: z.string().trim().min(1).max(40).optional(),
    expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    status: z.enum(["active", "expired", "archived"]).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

async function assertUnitScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  unitId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

export async function registerUnitPlatesRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units/:id/plates", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const unitOk = await assertUnitScope(client, params.data.id, query.data.operating_company_id);
      if (!unitOk) return null;
      const res = await client.query(
        `
          SELECT id, country, jurisdiction, plate_number, expiration::text, status, notes, archived_at::text
          FROM mdata.unit_plates
          WHERE unit_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status <> 'archived'
          ORDER BY country, jurisdiction
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });
    if (rows === null) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return { rows };
  });

  app.post("/api/v1/mdata/units/:id/plates", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createPlateSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    if (!validatePlateJurisdiction(body.data.country, body.data.jurisdiction)) {
      return reply.code(400).send({ error: "invalid_jurisdiction" });
    }
    try {
      const row = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
        const unitOk = await assertUnitScope(client, params.data.id, query.data.operating_company_id);
        if (!unitOk) return null;
        const res = await client.query(
          `
            INSERT INTO mdata.unit_plates (
              operating_company_id, unit_id, country, jurisdiction, plate_number, expiration, notes
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id, country, jurisdiction, plate_number, expiration::text, status, notes
          `,
          [
            query.data.operating_company_id,
            params.data.id,
            body.data.country,
            body.data.jurisdiction,
            body.data.plate_number,
            body.data.expiration ?? null,
            body.data.notes ?? null,
          ]
        );
        const created = res.rows[0];
        await appendCrudAudit(client, user.uuid, "mdata.unit_plates.created", {
          resource_id: created.id,
          unit_id: params.data.id,
        });
        return created;
      });
      if (!row) return reply.code(404).send({ error: "mdata_unit_not_found" });
      return reply.code(201).send(row);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "unit_plate_conflict" });
      throw err;
    }
  });

  app.patch("/api/v1/mdata/units/:id/plates/:plate_id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = plateParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = patchPlateSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const updated = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const existing = await client.query(
        `SELECT * FROM mdata.unit_plates WHERE id = $1::uuid AND unit_id = $2::uuid AND operating_company_id = $3::uuid LIMIT 1`,
        [params.data.plate_id, params.data.id, query.data.operating_company_id]
      );
      const oldRow = existing.rows[0];
      if (!oldRow) return null;
      if ("jurisdiction" in body.data && !validatePlateJurisdiction(oldRow.country as "US" | "MX", body.data.jurisdiction!)) {
        throw new Error("invalid_jurisdiction");
      }
      const setParts: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      if ("jurisdiction" in body.data) add("jurisdiction", body.data.jurisdiction);
      if ("plate_number" in body.data) add("plate_number", body.data.plate_number);
      if ("expiration" in body.data) add("expiration", body.data.expiration ?? null);
      if ("status" in body.data) add("status", body.data.status);
      if ("notes" in body.data) add("notes", body.data.notes ?? null);
      values.push(params.data.plate_id);
      const res = await client.query(
        `UPDATE mdata.unit_plates SET ${setParts.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values
      );
      const row = res.rows[0];
      await appendCrudAudit(client, user.uuid, "mdata.unit_plates.updated", {
        resource_id: row.id,
        unit_id: params.data.id,
        changes: body.data,
      });
      return row;
    });
    if (updated === null) return reply.code(404).send({ error: "unit_plate_not_found" });
    return updated;
  });

  app.post("/api/v1/mdata/units/:id/plates/:plate_id/archive", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = plateParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const archived = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE mdata.unit_plates
          SET status = 'archived', archived_at = now(), updated_at = now()
          WHERE id = $1::uuid AND unit_id = $2::uuid AND operating_company_id = $3::uuid AND status <> 'archived'
          RETURNING id
        `,
        [params.data.plate_id, params.data.id, query.data.operating_company_id]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(client, user.uuid, "mdata.unit_plates.archived", {
        resource_id: row.id,
        unit_id: params.data.id,
      });
      return row;
    });
    if (!archived) return reply.code(404).send({ error: "unit_plate_not_found" });
    return { ok: true, id: archived.id };
  });
}
