import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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
  if (!requireAuth(req, reply)) return reply;
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function present(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value === true;
}

export function missingRequiredOnboardingSteps(stepData: Record<string, unknown>): number[] {
  const identity = record(stepData.identity);
  const cdl = record(stepData.cdl_upload);
  const medical = record(stepData.medical_card);
  const dqf = record(stepData.dqf_docs);
  const mvr = record(dqf.mvr);
  const signatures = record(stepData.signatures);
  const i9 = record(stepData.i9);
  const missing: number[] = [];
  if (!present(identity.first_name) || !present(identity.last_name) || !present(identity.phone)) missing.push(1);
  if (!present(cdl.file_id)) missing.push(2);
  if (!present(medical.file_id) || !present(medical.expires_at)) missing.push(3);
  if (!present(mvr.file_id)) missing.push(4);
  if (signatures.acknowledged !== true) missing.push(5);
  if (i9.section1_completed !== true || !present(i9.file_id)) missing.push(6);
  // Step 7 is explicitly optional; assigning a unit later from Driver Profile is valid.
  return missing;
}

export async function registerSafetyOnboardingRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/safety/onboarding/sessions",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = createSessionSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      // DRV-ONBOARD-LAUNCH — the Driver Profile is the canonical launcher. Repeated clicks must
      // resume the same open workflow, never fork duplicate qualification chains for one driver.
      if (body.data.driver_id) {
        const driver = await client.query<{ id: string }>(
          `SELECT id::text
             FROM mdata.drivers
            WHERE operating_company_id = $1::uuid
              AND id = $2::uuid
              AND deactivated_at IS NULL
            LIMIT 1
            FOR UPDATE`,
          [body.data.operating_company_id, body.data.driver_id]
        );
        if (!driver.rows[0]?.id) return { kind: "driver_not_found" as const };
        const existing = await client.query(
          `SELECT *
             FROM safety.onboarding_sessions
            WHERE operating_company_id = $1::uuid
              AND driver_id = $2::uuid
              AND status = 'in_progress'
            ORDER BY created_at DESC
            LIMIT 1`,
          [body.data.operating_company_id, body.data.driver_id]
        );
        if (existing.rows[0]) return { kind: "ok" as const, session: existing.rows[0], resumed: true as const };
      }
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
      const session = res.rows[0] as { id?: string } | undefined;
      if (!session?.id) throw new Error("safety_onboarding_session_insert_failed");
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.onboarding_session.created",
        {
          resource_type: "safety.onboarding_sessions",
          resource_id: session.id,
          operating_company_id: body.data.operating_company_id,
          driver_id: body.data.driver_id ?? null,
        },
        "info",
        "A24-8-DRIVER-ONBOARDING"
      );
      return { kind: "ok" as const, session, resumed: false as const };
    });

    if (result.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    return reply.code(result.resumed ? 200 : 201).send(result);
    }
  );

  app.get("/api/v1/safety/onboarding/sessions/:session_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const session = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            session.*,
            NULLIF(TRIM(CONCAT_WS(' ', driver.first_name, driver.last_name)), '') AS driver_name
          FROM safety.onboarding_sessions session
          LEFT JOIN mdata.drivers driver
            ON driver.id = session.driver_id
           AND (driver.operating_company_id = session.operating_company_id OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations onboarding_detail_dca
             WHERE onboarding_detail_dca.driver_id = driver.id
               AND onboarding_detail_dca.company_id = session.operating_company_id
               AND onboarding_detail_dca.is_authorized = true
               AND onboarding_detail_dca.deactivated_at IS NULL
           ))
          WHERE session.id = $1
            AND session.operating_company_id = $2::uuid
        `,
        [params.data.session_id, company.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!session) return reply.code(404).send({ error: "not_found" });
    return reply.send({ session, steps: ONBOARDING_STEP_KEYS });
  });

  app.patch("/api/v1/safety/onboarding/sessions/:session_id/step", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
          WHERE id = $1 AND operating_company_id = $2::uuid
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
          WHERE id = $1 AND operating_company_id = $2::uuid
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

  app.post("/api/v1/safety/onboarding/sessions/:session_id/complete", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const result = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const existingRes = await client.query<{ step_data: Record<string, unknown>; status: string }>(
        `SELECT step_data, status
           FROM safety.onboarding_sessions
          WHERE id = $1
            AND operating_company_id = $2::uuid
          FOR UPDATE`,
        [params.data.session_id, company.data.operating_company_id]
      );
      const existing = existingRes.rows[0];
      if (!existing || existing.status !== "in_progress") return { error: "not_found" as const };
      const missingSteps = missingRequiredOnboardingSteps(existing.step_data ?? {});
      if (missingSteps.length > 0) {
        return { error: "onboarding_incomplete" as const, missing_steps: missingSteps };
      }
      const res = await client.query(
        `
          UPDATE safety.onboarding_sessions
          SET status = 'completed',
              current_step = 7,
              completed_at = now(),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
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

    if ("error" in result) {
      if (result.error === "onboarding_incomplete") {
        return reply.code(409).send({ error: result.error, missing_steps: result.missing_steps });
      }
      return reply.code(404).send({ error: result.error });
    }
    return reply.send(result);
  });

  app.post("/api/v1/safety/onboarding/sessions/:session_id/admin-override", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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
