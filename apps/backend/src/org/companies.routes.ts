import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

// CODER-16 USMCA pre-activation: USMCA (5c854333…) is HIDDEN until the July-2026 launch. Today it is
// hidden only by access-scoping (org.user_accessible_company_ids) + deactivated_at — there is no
// explicit launch gate, so a mis-grant or an un-deactivated row would leak it into the company picker.
// Defense-in-depth for the entity-independence LAW: filter not-yet-launched entities out of the
// company-list responses regardless of access/deactivated state, behind USMCA_ACTIVE (default OFF).
// Flip USMCA_ACTIVE=1 at launch to expose it. Entity ids are share-nothing; this only hides USMCA.
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_ACTIVE = process.env.USMCA_ACTIVE === "1";
function filterPreLaunchEntities<T extends { id: string }>(rows: T[]): T[] {
  return USMCA_ACTIVE ? rows : rows.filter((row) => row.id !== USMCA_COMPANY_ID);
}

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const updateCompanySchema = z.object({
  short_name: z.string().trim().min(1).max(200).optional(),
  tax_id: z.string().trim().min(1).max(100).optional(),
  address_line1: z.string().trim().min(1).max(300).optional(),
  address_line2: z.string().trim().min(1).max(300).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().min(1).max(120).optional(),
  postal_code: z.string().trim().min(1).max(40).optional(),
  country: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
});

const grantAccessSchema = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
});

const setDefaultCompanySchema = z.object({
  company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerCompanyRoutes(app: FastifyInstance) {
  app.get("/api/v1/org/companies", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    return withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            code,
            legal_name,
            short_name,
            company_type,
            is_active,
            address_line1,
            city,
            state,
            country
          FROM org.companies
          WHERE id IN (SELECT org.user_accessible_company_ids())
            AND deactivated_at IS NULL
          ORDER BY legal_name
        `
      );
      // Defense-in-depth: hide not-yet-launched entities (USMCA) until USMCA_ACTIVE.
      return { companies: filterPreLaunchEntities(res.rows) };
    });
  });

  app.get<{ Params: { id: string } }>("/api/v1/org/companies/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    return withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM org.companies
          WHERE id = $1
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "not_found" });
      return { company: res.rows[0] };
    });
  });

  app.patch<{ Params: { id: string } }>("/api/v1/org/companies/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const parsedBody = updateCompanySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(user.uuid, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];

      for (const [key, value] of Object.entries(parsedBody.data)) {
        if (value !== undefined && value !== "") {
          values.push(value);
          fields.push(`${key} = $${values.length}`);
        }
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: "no_fields_to_update" });
      }

      fields.push("updated_at = now()");
      values.push(user.uuid);
      fields.push(`updated_by_user_id = $${values.length}`);
      values.push(parsedParams.data.id);

      const updateRes = await client.query(
        `UPDATE org.companies SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING id`,
        values
      );
      if (updateRes.rows.length === 0) return reply.code(404).send({ error: "not_found" });

      await appendCrudAudit(
        client,
        user.uuid,
        "org.companies.updated",
        {
          resource_id: parsedParams.data.id,
          resource_type: "org.companies",
          changes: parsedBody.data,
        },
        "info",
        "BT-1-MULTITENANT-FOUNDATION"
      );
      return { ok: true };
    });
  });

  app.post("/api/v1/org/user-company-access", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const parsedBody = grantAccessSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `
          INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, company_id) DO NOTHING
        `,
        [parsedBody.data.user_id, parsedBody.data.company_id, user.uuid]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "org.user_company_access.granted",
        {
          resource_id: parsedBody.data.user_id,
          resource_type: "org.user_company_access",
          user_id: parsedBody.data.user_id,
          company_id: parsedBody.data.company_id,
        },
        "info",
        "BT-1-MULTITENANT-FOUNDATION"
      );
      return reply.code(201).send({ ok: true });
    });
  });

  app.get("/api/v1/org/me/companies", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    return withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            c.id,
            c.code,
            c.legal_name,
            c.short_name,
            c.company_type,
            c.is_active,
            (u.default_company_id = c.id) AS is_default
          FROM org.companies c
          CROSS JOIN identity.users u
          WHERE u.id = $1
            AND c.id IN (SELECT org.user_accessible_company_ids())
            AND c.deactivated_at IS NULL
          ORDER BY c.legal_name
        `,
        [user.uuid]
      );
      // Defense-in-depth: never surface a not-yet-launched entity (USMCA) in the picker before launch.
      return { companies: filterPreLaunchEntities(res.rows) };
    });
  });

  app.patch("/api/v1/org/me/default-company", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsedBody = setDefaultCompanySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(user.uuid, async (client) => {
      const accessCheck = await client.query(
        `
          SELECT 1
          FROM org.companies c
          WHERE c.id = $1
            AND c.id IN (SELECT org.user_accessible_company_ids())
            AND c.deactivated_at IS NULL
          LIMIT 1
        `,
        [parsedBody.data.company_id]
      );
      if (accessCheck.rows.length === 0) return reply.code(403).send({ error: "no_access_to_company" });

      await client.query(`UPDATE identity.users SET default_company_id = $1 WHERE id = $2`, [
        parsedBody.data.company_id,
        user.uuid,
      ]);
      return { ok: true };
    });
  });
}
