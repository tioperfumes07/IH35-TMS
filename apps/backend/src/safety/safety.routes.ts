import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listSafetyEvents } from "./safety.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const eventsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  filter: z.enum(["active", "resolved", "all"]).default("active"),
  window: z.enum(["7d", "10d", "30d", "90d", "all"]).default("7d"),
  event_type: z.string().optional(),
  severity: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const statusBodySchema = z.object({
  status: z.enum(["open", "under-investigation", "closed-no-fault", "closed-driver-at-fault"]),
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

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

export async function registerSafetyRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/dashboard/kpis", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const kpiRes = await client
        .query(
          `
            SELECT *
            FROM views.safety_dashboard_kpis
            WHERE operating_company_id = $1
            LIMIT 1
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const pendingAckRes = await client
        .query<{ count: number }>(
          `
            SELECT COUNT(*)::int AS count
            FROM driver_finance.driver_liabilities
            WHERE operating_company_id = $1
              AND requires_acknowledgment = true
              AND acknowledgment_uuid IS NULL
          `,
          [companyId]
        )
        .catch(() => ({ rows: [{ count: 0 }] }));
      const testsRes = await client
        .query<{ count: number }>(
          `
            SELECT COUNT(*)::int AS count
            FROM safety.drug_test
            WHERE operating_company_id = $1
              AND test_date >= date_trunc('year', now())
              AND voided_at IS NULL
          `,
          [companyId]
        )
        .catch(() => ({ rows: [{ count: 0 }] }));
      const csaRes = await client
        .query<{ score: number }>(
          `
            SELECT COALESCE(score_total, 0)::numeric AS score
            FROM safety.csa_scores_cache
            WHERE operating_company_id = $1
            ORDER BY cached_at DESC
            LIMIT 1
          `,
          [companyId]
        )
        .catch(() => ({ rows: [{ score: 0 }] }));
      return {
        ...(kpiRes.rows[0] ?? {
          operating_company_id: companyId,
          open_events: 0,
          mtd_violations: 0,
          training_due_30d: 0,
        }),
        pending_acks: Number(pendingAckRes.rows[0]?.count ?? 0),
        da_tests_ytd: Number(testsRes.rows[0]?.count ?? 0),
        csa_score_latest: Number(csaRes.rows[0]?.score ?? 0),
      };
    });
    return payload;
  });

  app.get("/api/v1/safety/events", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = eventsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const payload = await listSafetyEvents(user.uuid, q);
    return payload;
  });

  app.get("/api/v1/safety/events/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.safety_events_with_driver
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, query.data.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "safety_event_not_found" });
    return row;
  });

  app.get("/api/v1/safety/training/completions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.training_completions
            WHERE operating_company_id = $1
            ORDER BY completed_at DESC
            LIMIT 500
          `,
          [query.data.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { training_completions: rows };
  });

  app.get("/api/v1/safety/drug-alcohol/tests", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.drug_test
            WHERE operating_company_id = $1
              AND voided_at IS NULL
            ORDER BY test_date DESC
            LIMIT 500
          `,
          [query.data.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { tests: rows };
  });

  app.get("/api/v1/safety/accidents", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.accident_reports
            WHERE operating_company_id = $1
            ORDER BY accident_at DESC
            LIMIT 500
          `,
          [query.data.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { accidents: rows };
  });

  app.get("/api/v1/safety/accidents/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.accident_reports
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, query.data.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "accident_not_found" });
    return row;
  });

  app.patch("/api/v1/safety/accidents/:id/status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = statusBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.accident_reports
          SET status = $2, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $3
          RETURNING *
        `,
        [params.data.id, body.data.status, query.data.operating_company_id]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.event_status_changed",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          status: body.data.status,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return res.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: "accident_not_found" });
    return updated;
  });

  app.post("/api/v1/safety/accidents/:id/photos", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.photo_added",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          filename: file.filename,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return {
        accident_id: params.data.id,
        filename: file.filename,
        added_at: new Date().toISOString(),
      };
    });
    return result;
  });

  app.post("/api/v1/safety/accidents/:id/spawn-liability", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.spawn_liability",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return { accident_id: params.data.id, spawned_liability_id: null };
    });
    return payload;
  });

  app.post("/api/v1/safety/accidents/:id/spawn-wo", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const accidentRes = await client.query(
        `
          SELECT *
          FROM safety.accident_reports
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const accident = accidentRes.rows[0];
      if (!accident) return null;

      const displayRes = await client.query<{ display_id: string; sequence: number }>(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1, 'AC', CURRENT_DATE, $2)
        `,
        [accident.unit_id, query.data.operating_company_id]
      );
      const display = displayRes.rows[0];

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id,
            wo_type,
            source_type,
            status,
            unit_id,
            driver_id,
            opened_at,
            repair_location,
            description,
            display_id,
            unit_sequence
          )
          VALUES (
            $1,
            'accident',
            'AC',
            'open',
            $2,
            $3,
            now(),
            'external_shop',
            $4,
            $5,
            $6
          )
          RETURNING id, display_id
        `,
        [
          query.data.operating_company_id,
          accident.unit_id,
          accident.driver_id ?? null,
          `Auto-created from accident report ${params.data.id}. Fill external vendor WO/invoice fields before completion.`,
          display?.display_id ?? null,
          Number(display?.sequence ?? 0) || null,
        ]
      );
      const wo = woRes.rows[0];

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo_display_id_generated",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          display_id: wo.display_id,
          unit_sequence: Number(display?.sequence ?? 0),
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.6.2-ARRIVING-SOON"
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.accident.spawn_wo",
        {
          resource_type: "safety.accident_reports",
          resource_id: params.data.id,
          spawned_wo_id: wo.id,
          spawned_wo_display_id: wo.display_id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return { accident_id: params.data.id, spawned_wo_id: wo.id, spawned_wo_display_id: wo.display_id };
    });
    if (!payload) return reply.code(404).send({ error: "accident_not_found" });
    return payload;
  });

  app.get("/api/v1/safety/csa/latest", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM safety.csa_scores_cache
            WHERE operating_company_id = $1
            ORDER BY cached_at DESC
            LIMIT 1
          `,
          [query.data.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });
    return { latest: row };
  });
}
