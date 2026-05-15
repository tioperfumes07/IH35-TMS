import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";

const switchBodySchema = z.object({
  target_company_id: z.string().uuid(),
  confirm: z.boolean(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function companyLabel(row: { short_name?: string | null; legal_name?: string | null }): string {
  const short = row.short_name ? String(row.short_name).trim() : "";
  if (short.length > 0) return short;
  return String(row.legal_name ?? "");
}

async function loadAccessibleCompanies(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  userId: string,
  role: string
) {
  return client.query(
    `
      SELECT c.id, c.code, c.legal_name, c.short_name
      FROM org.companies c
      WHERE c.is_active = true
        AND c.deactivated_at IS NULL
        AND (
          $2::text = 'Owner'
          OR EXISTS (
            SELECT 1
            FROM org.user_company_access a
            WHERE a.user_id = $1::uuid
              AND a.company_id = c.id
              AND a.deactivated_at IS NULL
          )
        )
      ORDER BY c.legal_name
    `,
    [userId, role]
  );
}

async function buildCurrentCompanyPayload(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  userId: string
) {
  const userRes = await client.query(
    `
      SELECT id, role, default_company_id
      FROM identity.users
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [userId]
  );
  const userRow = userRes.rows[0];
  if (!userRow) return null;
  const role = String(userRow.role ?? "");

  const companies = await loadAccessibleCompanies(client, userId, role);
  const available = companies.rows.map((c) => ({
    id: String(c.id),
    name: companyLabel({
      short_name: c.short_name as string | null | undefined,
      legal_name: c.legal_name as string | null | undefined,
    }),
    role,
  }));

  let ocId: string | null = userRow.default_company_id ? String(userRow.default_company_id) : null;
  const allowedIds = new Set(available.map((a) => a.id));
  if (ocId && !allowedIds.has(ocId)) ocId = null;
  if (!ocId && available[0]) ocId = available[0].id;
  if (!ocId) {
    return {
      operating_company_id: null as string | null,
      company_name: null as string | null,
      company_legal_name: null as string | null,
      user_role: role,
      available_companies: available,
    };
  }

  const companyRes = await client.query(
    `
      SELECT id, legal_name, short_name
      FROM org.companies
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [ocId]
  );
  const c = companyRes.rows[0] ?? {};
  return {
    operating_company_id: ocId,
    company_name: companyLabel({
      short_name: c.short_name as string | null | undefined,
      legal_name: c.legal_name as string | null | undefined,
    }),
    company_legal_name: c.legal_name ? String(c.legal_name) : null,
    user_role: role,
    available_companies: available,
  };
}

export async function registerCompanyContextRoutes(app: FastifyInstance) {
  app.get("/api/v1/identity/me/current-company", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;

    const payload = await withCurrentUser(user.uuid, async (client) => buildCurrentCompanyPayload(client, user.uuid));
    if (!payload) return reply.code(404).send({ error: "user_not_found" });
    return payload;
  });

  app.post("/api/v1/identity/me/switch-company", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;

    const parsed = switchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);

    if (!parsed.data.confirm) {
      return reply.code(400).send({ require_confirmation: true });
    }

    const target = parsed.data.target_company_id;

    const result = await withCurrentUser(user.uuid, async (client) => {
      const userRes = await client.query(
        `
          SELECT id, role, default_company_id
          FROM identity.users
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [user.uuid]
      );
      const userRow = userRes.rows[0];
      if (!userRow) return { error: "user_not_found" as const };
      const role = String(userRow.role ?? "");
      const access = await assertCompanyAccess(client, user.uuid, target, role);
      if (!access.ok) return { error: "forbidden_company" as const };

      const fromCompany = userRow.default_company_id ? String(userRow.default_company_id) : null;
      await client.query(`UPDATE identity.users SET default_company_id = $2::uuid WHERE id = $1::uuid`, [user.uuid, target]);

      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
        "identity.company_switched",
        "info",
        JSON.stringify({ from: fromCompany, to: target }),
        user.uuid,
        "P7-COMPANY-CONTEXT",
      ]);

      return { ok: true as const };
    });

    if ("error" in result && result.error === "user_not_found") return reply.code(404).send({ error: "user_not_found" });
    if ("error" in result && result.error === "forbidden_company") return reply.code(403).send({ error: "forbidden_company" });

    const payload = await withCurrentUser(user.uuid, async (client) => buildCurrentCompanyPayload(client, user.uuid));
    if (!payload) return reply.code(404).send({ error: "user_not_found" });
    return payload;
  });
}

async function assertCompanyAccess(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> },
  userId: string,
  companyId: string,
  role: string
): Promise<{ ok: boolean }> {
  if (role === "Owner") return { ok: true };
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM org.user_company_access a
        WHERE a.user_id = $1::uuid
          AND a.company_id = $2::uuid
          AND a.deactivated_at IS NULL
      ) AS ok
    `,
    [userId, companyId]
  );
  return { ok: Boolean(res.rows[0]?.ok) };
}
