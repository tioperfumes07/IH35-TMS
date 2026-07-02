import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { submitDvirBodySchema, submitDriverDvir } from "./dvir-submit.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerSafetyDvirRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/dvir", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters: string[] = ["ds.operating_company_id = $1"];
      const values: unknown[] = [query.data.operating_company_id];
      let idx = 2;
      if (query.data.driver_id) {
        filters.push(`ds.driver_id = $${idx++}`);
        values.push(query.data.driver_id);
      }
      if (query.data.unit_id) {
        filters.push(`ds.unit_id = $${idx++}`);
        values.push(query.data.unit_id);
      }
      if (query.data.from) {
        filters.push(`ds.submitted_at >= $${idx++}`);
        values.push(query.data.from);
      }
      if (query.data.to) {
        filters.push(`ds.submitted_at <= $${idx++}`);
        values.push(query.data.to);
      }
      values.push(query.data.limit, query.data.offset);

      const res = await client.query(
        `
          SELECT
            ds.id,
            ds.submitted_at,
            ds.type,
            ds.has_major_defect,
            ds.has_any_defect,
            ds.follow_up_wo_id,
            ds.driver_id,
            ds.unit_id,
            ds.load_id,
            TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name,
            u.unit_number,
            COALESCE(dc.defect_count, 0)::int AS defect_count,
            CASE
              WHEN ds.has_major_defect THEN 'major'
              WHEN ds.has_any_defect THEN 'minor'
              ELSE 'none'
            END AS defect_severity
          FROM safety.dvir_submissions ds
          LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
          LEFT JOIN mdata.units u ON u.id = ds.unit_id
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS defect_count
            FROM safety.dvir_defects dd
            WHERE dd.dvir_submission_id = ds.id
          ) dc ON true
          WHERE ${filters.join(" AND ")}
          ORDER BY ds.submitted_at DESC
          LIMIT $${idx++} OFFSET $${idx}
        `,
        values
      );
      return res.rows;
    });

    return { submissions: rows };
  });

  app.get("/api/v1/safety/dvir/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const submissionRes = await client.query(
        `
          SELECT ds.*, TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name, u.unit_number
          FROM safety.dvir_submissions ds
          LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
          LEFT JOIN mdata.units u ON u.id = ds.unit_id
          WHERE ds.id = $1
            AND ds.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const submission = submissionRes.rows[0];
      if (!submission) return null;
      const defectsRes = await client.query(
        `
          SELECT *
          FROM safety.dvir_defects
          WHERE dvir_submission_id = $1
          ORDER BY created_at ASC
        `,
        [params.data.id]
      );
      return { submission, defects: defectsRes.rows };
    });

    if (!payload) return reply.code(404).send({ error: "dvir_not_found" });
    return payload;
  });

  app.post("/api/v1/safety/dvir", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = submitDvirBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const driverRes = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.drivers
          WHERE identity_user_id = $1
          LIMIT 1
        `,
        [user.uuid]
      );
    });
    const driver = driverRes.rows[0];
    if (!driver) return reply.code(403).send({ error: "driver_profile_required" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      submitDriverDvir(client, user.uuid, driver, body.data)
    );

    if ("error" in result) {
      if (result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.error === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
      if (result.error === "duplicate_request") {
        return reply.code(409).send({ error: "duplicate_request" });
      }
      return reply.code(400).send({ error: result.error });
    }
    return reply.code(201).send(result);
  });
}
