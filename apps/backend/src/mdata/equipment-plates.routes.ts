import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { validatePlateJurisdiction } from "./unit-plates.routes.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const equipmentParamsSchema = z.object({ id: z.string().uuid() });
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

async function assertEquipmentScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  equipmentId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.equipment
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [equipmentId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

export async function registerEquipmentPlatesRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/equipment/:id/plates", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = equipmentParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      if (!(await assertEquipmentScope(client, params.data.id, query.data.operating_company_id))) return null;
      const res = await client.query(
        `
          SELECT id::text, country, jurisdiction, plate_number, expiration::text, status, notes
          FROM mdata.equipment_plates
          WHERE equipment_id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'archived'
          ORDER BY country, jurisdiction
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });
    if (rows === null) return reply.code(404).send({ error: "mdata_equipment_not_found" });
    return { rows };
  });

  app.post("/api/v1/mdata/equipment/:id/plates", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = equipmentParamsSchema.safeParse(req.params ?? {});
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
        if (!(await assertEquipmentScope(client, params.data.id, query.data.operating_company_id))) return null;
        const res = await client.query(
          `
            INSERT INTO mdata.equipment_plates (
              operating_company_id, equipment_id, country, jurisdiction, plate_number, expiration, notes
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id::text, country, jurisdiction, plate_number, expiration::text, status, notes
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
        await appendCrudAudit(client, user.uuid, "mdata.equipment_plates.created", {
          resource_id: res.rows[0]?.id,
          equipment_id: params.data.id,
        });
        return res.rows[0];
      });
      if (!row) return reply.code(404).send({ error: "mdata_equipment_not_found" });
      return reply.code(201).send(row);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return reply.code(409).send({ error: "equipment_plate_conflict" });
      throw err;
    }
  });

  app.patch("/api/v1/mdata/equipment/:id/plates/:plate_id", async (req, reply) => {
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
        `SELECT * FROM mdata.equipment_plates WHERE id = $1::uuid AND equipment_id = $2::uuid AND operating_company_id = $3::uuid LIMIT 1`,
        [params.data.plate_id, params.data.id, query.data.operating_company_id]
      );
      if (!existing.rows[0]) return null;
      const setParts: string[] = [];
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
        `UPDATE mdata.equipment_plates SET ${setParts.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "equipment_plate_not_found" });
    return updated;
  });

  app.post("/api/v1/mdata/equipment/:id/plates/:plate_id/archive", async (req, reply) => {
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
          UPDATE mdata.equipment_plates
          SET status = 'archived', archived_at = now()
          WHERE id = $1::uuid AND equipment_id = $2::uuid AND operating_company_id = $3::uuid AND status <> 'archived'
          RETURNING id::text
        `,
        [params.data.plate_id, params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!archived) return reply.code(404).send({ error: "equipment_plate_not_found" });
    return { ok: true, id: archived.id };
  });
}
