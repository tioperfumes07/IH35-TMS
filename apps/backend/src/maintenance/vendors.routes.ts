import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

const companySchema = z.object({ operating_company_id: z.string().uuid() });
const idSchema = z.object({ id: z.string().uuid() });
const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  type: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  payment_terms: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const patchSchema = createSchema.partial().extend({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerMaintenanceVendorsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/vendors", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id::text,
            display_name AS name,
            company_name,
            primary_email AS contact_email,
            primary_phone AS contact_phone,
            active,
            mirrored_at::text
          FROM mdata.qbo_vendors
          WHERE operating_company_id = $1
          ORDER BY display_name ASC
        `,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });

  app.post("/api/v1/maintenance/vendors", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const vendor = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO mdata.qbo_vendors (
            operating_company_id, qbo_id, display_name, company_name, primary_email, primary_phone, active, created_in_tms, payload_json
          ) VALUES ($1, NULL, $2, $3, $4, $5, true, true, '{}'::jsonb)
          RETURNING id::text, display_name AS name
        `,
        [
          body.operating_company_id,
          body.name,
          body.name,
          body.contact?.includes("@") ? body.contact : null,
          body.contact && !body.contact.includes("@") ? body.contact : null,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.created", {
        resource_id: res.rows[0]?.id,
        operating_company_id: body.operating_company_id,
      });
      return res.rows[0];
    });
    return reply.code(201).send(vendor);
  });

  app.patch("/api/v1/maintenance/vendors/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const updated = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE mdata.qbo_vendors
          SET
            display_name = COALESCE($3, display_name),
            company_name = COALESCE($4, company_name),
            primary_email = COALESCE($5, primary_email),
            primary_phone = COALESCE($6, primary_phone),
            mirrored_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING id::text, display_name AS name
        `,
        [
          params.data.id,
          body.operating_company_id,
          body.name ?? null,
          body.name ?? null,
          body.contact?.includes("@") ? body.contact : null,
          body.contact && !body.contact.includes("@") ? body.contact : null,
        ]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.updated", {
        resource_id: params.data.id,
        operating_company_id: body.operating_company_id,
      });
      return res.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: "maintenance_vendor_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/vendors/:id/void", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = companySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `UPDATE mdata.qbo_vendors SET active = false, mirrored_at = now() WHERE id = $1 AND operating_company_id = $2 RETURNING id::text`,
        [params.data.id, body.operating_company_id]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.vendor.voided", {
        resource_id: params.data.id,
        operating_company_id: body.operating_company_id,
      });
      return { ok: true };
    });
    if (!result) return reply.code(404).send({ error: "maintenance_vendor_not_found" });
    return result;
  });
}
