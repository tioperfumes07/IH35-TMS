import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  is_active: z.enum(["true", "false"]).optional(),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const replaceDriverParamsSchema = z.object({ id: z.string().uuid() });

const createDriverTeamBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    team_name: z.string().trim().min(1).max(200),
    primary_driver_id: z.string().uuid(),
    secondary_driver_id: z.string().uuid(),
    relationship: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(5000).optional(),
    effective_from: isoDateSchema.optional(),
  })
  .refine((body) => body.primary_driver_id !== body.secondary_driver_id, {
    message: "primary and secondary driver must be different",
    path: ["secondary_driver_id"],
  });

const updateDriverTeamBodySchema = z
  .object({
    team_name: z.string().trim().min(1).max(200).optional(),
    relationship: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const replaceDriverBodySchema = z.object({
  driver_slot: z.enum(["primary", "secondary"]),
  new_driver_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureWriteRole(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function parseDate(dateText?: string): Date | null {
  if (!dateText) return null;
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function driverBelongsToCompany(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  driverId: string,
  companyId: string
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT d.id
      FROM mdata.drivers d
      JOIN org.user_company_access uca ON uca.user_id = d.identity_user_id
      WHERE d.id = $1
        AND uca.company_id = $2
        AND uca.deactivated_at IS NULL
      LIMIT 1
    `,
    [driverId, companyId]
  );
  return res.rows.length > 0;
}

async function activeTeamExistsForDriver(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  driverId: string,
  excludeTeamId?: string
): Promise<boolean> {
  const values: unknown[] = [driverId];
  let where = `(primary_driver_id = $1 OR secondary_driver_id = $1) AND is_active = true`;
  if (excludeTeamId) {
    values.push(excludeTeamId);
    where += ` AND id <> $${values.length}`;
  }
  const res = await client.query<{ id: string }>(`SELECT id FROM mdata.driver_teams WHERE ${where} LIMIT 1`, values);
  return res.rows.length > 0;
}

function ensureEffectiveFromWithinWindow(effectiveFrom: string | undefined): boolean {
  if (!effectiveFrom) return true;
  const parsed = parseDate(effectiveFrom);
  if (!parsed) return false;
  const now = new Date();
  const nowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const maxDate = new Date(nowDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return parsed.getTime() <= maxDate.getTime();
}

export async function registerDriverTeamRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/driver-teams", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const filters: string[] = [];
      const values: unknown[] = [];
      if (parsedQuery.data.is_active) {
        values.push(parsedQuery.data.is_active === "true");
        filters.push(`t.is_active = $${values.length}`);
      }
      // Entity scope (USMCA cross-entity leak fix): ALWAYS bind operating_company_id so driver-team
      // rosters never blend across operating companies. Resolve from the param or user context.
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid, parsedQuery.data.operating_company_id);
      if (!scopedCompanyId) return [];
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [scopedCompanyId]);
      values.push(scopedCompanyId);
      filters.push(`t.operating_company_id = $${values.length}`);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            t.id,
            t.operating_company_id,
            t.team_name,
            t.primary_driver_id,
            pd.first_name AS primary_driver_first_name,
            pd.last_name AS primary_driver_last_name,
            t.secondary_driver_id,
            sd.first_name AS secondary_driver_first_name,
            sd.last_name AS secondary_driver_last_name,
            t.relationship,
            t.notes,
            t.is_active,
            t.effective_from,
            t.effective_to,
            t.created_at,
            t.updated_at,
            t.created_by_user_id
          FROM mdata.driver_teams t
          JOIN mdata.drivers pd ON pd.id = t.primary_driver_id
          JOIN mdata.drivers sd ON sd.id = t.secondary_driver_id
          ${whereClause}
          ORDER BY t.is_active DESC, t.created_at DESC
        `,
        values
      );
      return res.rows;
    });

    return { teams: rows };
  });

  app.get("/api/v1/mdata/driver-teams/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const team = await withCurrentUser(user.uuid, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): a by-id team read must not cross operating
      // companies. Scope to the user's current company.
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid);
      if (!scopedCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [scopedCompanyId]);
      const res = await client.query(
        `
          SELECT
            t.id,
            t.operating_company_id,
            t.team_name,
            t.primary_driver_id,
            pd.first_name AS primary_driver_first_name,
            pd.last_name AS primary_driver_last_name,
            t.secondary_driver_id,
            sd.first_name AS secondary_driver_first_name,
            sd.last_name AS secondary_driver_last_name,
            t.relationship,
            t.notes,
            t.is_active,
            t.effective_from,
            t.effective_to,
            t.created_at,
            t.updated_at,
            t.created_by_user_id
          FROM mdata.driver_teams t
          JOIN mdata.drivers pd ON pd.id = t.primary_driver_id
          JOIN mdata.drivers sd ON sd.id = t.secondary_driver_id
          WHERE t.id = $1
            AND t.operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, scopedCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!team) return reply.code(404).send({ error: "mdata_driver_team_not_found" });
    return team;
  });

  app.post("/api/v1/mdata/driver-teams", async (req, reply) => {
    const user = ensureWriteRole(req, reply);
    if (!user) return;
    const parsedBody = createDriverTeamBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    if (!ensureEffectiveFromWithinWindow(b.effective_from)) {
      return reply.code(400).send({ error: "effective_from_out_of_range" });
    }

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const companyRes = await client.query<{ id: string }>(
          `SELECT id FROM org.companies WHERE id = $1 AND deactivated_at IS NULL LIMIT 1`,
          [b.operating_company_id]
        );
        if (companyRes.rows.length === 0) return { error: "operating_company_not_found" as const };

        const primaryValid = await driverBelongsToCompany(client, b.primary_driver_id, b.operating_company_id);
        const secondaryValid = await driverBelongsToCompany(client, b.secondary_driver_id, b.operating_company_id);
        if (!primaryValid || !secondaryValid) return { error: "drivers_not_in_operating_company" as const };

        if (await activeTeamExistsForDriver(client, b.primary_driver_id)) return { error: "driver_already_in_active_team" as const };
        if (await activeTeamExistsForDriver(client, b.secondary_driver_id)) return { error: "driver_already_in_active_team" as const };

        const res = await client.query(
          `
            INSERT INTO mdata.driver_teams (
              operating_company_id,
              team_name,
              primary_driver_id,
              secondary_driver_id,
              relationship,
              notes,
              effective_from,
              created_by_user_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *
          `,
          [
            b.operating_company_id,
            b.team_name,
            b.primary_driver_id,
            b.secondary_driver_id,
            b.relationship ?? null,
            b.notes ?? null,
            b.effective_from ?? new Date().toISOString().slice(0, 10),
            user.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "mdata.driver_teams.created",
          {
            resource_id: row.id,
            resource_type: "mdata.driver_teams",
            primary_driver_id: row.primary_driver_id,
            secondary_driver_id: row.secondary_driver_id,
            operating_company_id: row.operating_company_id,
          },
          "info",
          "BT-3-DRIVER-TEAMS"
        );
        return row;
      });

      if (created && typeof created === "object" && "error" in created) {
        if (created.error === "operating_company_not_found") return reply.code(400).send({ error: created.error });
        if (created.error === "drivers_not_in_operating_company") return reply.code(400).send({ error: created.error });
        if (created.error === "driver_already_in_active_team") return reply.code(409).send({ error: created.error });
      }

      return reply.code(201).send(created);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "driver_team_conflict" });
      if (code === "23514") return reply.code(400).send({ error: "driver_team_constraint_violation" });
      throw error;
    }
  });

  app.patch("/api/v1/mdata/driver-teams/:id", async (req, reply) => {
    const user = ensureWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDriverTeamBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      setParts.push(`${column} = $${values.length}`);
    };
    if ("team_name" in b) add("team_name", b.team_name);
    if ("relationship" in b) add("relationship", b.relationship ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    values.push(parsedParams.data.id);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const oldRes = await client.query(`SELECT * FROM mdata.driver_teams WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;
      const res = await client.query(
        `
          UPDATE mdata.driver_teams
          SET ${setParts.join(", ")}
          WHERE id = $${values.length}
          RETURNING *
        `,
        values
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      const changes = buildPatchChanges(
        b as unknown as Record<string, unknown>,
        oldRow as Record<string, unknown>,
        row as Record<string, unknown>
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "mdata.driver_teams.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_teams",
          changes,
        },
        "info",
        "BT-3-DRIVER-TEAMS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "mdata_driver_team_not_found" });
    return updated;
  });

  app.post("/api/v1/mdata/driver-teams/:id/deactivate", async (req, reply) => {
    const user = ensureWriteRole(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE mdata.driver_teams
          SET is_active = false,
              effective_to = COALESCE(effective_to, CURRENT_DATE)
          WHERE id = $1
          RETURNING *
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "mdata.driver_teams.deactivated",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_teams",
          effective_to: row.effective_to,
        },
        "warning",
        "BT-3-DRIVER-TEAMS"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "mdata_driver_team_not_found" });
    return updated;
  });

  app.post("/api/v1/mdata/driver-teams/:id/replace-driver", async (req, reply) => {
    const user = ensureWriteRole(req, reply);
    if (!user) return;
    const parsedParams = replaceDriverParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = replaceDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const result = await withCurrentUser(user.uuid, async (client) => {
        const teamRes = await client.query(`SELECT * FROM mdata.driver_teams WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
        const team = teamRes.rows[0] ?? null;
        if (!team) return { error: "mdata_driver_team_not_found" as const };
        if (!team.is_active) return { error: "driver_team_not_active" as const };

        const primaryDriverId = b.driver_slot === "primary" ? b.new_driver_id : team.primary_driver_id;
        const secondaryDriverId = b.driver_slot === "secondary" ? b.new_driver_id : team.secondary_driver_id;
        if (primaryDriverId === secondaryDriverId) return { error: "driver_team_constraint_violation" as const };

        const replacementValid = await driverBelongsToCompany(client, b.new_driver_id, team.operating_company_id);
        if (!replacementValid) return { error: "drivers_not_in_operating_company" as const };
        if (await activeTeamExistsForDriver(client, b.new_driver_id, team.id))
          return { error: "driver_already_in_active_team" as const };

        const deactivateRes = await client.query(
          `
            UPDATE mdata.driver_teams
            SET is_active = false, effective_to = COALESCE(effective_to, CURRENT_DATE)
            WHERE id = $1
            RETURNING *
          `,
          [team.id]
        );
        const deactivated = deactivateRes.rows[0];

        const createRes = await client.query(
          `
            INSERT INTO mdata.driver_teams (
              operating_company_id,
              team_name,
              primary_driver_id,
              secondary_driver_id,
              relationship,
              notes,
              is_active,
              effective_from,
              effective_to,
              created_by_user_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,true,CURRENT_DATE,NULL,$7)
            RETURNING *
          `,
          [
            team.operating_company_id,
            team.team_name,
            primaryDriverId,
            secondaryDriverId,
            team.relationship,
            team.notes,
            user.uuid,
          ]
        );
        const replacement = createRes.rows[0];

        await appendCrudAudit(
          client,
          user.uuid,
          "mdata.driver_teams.deactivated",
          {
            resource_id: deactivated.id,
            resource_type: "mdata.driver_teams",
            replaced_by_team_id: replacement.id,
          },
          "warning",
          "BT-3-DRIVER-TEAMS"
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "mdata.driver_teams.driver_replaced",
          {
            resource_id: replacement.id,
            resource_type: "mdata.driver_teams",
            previous_team_id: team.id,
            driver_slot: b.driver_slot,
            old_driver_id: b.driver_slot === "primary" ? team.primary_driver_id : team.secondary_driver_id,
            new_driver_id: b.new_driver_id,
            primary_driver_id: replacement.primary_driver_id,
            secondary_driver_id: replacement.secondary_driver_id,
          },
          "info",
          "BT-3-DRIVER-TEAMS"
        );

        return { previous_team: deactivated, replacement_team: replacement };
      });

      if (result && typeof result === "object" && "error" in result) {
        if (result.error === "mdata_driver_team_not_found") return reply.code(404).send({ error: result.error });
        if (result.error === "driver_team_not_active") return reply.code(409).send({ error: result.error });
        if (result.error === "drivers_not_in_operating_company") return reply.code(400).send({ error: result.error });
        if (result.error === "driver_already_in_active_team") return reply.code(409).send({ error: result.error });
        if (result.error === "driver_team_constraint_violation") return reply.code(400).send({ error: result.error });
      }

      return result;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "driver_team_conflict" });
      if (code === "23514") return reply.code(400).send({ error: "driver_team_constraint_violation" });
      throw error;
    }
  });
}
