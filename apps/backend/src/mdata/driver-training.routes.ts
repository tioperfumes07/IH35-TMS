import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ id: z.string().uuid() });
const trainingParamsSchema = z.object({ id: z.string().uuid(), training_id: z.string().uuid() });

const createTrainingSchema = z.object({
  training_name: z.string().trim().min(1).max(200),
  completed_at: z.string(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const patchTrainingSchema = z.object({
  training_name: z.string().trim().min(1).max(200).optional(),
  completed_at: z.string().optional(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverTrainingRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/drivers/:id/training", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT id::text, training_name, completed_at::text, expiry_date::text, notes
          FROM safety.training_records
          WHERE driver_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          ORDER BY completed_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });

  app.post("/api/v1/mdata/drivers/:id/training", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createTrainingSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO safety.training_records (
            operating_company_id, driver_id, training_name, completed_at, expiry_date, notes
          )
          VALUES ($1, $2, $3, $4::timestamptz, $5::date, $6)
          RETURNING id::text, training_name, completed_at::text, expiry_date::text, notes
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          body.data.training_name,
          body.data.completed_at,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(client, authUser.uuid, "safety.training_record.logged", {
        resource_type: "safety.training_records",
        resource_id: (res.rows[0] as { id?: string })?.id ?? null,
        operating_company_id: query.data.operating_company_id,
        driver_id: params.data.id,
      });
      return res.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/v1/mdata/drivers/:id/training/:training_id", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = trainingParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = patchTrainingSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const sets: string[] = [];
    const values: unknown[] = [query.data.operating_company_id, params.data.id, params.data.training_id];
    if (body.data.training_name !== undefined) {
      values.push(body.data.training_name);
      sets.push(`training_name = $${values.length}`);
    }
    if (body.data.completed_at !== undefined) {
      values.push(body.data.completed_at);
      sets.push(`completed_at = $${values.length}::timestamptz`);
    }
    if (body.data.expiry_date !== undefined) {
      values.push(body.data.expiry_date);
      sets.push(`expiry_date = $${values.length}::date`);
    }
    if (body.data.notes !== undefined) {
      values.push(body.data.notes);
      sets.push(`notes = $${values.length}`);
    }
    if (sets.length === 0) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE safety.training_records
          SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $3::uuid
            AND driver_id = $2::uuid
            AND operating_company_id = $1::uuid
            AND voided_at IS NULL
          RETURNING id::text, training_name, completed_at::text, expiry_date::text, notes
        `,
        values
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "training_record_not_found" });
    return row;
  });

  app.post("/api/v1/mdata/drivers/:id/training/:training_id/archive", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = trainingParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE safety.training_records
          SET voided_at = now(), voided_reason = 'archived_from_driver_profile'
          WHERE id = $3::uuid
            AND driver_id = $2::uuid
            AND operating_company_id = $1::uuid
            AND voided_at IS NULL
          RETURNING id::text
        `,
        [query.data.operating_company_id, params.data.id, params.data.training_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "training_record_not_found" });
    return { ok: true, id: row.id };
  });
}
