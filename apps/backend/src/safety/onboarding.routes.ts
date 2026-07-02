import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

export const ONBOARDING_STEP_KEYS = [
  "identity",
  "cdl_upload",
  "medical_card",
  "dqf_docs",
  "signatures",
  "i9",
  "vehicle_assignment",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const sessionParamsSchema = z.object({
  session_id: z.string().uuid(),
});

const createSessionSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
});

const saveStepSchema = z.object({
  step: z.number().int().min(1).max(7),
  step_data: z.record(z.string(), z.unknown()),
  advance: z.boolean().optional(),
});

const adminOverrideSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
  missing_steps: z.array(z.number().int().min(1).max(7)).optional(),
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
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function stepKeyForIndex(step: number): OnboardingStepKey {
  return ONBOARDING_STEP_KEYS[step - 1] ?? "identity";
}

function mergeStepData(existing: Record<string, unknown>, step: number, patch: Record<string, unknown>) {
  const key = stepKeyForIndex(step);
  const prior = (existing[key] as Record<string, unknown> | undefined) ?? {};
  return {
    ...existing,
    [key]: { ...prior, ...patch },
  };
}

export async function registerSafetyOnboardingRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/onboarding/sessions", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = createSessionSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const session = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.onboarding_sessions (
            operating_company_id,
            driver_id,
            current_step,
            status,
            step_data,
            created_by_user_id
          )
          VALUES ($1, $2, 1, 'in_progress', '{}'::jsonb, $3)
          RETURNING *
        `,
        [body.data.operating_company_id, body.data.driver_id ?? null, user.uuid]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.onboarding_session.created",
        {
          resource_type: "safety.onboarding_sessions",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: body.data.operating_company_id,
        },
        "info",
        "A24-8-DRIVER-ONBOARDING"
      );
      return res.rows[0];
    });

    return reply.code(201).send({ session });
  });

  app.get("/api/v1/safety/onboarding/sessions/:session_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const session = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.onboarding_sessions
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.session_id, company.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!session) return reply.code(404).send({ error: "not_found" });
    return reply.send({ session, steps: ONBOARDING_STEP_KEYS });
  });

  app.patch("/api/v1/safety/onboarding/sessions/:session_id/step", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = saveStepSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const existingRes = await client.query<{ step_data: Record<string, unknown>; current_step: number; status: string }>(
        `
          SELECT step_data, current_step, status
          FROM safety.onboarding_sessions
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.session_id, company.data.operating_company_id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { error: "not_found" as const };
      if (existing.status !== "in_progress") return { error: "session_not_editable" as const };

      const merged = mergeStepData(existing.step_data ?? {}, body.data.step, body.data.step_data);
      const nextStep = body.data.advance
        ? Math.min(7, Math.max(existing.current_step, body.data.step) + 1)
        : Math.max(existing.current_step, body.data.step);

      const res = await client.query(
        `
          UPDATE safety.onboarding_sessions
          SET step_data = $3::jsonb,
              current_step = $4,
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.session_id, company.data.operating_company_id, JSON.stringify(merged), nextStep]
      );
      return { session: res.rows[0] };
    });

    if ("error" in updated) {
      if (updated.error === "not_found") return reply.code(404).send({ error: "not_found" });
      return reply.code(409).send({ error: updated.error });
    }

    return reply.send(updated);
  });

  app.post("/api/v1/safety/onboarding/sessions/:session_id/complete", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const result = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.onboarding_sessions
          SET status = 'completed',
              current_step = 7,
              completed_at = now(),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND status = 'in_progress'
          RETURNING *
        `,
        [params.data.session_id, company.data.operating_company_id]
      );
      if (!res.rows[0]) return { error: "not_found" as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.onboarding_session.completed",
        {
          resource_type: "safety.onboarding_sessions",
          resource_id: params.data.session_id,
          operating_company_id: company.data.operating_company_id,
        },
        "info",
        "A24-8-DRIVER-ONBOARDING"
      );
      return { session: res.rows[0] };
    });

    if ("error" in result) return reply.code(404).send({ error: result.error });
    return reply.send(result);
  });

  app.post("/api/v1/safety/onboarding/sessions/:session_id/admin-override", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = adminOverrideSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.onboarding_sessions
          SET admin_override = true,
              admin_override_reason = $3,
              admin_override_by = $4,
              status = 'completed',
              current_step = 7,
              completed_at = now(),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND status = 'in_progress'
          RETURNING *
        `,
        [params.data.session_id, company.data.operating_company_id, body.data.reason, user.uuid]
      );
      if (!res.rows[0]) return { error: "not_found" as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.onboarding_session.admin_override",
        {
          resource_type: "safety.onboarding_sessions",
          resource_id: params.data.session_id,
          operating_company_id: company.data.operating_company_id,
          reason: body.data.reason,
          missing_steps: body.data.missing_steps ?? [],
        },
        "warning",
        "A24-8-DRIVER-ONBOARDING"
      );
      return { session: res.rows[0] };
    });

    if ("error" in result) return reply.code(404).send({ error: result.error });
    return reply.send(result);
  });
}
