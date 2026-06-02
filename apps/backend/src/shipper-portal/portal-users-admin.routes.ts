import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { officePasswordSchema } from "../identity/office-password-policy.js";

const idParams = z.object({ id: z.string().uuid() });
const portalUserParams = idParams.extend({ portal_user_id: z.string().uuid() });

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
});

const createPortalUserSchema = companyQuery.extend({
  email: z.string().trim().email(),
  password: z.string(),
  full_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(50).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

const argon2id = new Argon2id();

export async function registerPortalUsersAdminRoutes(app: FastifyInstance) {
  app.get("/api/v1/customers/:id/portal-users", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuery.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT
            id::text,
            email,
            full_name,
            phone,
            active,
            archived_at::text AS archived_at,
            last_login_at::text AS last_login_at,
            created_at::text AS created_at
          FROM shipper_portal.portal_users
          WHERE customer_id = $1::uuid
            AND operating_company_id = $2::uuid
          ORDER BY created_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });

    return { portal_users: rows };
  });

  app.post("/api/v1/customers/:id/portal-users", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = createPortalUserSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const passwordParsed = officePasswordSchema.safeParse(body.data.password);
    if (!passwordParsed.success) {
      return reply.code(400).send({ error: "validation_error", message: passwordParsed.error.issues[0]?.message ?? "invalid_password" });
    }

    const passwordHash = await argon2id.hash(body.data.password);
    const email = body.data.email.trim().toLowerCase();

    const created = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const customerRes = await client.query(
        `
          SELECT id::text
          FROM mdata.customers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      if (!customerRes.rows[0]) return null;

      const res = await client.query(
        `
          INSERT INTO shipper_portal.portal_users (
            operating_company_id, customer_id, email, password_hash, full_name, phone, created_by_user_id
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid)
          RETURNING id::text, email, full_name, phone, active, created_at::text AS created_at
        `,
        [
          body.data.operating_company_id,
          params.data.id,
          email,
          passwordHash,
          body.data.full_name ?? null,
          body.data.phone ?? null,
          user.uuid,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "shipper_portal.user_created",
        {
          customer_id: params.data.id,
          portal_user_id: res.rows[0]?.id,
          email,
        },
        "info",
        "BLOCK-18-SHIPPER-PORTAL"
      );

      return res.rows[0];
    });

    if (!created) return reply.code(404).send({ error: "customer_not_found" });
    return reply.code(201).send({ portal_user: created });
  });

  app.post("/api/v1/customers/:id/portal-users/:portal_user_id/archive", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = portalUserParams.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuery.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const archived = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE shipper_portal.portal_users
          SET active = FALSE,
              archived_at = NOW()
          WHERE id = $1::uuid
            AND customer_id = $2::uuid
            AND operating_company_id = $3::uuid
            AND archived_at IS NULL
          RETURNING id::text, email, archived_at::text AS archived_at
        `,
        [params.data.portal_user_id, params.data.id, query.data.operating_company_id]
      );
      if (!res.rows[0]) return null;
      await client.query(`DELETE FROM shipper_portal.portal_sessions WHERE portal_user_id = $1::uuid`, [params.data.portal_user_id]);
      await appendCrudAudit(
        client,
        user.uuid,
        "shipper_portal.user_archived",
        {
          customer_id: params.data.id,
          portal_user_id: params.data.portal_user_id,
        },
        "info",
        "BLOCK-18-SHIPPER-PORTAL"
      );
      return res.rows[0];
    });

    if (!archived) return reply.code(404).send({ error: "portal_user_not_found" });
    return { portal_user: archived };
  });
}
