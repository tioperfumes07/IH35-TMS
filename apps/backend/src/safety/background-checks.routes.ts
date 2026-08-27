import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const RL_READ = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

const createBackgroundCheckSchema = z.object({
  driver_id: z.string().uuid(),
  check_type: z.enum(["psp", "mvr", "drug", "employment_verify"]),
  result: z.enum(["pass", "fail"]),
  checked_at: z.string(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyBackgroundChecksRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/background-checks", RL_READ, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.driver_id) {
        const parent = await client.query(
          `SELECT 1 FROM mdata.drivers d
           WHERE d.id = $1::uuid
             AND d.archived_at IS NULL
             AND (
               d.operating_company_id = $2::uuid
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations dca
                 WHERE dca.driver_id = d.id
                   AND dca.company_id = $2::uuid
                   AND dca.is_authorized = true
                   AND dca.deactivated_at IS NULL
               )
             )
           LIMIT 1`,
          [query.data.driver_id, query.data.operating_company_id]
        );
        if (!parent.rows[0]) return { found: false as const, rows: [], total_count: 0 };
      }
      const driverFilter = query.data.driver_id
        ? (values.push(query.data.driver_id), `AND bc.driver_id = $${values.length}::uuid`)
        : "";
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count
         FROM safety.background_checks bc
         WHERE bc.operating_company_id = $1::uuid
           ${driverFilter}`,
        values
      );
      values.push(query.data.limit, query.data.offset);
      const res = await client.query(
        `
          SELECT bc.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
          FROM safety.background_checks bc
          JOIN mdata.drivers d
            ON d.id = bc.driver_id
           AND (
             d.operating_company_id = bc.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations label_dca
               WHERE label_dca.driver_id = d.id
                 AND label_dca.company_id = bc.operating_company_id
                 AND label_dca.is_authorized = true
                 AND label_dca.deactivated_at IS NULL
             )
           )
          WHERE bc.operating_company_id = $1::uuid
            ${driverFilter}
          ORDER BY bc.checked_at DESC, bc.id DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );
      return { found: true as const, rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { background_checks: result.rows, total_count: result.total_count };
  });

  app.post("/api/v1/safety/background-checks", RL_WRITE, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createBackgroundCheckSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const driver = await client.query(
        `SELECT id FROM mdata.drivers d
         WHERE d.id = $1::uuid
           AND d.archived_at IS NULL
           AND (d.operating_company_id = $2::uuid OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations background_check_create_driver_dca
             WHERE background_check_create_driver_dca.driver_id = d.id
               AND background_check_create_driver_dca.company_id = $2::uuid
               AND background_check_create_driver_dca.is_authorized = true
               AND background_check_create_driver_dca.deactivated_at IS NULL
           ))
         LIMIT 1`,
        [body.data.driver_id, company.data.operating_company_id]
      );
      if (!driver.rows[0]) return null;
      const res = await client.query<Record<string, unknown>>(
        `
          INSERT INTO safety.background_checks (
            operating_company_id,
            driver_id,
            check_type,
            result,
            checked_at,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6::date, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.check_type,
          body.data.result,
          body.data.checked_at,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );
      const backgroundCheck = res.rows[0];
      if (!backgroundCheck?.id) throw new Error("safety_background_check_insert_failed");
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.background_check.created",
        {
          resource_type: "safety.background_checks",
          resource_id: backgroundCheck.id,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return backgroundCheck;
    });
    if (!created) return reply.code(400).send({ error: "driver_not_in_operating_company" });
    return reply.code(201).send(created);
  });
}
