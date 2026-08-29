import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

const createTrainingRecordSchema = z.object({
  driver_id: z.string().uuid(),
  training_name: z.string().trim().min(1),
  completed_at: z.string(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

const createTrainingRecordBatchSchema = createTrainingRecordSchema
  .omit({ driver_id: true })
  .extend({ driver_ids: z.array(z.string().uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "driver_ids must be unique") });

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

export async function registerSafetyTrainingRecordsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/training-records", RL_WRITE, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createTrainingRecordSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const driver = await client.query(
        `SELECT id FROM mdata.drivers d
         WHERE d.id = $1::uuid
           AND d.archived_at IS NULL
           AND (d.operating_company_id = $2::uuid OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations training_create_driver_dca
             WHERE training_create_driver_dca.driver_id = d.id
               AND training_create_driver_dca.company_id = $2::uuid
               AND training_create_driver_dca.is_authorized = true
               AND training_create_driver_dca.deactivated_at IS NULL
           ))
         LIMIT 1`,
        [body.data.driver_id, company.data.operating_company_id]
      );
      if (!driver.rows[0]) return null;
      const res = await client.query<Record<string, unknown>>(
        `
          INSERT INTO safety.training_records (
            operating_company_id,
            driver_id,
            training_name,
            completed_at,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4::timestamptz, $5::date, $6)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.training_name,
          body.data.completed_at,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );
      const trainingRecord = res.rows[0];
      if (!trainingRecord?.id) throw new Error("safety_training_record_insert_failed");
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.training_record.logged",
        {
          resource_type: "safety.training_records",
          resource_id: trainingRecord.id,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return trainingRecord;
    });

    if (!created) return reply.code(400).send({ error: "driver_not_in_operating_company" });

    return reply.code(201).send(created);
  });

  app.post("/api/v1/safety/training-records/batch", RL_WRITE, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createTrainingRecordBatchSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const eligible = await client.query<{ driver_id: string }>(
        `SELECT requested.driver_id
           FROM unnest($1::uuid[]) requested(driver_id)
           JOIN mdata.drivers d ON d.id = requested.driver_id
          WHERE d.archived_at IS NULL
            AND (d.operating_company_id = $2::uuid
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations training_batch_dca
                WHERE training_batch_dca.driver_id = d.id
                  AND training_batch_dca.company_id = $2::uuid
                  AND training_batch_dca.is_authorized = true
                  AND training_batch_dca.deactivated_at IS NULL
             ))`,
        [body.data.driver_ids, company.data.operating_company_id]
      );
      if (eligible.rows.length !== body.data.driver_ids.length) return null;

      const inserted = await client.query<Record<string, unknown>>(
        `INSERT INTO safety.training_records (
           operating_company_id, driver_id, training_name, completed_at, expiry_date, notes
         )
         SELECT $1::uuid, driver_id, $2, $3::timestamptz, $4::date, $5
           FROM unnest($6::uuid[]) requested(driver_id)
         RETURNING *`,
        [
          company.data.operating_company_id,
          body.data.training_name,
          body.data.completed_at,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
          body.data.driver_ids,
        ]
      );
      if (
        inserted.rows.length !== body.data.driver_ids.length ||
        inserted.rows.some((row) => !row.id || !row.driver_id)
      ) {
        throw new Error("safety_training_record_batch_insert_failed");
      }
      for (const row of inserted.rows) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.training_record.logged",
          {
            resource_type: "safety.training_records",
            resource_id: row.id,
            operating_company_id: company.data.operating_company_id,
            driver_id: row.driver_id,
          },
          "info",
          "P7-SAFETY-DRIVER-PROFILES"
        );
      }
      return inserted.rows;
    });

    if (!created) return reply.code(400).send({ error: "driver_not_in_operating_company" });
    return reply.code(201).send({ training_records: created });
  });
}
