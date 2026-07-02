import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });

const permitTypeEnum = z.enum(["I-94", "SCT", "OS_OW_TX", "OVERSIZE_MX", "HAZMAT_MX", "OTHER"]);

const createPermitBody = z.object({
  operating_company_id: z.string().uuid(),
  permit_type: permitTypeEnum,
  unit_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid().optional().nullable(),
  issued_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expires_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  permit_number: z.string().trim().max(120).optional().nullable(),
  issuing_authority: z.string().trim().max(200).optional().nullable(),
  cost_cents: z.number().int().min(0).optional().nullable(),
  attachment_url: z.string().url().optional().nullable(),
});

const patchPermitBody = createPermitBody.partial().omit({ operating_company_id: true });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: any) => Promise<T>
): Promise<T> {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function mxPermitsRoutes(app: FastifyInstance) {
  // GET /api/v1/mx-permits
  app.get("/api/v1/mx-permits", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { operating_company_id } = companyQuery.parse(req.query);

    const rows = await withCompany(user.uuid, operating_company_id, async (client) => {
      const { rows } = await client.query(`
        SELECT p.*, u.unit_number, d.first_name || ' ' || d.last_name AS driver_name
        FROM mdata.mx_permits p
        LEFT JOIN mdata.units u ON u.id = p.unit_id
        LEFT JOIN mdata.drivers d ON d.id = p.driver_id
        WHERE p.is_active = true
        ORDER BY p.expires_date ASC
      `);
      return rows;
    });

    reply.send({ data: rows });
  });

  // GET /api/v1/mx-permits/expiring — permits expiring in 30/60/90 days
  app.get("/api/v1/mx-permits/expiring", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = z.object({
      operating_company_id: z.string().uuid(),
      days: z.coerce.number().int().min(1).max(365).default(90),
    }).parse(req.query);

    const rows = await withCompany(user.uuid, query.operating_company_id, async (client) => {
      const { rows } = await client.query(`
        SELECT p.*, u.unit_number, d.first_name || ' ' || d.last_name AS driver_name,
               (p.expires_date - current_date) AS days_until_expiry
        FROM mdata.mx_permits p
        LEFT JOIN mdata.units u ON u.id = p.unit_id
        LEFT JOIN mdata.drivers d ON d.id = p.driver_id
        WHERE p.is_active = true
          AND p.expires_date <= current_date + ($1 || ' days')::interval
          AND p.expires_date >= current_date
        ORDER BY p.expires_date ASC
      `, [query.days]);
      return rows;
    });

    reply.send({ data: rows });
  });

  // POST /api/v1/mx-permits
  app.post("/api/v1/mx-permits", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createPermitBody.parse(req.body);

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const { rows } = await client.query(`
        INSERT INTO mdata.mx_permits (
          operating_company_id, tenant_id,
          permit_type, unit_id, driver_id,
          issued_date, expires_date,
          permit_number, issuing_authority,
          cost_cents, attachment_url
        ) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
        body.operating_company_id,
        body.permit_type,
        body.unit_id ?? null,
        body.driver_id ?? null,
        body.issued_date,
        body.expires_date,
        body.permit_number ?? null,
        body.issuing_authority ?? null,
        body.cost_cents ?? null,
        body.attachment_url ?? null,
      ]);
      return rows[0];
    });

    reply.code(201).send({ data: row });
  });

  // PATCH /api/v1/mx-permits/:id
  app.patch("/api/v1/mx-permits/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const { operating_company_id } = companyQuery.parse(req.query);
    const body = patchPermitBody.parse(req.body);

    const fields = Object.entries(body).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return reply.code(400).send({ error: "No fields to update" });

    const setClauses = fields.map(([k], i) => `"${k}" = $${i + 2}`).join(", ");
    const values = fields.map(([, v]) => v);

    const row = await withCompany(user.uuid, operating_company_id, async (client) => {
      const { rows } = await client.query(
        `UPDATE mdata.mx_permits SET ${setClauses}, updated_at = now()
         WHERE id = $1 AND is_active = true RETURNING *`,
        [id, ...values]
      );
      return rows[0];
    });

    if (!row) return reply.code(404).send({ error: "Permit not found" });
    reply.send({ data: row });
  });

  // DELETE /api/v1/mx-permits/:id (soft delete)
  app.delete("/api/v1/mx-permits/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const { operating_company_id } = companyQuery.parse(req.query);

    await withCompany(user.uuid, operating_company_id, async (client) => {
      await client.query(
        `UPDATE mdata.mx_permits SET is_active = false, updated_at = now() WHERE id = $1`,
        [id]
      );
    });

    reply.code(204).send();
  });
}
