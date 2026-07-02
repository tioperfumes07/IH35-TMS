import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendEmail } from "../notifications/email.service.js";
import { seedSampleData } from "./seed-sample-data.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const onboardingStepSchema = z.enum(["company", "qbo", "samsara", "plaid", "team", "samples", "complete"]);

const getStateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const patchStateBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  current_step: onboardingStepSchema.optional(),
  step_data: z.record(z.string(), z.unknown()).optional(),
  skipped_steps: z.array(onboardingStepSchema).optional(),
  mark_complete: z.boolean().optional(),
  send_team_invites: z.boolean().optional(),
});

const seedBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type InviteRow = {
  email: string;
  role: "admin" | "operator" | "driver";
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string; email?: string | null };
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function mergeStepData(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const prior = merged[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prior &&
      typeof prior === "object" &&
      !Array.isArray(prior)
    ) {
      merged[key] = { ...(prior as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function extractTeamInvites(stepData: Record<string, unknown>): InviteRow[] {
  const teamData = stepData.team;
  if (!teamData || typeof teamData !== "object" || Array.isArray(teamData)) return [];
  const invitesRaw = (teamData as { invites?: unknown }).invites;
  if (!Array.isArray(invitesRaw)) return [];

  const invites: InviteRow[] = [];
  for (const row of invitesRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const email = String((row as { email?: unknown }).email ?? "").trim().toLowerCase();
    const role = String((row as { role?: unknown }).role ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    if (role !== "admin" && role !== "operator" && role !== "driver") continue;
    invites.push({ email, role });
  }
  return invites;
}

async function ensureStateRow(client: Queryable, operatingCompanyId: string) {
  const existing = await client.query<{ company_id: string }>(
    `
      SELECT company_id::text AS company_id
      FROM onboarding.onboarding_state
      WHERE company_id = $1
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  if (existing.rows[0]) return;

  await client.query(
    `
      INSERT INTO onboarding.onboarding_state (company_id, current_step, step_data, skipped_steps)
      VALUES ($1, 'company', '{}'::jsonb, '[]'::jsonb)
      ON CONFLICT (company_id) DO NOTHING
    `,
    [operatingCompanyId]
  );
}

export async function registerOnboardingStateRoutes(app: FastifyInstance) {
  app.get("/api/v1/onboarding/state", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = getStateQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const state = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      await ensureStateRow(client, parsedQuery.data.operating_company_id);
      const res = await client.query(
        `
          SELECT
            company_id::text AS company_id,
            current_step::text AS current_step,
            step_data,
            skipped_steps,
            completed_at::text AS completed_at,
            updated_at::text AS updated_at
          FROM onboarding.onboarding_state
          WHERE company_id = $1
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!state) return reply.code(404).send({ error: "onboarding_state_not_found" });
    return reply.send({
      state,
      steps: ["company", "qbo", "samsara", "plaid", "team", "samples", "complete"],
    });
  });

  app.patch("/api/v1/onboarding/state", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedBody = patchStateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    const result = await withCompanyScope(authUser.uuid, body.operating_company_id, async (client) => {
      await ensureStateRow(client, body.operating_company_id);
      const existingRes = await client.query<{
        step_data: Record<string, unknown>;
        skipped_steps: unknown;
        current_step: string;
      }>(
        `
          SELECT step_data, skipped_steps, current_step
          FROM onboarding.onboarding_state
          WHERE company_id = $1
          LIMIT 1
        `,
        [body.operating_company_id]
      );
      const existing = existingRes.rows[0] ?? { step_data: {}, skipped_steps: [], current_step: "company" };
      const nextStepData = body.step_data ? mergeStepData(existing.step_data ?? {}, body.step_data) : existing.step_data ?? {};
      const nextSkipped = body.skipped_steps ?? (Array.isArray(existing.skipped_steps) ? existing.skipped_steps : []);
      const nextStep = body.mark_complete ? "complete" : body.current_step ?? existing.current_step;

      const updatedRes = await client.query(
        `
          UPDATE onboarding.onboarding_state
          SET current_step = $2,
              step_data = $3::jsonb,
              skipped_steps = $4::jsonb,
              completed_at = CASE WHEN $5 THEN now() ELSE completed_at END,
              updated_at = now()
          WHERE company_id = $1
          RETURNING
            company_id::text AS company_id,
            current_step::text AS current_step,
            step_data,
            skipped_steps,
            completed_at::text AS completed_at,
            updated_at::text AS updated_at
        `,
        [body.operating_company_id, nextStep, JSON.stringify(nextStepData), JSON.stringify(nextSkipped), Boolean(body.mark_complete)]
      );

      let invites_sent = 0;
      let invites_failed = 0;
      if (body.send_team_invites) {
        const invites = extractTeamInvites(nextStepData);
        for (const invite of invites) {
          try {
            await sendEmail({
              to: invite.email,
              subject: "You're invited to IH35 TMS",
              html: `<p>You were invited as <strong>${invite.role}</strong> to IH35 TMS onboarding.</p><p>Please sign in to complete setup.</p>`,
              text: `You were invited as ${invite.role} to IH35 TMS onboarding. Please sign in to complete setup.`,
              sender: "dispatch",
              eventClass: "onboarding.team_invite",
              actorUserId: authUser.uuid,
            });
            invites_sent += 1;
          } catch {
            invites_failed += 1;
          }
        }
      }

      return {
        state: updatedRes.rows[0] ?? null,
        invites_sent,
        invites_failed,
      };
    });

    if (!result.state) return reply.code(404).send({ error: "onboarding_state_not_found" });
    return reply.send(result);
  });

  app.post("/api/v1/onboarding/seed-sample-data", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedBody = seedBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const seeded = await withCompanyScope(authUser.uuid, parsedBody.data.operating_company_id, async (client) => {
      const summary = await seedSampleData(client, {
        operatingCompanyId: parsedBody.data.operating_company_id,
        actorUserId: authUser.uuid,
      });
      await ensureStateRow(client, parsedBody.data.operating_company_id);
      await client.query(
        `
          UPDATE onboarding.onboarding_state
          SET step_data = step_data || jsonb_build_object(
            'samples',
            jsonb_build_object(
              'seeded', true,
              'last_seeded_at', now()::text,
              'summary', $2::jsonb
            )
          ),
          current_step = CASE WHEN current_step = 'samples' THEN 'complete' ELSE current_step END,
          completed_at = CASE WHEN current_step = 'samples' THEN now() ELSE completed_at END,
          updated_at = now()
          WHERE company_id = $1
        `,
        [parsedBody.data.operating_company_id, JSON.stringify(summary)]
      );
      return summary;
    });

    return reply.send({ ok: true, summary: seeded });
  });
}
