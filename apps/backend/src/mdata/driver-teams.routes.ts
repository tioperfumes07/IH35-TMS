import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  is_active: z.enum(["true", "false"]).optional(),
  operating_company_id: z.string().uuid(),
});
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

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
  // CC3-DRIVERTEAMS-COMPANY-JOIN-20260822 — this used to also JOIN org.user_company_access on
  // uca.user_id = d.identity_user_id, requiring the driver's OWN LOGIN ACCOUNT to hold an active
  // company-access grant. That is a different authorization concept (which humans can sign into
  // which company) from "which company does this driver ROW belong to" and excludes the vast
  // majority of drivers: only 15/264 have identity_user_id set at all (no Driver PWA login yet).
  // Live-reproduced on this exact endpoint, USMCA, 2026-08-22: the Primary/Secondary Driver
  // pickers (EntityPicker kind=driver, itself correctly scoped by d.operating_company_id only —
  // see drivers.routes.ts GET /api/v1/mdata/drivers) offered real USMCA drivers Isaac Carballo
  // Roque + Luis Manuel Zavaleta Landeros, and POST /api/v1/mdata/driver-teams hard-rejected both
  // with `drivers_not_in_operating_company` because neither has an identity_user_id. This is the
  // identical defect already root-caused and fixed in the sibling `assertDriverCompany` in
  // driver-team.service.ts (2026-08-18, PEDRO/Neftali Live — the same fix, ported here): opco on
  // the driver ROW is the membership gate, full stop. Cross-company leakage is already blocked by
  // `d.operating_company_id = $2` alone; no other predicate adds real protection, only false
  // rejections.
  const res = await client.query<{ id: string }>(
    `
      SELECT d.id
      FROM mdata.drivers d
      WHERE d.id = $1
        AND d.operating_company_id = $2::uuid
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
  // Rate-limited (CodeQL js/missing-rate-limiting) — pre-existing gap surfaced because this PR touched
  // the file; the plugin is global:false so an un-configured route has NO limit at all.
  app.get("/api/v1/mdata/driver-teams", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      values.push(scopedCompanyId);
      filters.push(`t.operating_company_id = $${values.length}::uuid`);
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
                               AND (pd.operating_company_id = t.operating_company_id OR EXISTS (
                                 SELECT 1 FROM mdata.driver_company_authorizations pd_dca
                                  WHERE pd_dca.driver_id = pd.id AND pd_dca.company_id = t.operating_company_id
                                    AND pd_dca.is_authorized = true AND pd_dca.deactivated_at IS NULL
                               ))
          JOIN mdata.drivers sd ON sd.id = t.secondary_driver_id
                               AND (sd.operating_company_id = t.operating_company_id OR EXISTS (
                                 SELECT 1 FROM mdata.driver_company_authorizations sd_dca
                                  WHERE sd_dca.driver_id = sd.id AND sd_dca.company_id = t.operating_company_id
                                    AND sd_dca.is_authorized = true AND sd_dca.deactivated_at IS NULL
                               ))
          ${whereClause}
          ORDER BY t.is_active DESC, t.created_at DESC
        `,
        values
      );
      return res.rows;
    });

    return { teams: rows };
  });

  app.get("/api/v1/mdata/driver-teams/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const team = await withCurrentUser(user.uuid, async (client) => {
      // Bind the exact company selected by the caller. Falling back to the user's default company
      // makes a valid team opened after an entity switch look missing (or resolves the wrong entity).
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid, parsedQuery.data.operating_company_id);
      if (!scopedCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
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
                               AND (pd.operating_company_id = t.operating_company_id OR EXISTS (
                                 SELECT 1 FROM mdata.driver_company_authorizations pd_dca
                                  WHERE pd_dca.driver_id = pd.id AND pd_dca.company_id = t.operating_company_id
                                    AND pd_dca.is_authorized = true AND pd_dca.deactivated_at IS NULL
                               ))
          JOIN mdata.drivers sd ON sd.id = t.secondary_driver_id
                               AND (sd.operating_company_id = t.operating_company_id OR EXISTS (
                                 SELECT 1 FROM mdata.driver_company_authorizations sd_dca
                                  WHERE sd_dca.driver_id = sd.id AND sd_dca.company_id = t.operating_company_id
                                    AND sd_dca.is_authorized = true AND sd_dca.deactivated_at IS NULL
                               ))
          WHERE t.id = $1
            AND t.operating_company_id = $2::uuid
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
            b.effective_from ?? companyBusinessDate(),
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
    const idIdx = values.length;

    const updated = await withCurrentUser(user.uuid, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): a by-id team mutation must not cross operating
      // companies — RLS on mdata.driver_teams is role-scoped, so an Owner could otherwise PATCH
      // another entity's team by id. Bind operating_company_id from the caller's company context.
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid);
      if (!scopedCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      const oldRes = await client.query(
        `SELECT * FROM mdata.driver_teams WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [parsedParams.data.id, scopedCompanyId]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;
      values.push(scopedCompanyId);
      const companyIdx = values.length;
      const res = await client.query(
        `
          UPDATE mdata.driver_teams
          SET ${setParts.join(", ")}
          WHERE id = $${idIdx}
            AND operating_company_id = $${companyIdx}::uuid
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
      // Entity scope (USMCA cross-entity leak fix): scope the deactivate to the caller's operating
      // company so an Owner can't deactivate another entity's team by id (RLS is role-scoped).
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid);
      if (!scopedCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      const res = await client.query(
        `
          UPDATE mdata.driver_teams
          SET is_active = false,
              effective_to = COALESCE(effective_to, CURRENT_DATE)
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
        [parsedParams.data.id, scopedCompanyId]
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
        // Entity scope (USMCA cross-entity leak fix): scope the source-team read to the caller's
        // operating company so replace-driver can't deactivate/rebuild another entity's team by id
        // (RLS on mdata.driver_teams is role-scoped, not entity-scoped).
        const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid);
        if (!scopedCompanyId) return { error: "mdata_driver_team_not_found" as const };
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
        const teamRes = await client.query(
          `SELECT * FROM mdata.driver_teams WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [parsedParams.data.id, scopedCompanyId]
        );
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
              AND operating_company_id = $2::uuid
              AND is_active = true
            RETURNING *
          `,
          [team.id, team.operating_company_id]
        );
        const deactivated = deactivateRes.rows[0];
        if (!deactivated) return { error: "driver_team_state_changed" as const };

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
        if (result.error === "driver_team_state_changed") return reply.code(409).send({ error: result.error });
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
