import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { createTeam, deactivateTeam, listDriverTeams } from "../mdata/driver-team.service.js";

const uuid = z.string().uuid();

const listQuerySchema = z.object({
  operating_company_id: uuid,
  active_only: z.enum(["true", "false"]).optional(),
});

const createBodySchema = z
  .object({
    operating_company_id: uuid,
    primary_driver_id: uuid,
    secondary_driver_id: uuid,
    team_name: z.string().trim().min(1).max(200).optional(),
    split_pct_primary: z.number().min(0).max(100),
    split_pct_secondary: z.number().min(0).max(100),
    notes: z.string().trim().max(5000).optional(),
  })
  .refine((v) => Math.round((v.split_pct_primary + v.split_pct_secondary) * 100) / 100 === 100, {
    message: "split_must_sum_to_100",
    path: ["split_pct_secondary"],
  });

const patchBodySchema = z
  .object({
    operating_company_id: uuid,
    split_pct_primary: z.number().min(0).max(100),
    split_pct_secondary: z.number().min(0).max(100),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Math.round((v.split_pct_primary + v.split_pct_secondary) * 100) / 100 === 100, {
    message: "split_must_sum_to_100",
    path: ["split_pct_secondary"],
  });

const idParamsSchema = z.object({ teamId: z.string().uuid() });

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureOffice(req: FastifyRequest, reply: FastifyReply) {
  const user = auth(req, reply);
  if (!user) return null;
  if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverTeamsAliasRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-teams", async (req, reply) => {
    const user = ensureOffice(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await listDriverTeams(user.uuid, query.data.operating_company_id);
    const activeOnly = query.data.active_only === "true";
    const filtered = activeOnly
      ? rows.filter((r) => Boolean((r as { is_active?: boolean }).is_active) && !(r as { effective_to?: string | null }).effective_to)
      : rows;

    return {
      teams: filtered.map((t) => ({
        ...t,
        split_pct_primary: Number((t as { primary_share_pct?: unknown }).primary_share_pct ?? 0),
        split_pct_secondary: Number((t as { co_share_pct?: unknown }).co_share_pct ?? 0),
        active_from: (t as { effective_from?: unknown }).effective_from ?? null,
        active_to: (t as { effective_to?: unknown }).effective_to ?? null,
      })),
    };
  });

  app.post("/api/v1/driver-teams", async (req, reply) => {
    const user = ensureOffice(req, reply);
    if (!user) return;
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const teamName =
      body.data.team_name?.trim() ||
      `Team ${body.data.primary_driver_id.slice(0, 8)}+${body.data.secondary_driver_id.slice(0, 8)}`;

    try {
      const created = await createTeam(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        primary_driver_id: body.data.primary_driver_id,
        co_driver_id: body.data.secondary_driver_id,
        team_name: teamName,
        split_method: "custom",
        primary_share_pct: body.data.split_pct_primary,
        co_share_pct: body.data.split_pct_secondary,
        notes: body.data.notes,
      });
      return reply.code(201).send({ team: created });
    } catch (error) {
      return reply.code(400).send({ error: String((error as Error)?.message ?? "create_team_failed") });
    }
  });

  app.patch("/api/v1/driver-teams/:teamId", async (req, reply) => {
    const user = ensureOffice(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    try {
      const row = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
        const updated = await client.query(
          `
            UPDATE mdata.driver_teams
            SET primary_share_pct = $3,
                co_share_pct = $4,
                split_method = 'custom',
                notes = COALESCE($5, notes),
                updated_at = now()
            WHERE id = $2
              AND operating_company_id = $1
            RETURNING *
          `,
          [
            body.data.operating_company_id,
            params.data.teamId,
            body.data.split_pct_primary,
            body.data.split_pct_secondary,
            body.data.notes ?? null,
          ]
        );
        return updated.rows[0] ?? null;
      });
      if (!row) return reply.code(404).send({ error: "team_not_found" });
      return { team: row };
    } catch (error) {
      return reply.code(400).send({ error: String((error as Error)?.message ?? "update_team_failed") });
    }
  });

  app.delete("/api/v1/driver-teams/:teamId", async (req, reply) => {
    const user = ensureOffice(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = z.object({ operating_company_id: uuid }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    try {
      await deactivateTeam(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        team_id: params.data.teamId,
        reason: "driver-teams api soft delete",
      });
      return reply.code(204).send();
    } catch (error) {
      const msg = String((error as Error)?.message ?? "delete_team_failed");
      const code = msg.includes("E_TEAM_HAS_IN_PROGRESS_LOADS") ? 409 : 400;
      return reply.code(code).send({ error: msg });
    }
  });
}
