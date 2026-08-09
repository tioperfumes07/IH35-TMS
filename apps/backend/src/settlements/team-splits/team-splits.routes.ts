/**
 * P2b/P2f team-split convergence (owner ruling DECISION 2, Option A — 2026-07-21).
 *
 * The plural /api/v1/team-splits/* endpoints STAY (never-delete law) but are now a FACADE over
 * canonical System A: a "config" is the active mdata.driver_teams row for a driver pair
 * (split_method + primary/co share pcts); writes reuse the canonical createTeam/deactivateTeam
 * service (same validation, audit, and single-active-team invariant as the Teams UI — no second
 * write path). The per-load override persists on additive mdata.loads.team_split_override_*
 * columns (migration 202607660000). The RETIRE settlements-namespace team-split config/override
 * tables have ZERO references here (guard: scripts/verify-no-settlements-team-split-refs.mjs).
 *
 * Wire contract (field names/shapes) is preserved for apps/frontend/src/hooks/useTeamSplits.ts:
 * { configs: [...] } / { config } / { ok } / { override } with primary_ratio/secondary_ratio,
 * split_type, status ('active'|'paused'|'ended'), effective_from_date/effective_to_date, memo.
 * Canonical fields (team_name, split_method, is_active) ride along ADDITIVELY.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";
import { createTeam, deactivateTeam, type TeamSplitMethod } from "../../mdata/driver-team.service.js";
import { effectiveTeamPercentsFromRow } from "../../driver-finance/settlement-engine.js";

const splitTypeSchema = z.enum(["percentage", "fixed", "mileage"]);
const statusSchema = z.enum(["active", "paused", "ended"]);

const createConfigSchema = z
  .object({
    primary_driver_id: z.string().uuid(),
    secondary_driver_id: z.string().uuid(),
    split_type: splitTypeSchema.default("percentage"),
    primary_ratio: z.coerce.number().min(0.01).max(1),
    secondary_ratio: z.coerce.number().min(0.01).max(1),
    effective_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    effective_to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    memo: z.string().trim().max(2000).optional(),
  })
  .refine((body) => body.primary_driver_id !== body.secondary_driver_id, {
    message: "primary and secondary driver must differ",
    path: ["secondary_driver_id"],
  })
  .refine((body) => Math.abs(body.primary_ratio + body.secondary_ratio - 1) < 0.0001, {
    message: "ratios must sum to 1",
    path: ["secondary_ratio"],
  });

const listQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  status: statusSchema.optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const loadIdParamsSchema = z.object({ id: z.string().uuid() });

const loadOverrideSchema = z
  .object({
    operating_company_id: z.string().uuid(),
    primary_driver_id: z.string().uuid(),
    secondary_driver_id: z.string().uuid(),
    primary_ratio: z.coerce.number().min(0.01).max(1),
    secondary_ratio: z.coerce.number().min(0.01).max(1),
    reason: z.enum(["one_off_team", "config_override"]).default("one_off_team"),
  })
  .refine((body) => body.primary_driver_id !== body.secondary_driver_id, {
    message: "primary and secondary driver must differ",
    path: ["secondary_driver_id"],
  })
  .refine((body) => Math.abs(body.primary_ratio + body.secondary_ratio - 1) < 0.0001, {
    message: "ratios must sum to 1",
    path: ["secondary_ratio"],
  });

/** Matches the mdata.driver_teams write RLS policy (Owner/Administrator/Manager/Dispatcher). */
function ensureOfficeRole(role: unknown): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Dispatcher";
}

type TeamRowLike = {
  id: string;
  operating_company_id: string;
  team_name: string;
  primary_driver_id: string;
  secondary_driver_id: string;
  split_method: string;
  primary_share_pct: string | number | null;
  co_share_pct: string | number | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at?: string;
  primary_driver_name?: string | null;
  secondary_driver_name?: string | null;
};

/** Legacy plural "status" from the canonical team row. */
function statusFromTeamRow(row: Pick<TeamRowLike, "is_active" | "effective_to">): "active" | "paused" | "ended" {
  if (row.is_active) return "active";
  return row.effective_to ? "ended" : "paused";
}

/** Legacy plural "split_type" from the canonical split_method (canonical value rides along). */
function splitTypeFromMethod(method: string): "percentage" | "mileage" {
  return method === "mileage_prorated" ? "mileage" : "percentage";
}

function teamRowToConfig(row: TeamRowLike) {
  const { primaryPct, secondaryPct } = effectiveTeamPercentsFromRow(row);
  return {
    id: String(row.id),
    operating_company_id: String(row.operating_company_id),
    primary_driver_id: String(row.primary_driver_id),
    secondary_driver_id: String(row.secondary_driver_id),
    primary_driver_name: row.primary_driver_name ?? undefined,
    secondary_driver_name: row.secondary_driver_name ?? undefined,
    split_type: splitTypeFromMethod(String(row.split_method)),
    primary_ratio: primaryPct / 100,
    secondary_ratio: secondaryPct / 100,
    effective_from_date: row.effective_from,
    effective_to_date: row.effective_to ?? null,
    status: statusFromTeamRow(row),
    memo: row.notes ?? null,
    // Additive canonical passthrough (System A truth; safe extra fields on the wire).
    team_name: row.team_name,
    split_method: String(row.split_method),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  };
}

/** Canonical split_method for a plural create request (ratios drive money in both systems). */
function splitMethodFromRequest(splitType: string, primaryRatio: number, secondaryRatio: number): TeamSplitMethod {
  if (splitType === "mileage") return "mileage_prorated";
  const p = Math.round(primaryRatio * 10000) / 100;
  const c = Math.round(secondaryRatio * 10000) / 100;
  if (p === 50 && c === 50) return "50_50";
  if (p === 60 && c === 40) return "60_40";
  if (p === 70 && c === 30) return "70_30";
  return "custom";
}

// CLS-BARE-ERROR-CODE-REPLIES — every branch of this mapper answered with a bare machine code, and
// because it is the SHARED mapper for all team-split routes, that one gap was the message for every
// one of them. The FE toasts `data.message ?? data.error`, so a dispatcher setting up a team saw the
// literal string "E_SPLIT_PERCENTAGES_MUST_EQUAL_100".
//
// These are MONEY messages, not cosmetics: a team split decides how one load's driver pay is divided
// between two drivers, so the sentence has to say what the system will and will not do to the pay.
// Each is judged for its own condition — the two percentage errors are NOT the same condition (one is
// a sum that misses 100, the other is a value outside 0-100) and a single swept sentence would have
// described the wrong one. The 409s state what to do INSTEAD, because a conflict is recoverable and a
// user told only "conflict" cannot act.
const TEAM_SPLIT_ERROR_MESSAGES: Record<string, string> = {
  E_TEAM_NOT_FOUND:
    "That team configuration was not found. It may have been ended, or it belongs to a different operating company than the one selected.",
  E_DRIVER_ALREADY_IN_ACTIVE_TEAM:
    "That driver is already on another active team. A driver can only be on one active team at a time — end or pause the other team first, then add them here.",
  E_TEAM_HAS_IN_PROGRESS_LOADS:
    "This team still has loads in progress. Changing the team now would change how pay is split on freight that is already moving. Wait until those loads deliver, or reassign them first.",
  E_DRIVER_NOT_IN_COMPANY:
    "That driver is not active in the selected operating company, so they cannot be placed on this team.",
  E_SPLIT_PERCENTAGES_MUST_EQUAL_100:
    "The primary and secondary split percentages must add up to exactly 100, so every dollar of the load's driver pay is assigned to one of the two drivers.",
  E_INVALID_SPLIT_PERCENTAGES:
    "Each split percentage must be a number between 0 and 100.",
  E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE:
    "This split is locked because its settlement has already POSTED to the general ledger. A posted settlement is never edited in place — reverse or adjust the settlement instead, so the ledger keeps a complete history.",
  E_LOAD_NOT_FOUND:
    "That load was not found. It may be soft-deleted, or it belongs to a different operating company than the one selected.",
};

function mapServiceError(reply: FastifyReply, error: unknown) {
  const msg = String((error as Error)?.message ?? "team_split_operation_failed");
  // Codes are matched in a fixed order so behaviour is identical to the original if/else chain; only
  // the SENTENCE is added. The wire `error` value is preserved EXACTLY, including the deliberate
  // E_TEAM_NOT_FOUND -> "config_not_found" rename, because FE code and tests may branch on it.
  const codes: Array<[string, number, string]> = [
    ["E_TEAM_NOT_FOUND", 404, "config_not_found"],
    ["E_DRIVER_ALREADY_IN_ACTIVE_TEAM", 409, "E_DRIVER_ALREADY_IN_ACTIVE_TEAM"],
    ["E_TEAM_HAS_IN_PROGRESS_LOADS", 409, "E_TEAM_HAS_IN_PROGRESS_LOADS"],
    ["E_DRIVER_NOT_IN_COMPANY", 400, "E_DRIVER_NOT_IN_COMPANY"],
    ["E_SPLIT_PERCENTAGES_MUST_EQUAL_100", 400, "E_SPLIT_PERCENTAGES_MUST_EQUAL_100"],
    ["E_INVALID_SPLIT_PERCENTAGES", 400, "E_INVALID_SPLIT_PERCENTAGES"],
    ["E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE", 409, "E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE"],
    ["E_LOAD_NOT_FOUND", 404, "E_LOAD_NOT_FOUND"],
  ];
  for (const [needle, status, wireError] of codes) {
    if (msg.includes(needle)) {
      return reply.code(status).send({ error: wireError, message: TEAM_SPLIT_ERROR_MESSAGES[needle] });
    }
  }
  return reply.code(500).send({ error: "team_split_operation_failed", message: msg });
}

const STATUS_FILTER_SQL: Record<"active" | "paused" | "ended", string> = {
  active: "t.is_active = true",
  paused: "(t.is_active = false AND t.effective_to IS NULL)",
  ended: "(t.is_active = false AND t.effective_to IS NOT NULL)",
};

export async function registerTeamSplitRoutes(app: FastifyInstance) {
  app.get("/api/v1/team-splits/configs", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters: string[] = [];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`(t.primary_driver_id = $${values.length}::uuid OR t.secondary_driver_id = $${values.length}::uuid)`);
      }
      if (query.data.status) {
        filters.push(STATUS_FILTER_SQL[query.data.status as "active" | "paused" | "ended"]);
      }
      const extra = filters.length ? ` AND ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            t.*,
            concat_ws(' ', p.first_name, p.last_name) AS primary_driver_name,
            concat_ws(' ', s.first_name, s.last_name) AS secondary_driver_name
          FROM mdata.driver_teams t
          JOIN mdata.drivers p ON p.id = t.primary_driver_id
          JOIN mdata.drivers s ON s.id = t.secondary_driver_id
          WHERE t.operating_company_id = $1::uuid
          ${extra}
          ORDER BY t.created_at DESC
        `,
        values
      );
      return res.rows as TeamRowLike[];
    });

    return { configs: rows.map((row) => teamRowToConfig(row)) };
  });

  app.post("/api/v1/team-splits/configs", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureOfficeRole((user as { role?: unknown }).role))
      return reply.code(403).send({
        error: "forbidden",
        message: `Team splits decide how a load's driver pay is divided, so only office roles can change them. Your role is ${String((user as { role?: unknown }).role ?? "unknown")}.`,
        your_role: String((user as { role?: unknown }).role ?? "unknown"),
      });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createConfigSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    // Membership assertion + driver-name fetch for the synthesized canonical team_name.
    const names = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id::text, concat_ws(' ', first_name, last_name) AS driver_name
          FROM mdata.drivers
          WHERE id = ANY($1::uuid[])
            AND operating_company_id = $2::uuid
        `,
        [[body.data.primary_driver_id, body.data.secondary_driver_id], query.data.operating_company_id]
      );
      const rows = res.rows as Array<{ id: string; driver_name: string }>;
      // Prefer a plain object over Map so static route scanners do not treat
      // property access as a Fastify route registration.
      const byId: Record<string, string> = Object.fromEntries(rows.map((r) => [r.id, r.driver_name]));
      return {
        primary: byId[body.data.primary_driver_id] ?? null,
        secondary: byId[body.data.secondary_driver_id] ?? null,
      };
    });
    if (!names.primary || !names.secondary)
      return reply.code(400).send({
        error: "E_DRIVER_NOT_IN_COMPANY",
        // Says WHICH driver failed rather than making the user re-check both.
        message: `${!names.primary ? "The primary driver" : "The secondary driver"} is not active in the selected operating company, so this team cannot be created.`,
      });

    const splitMethod = splitMethodFromRequest(body.data.split_type, body.data.primary_ratio, body.data.secondary_ratio);
    try {
      const team = (await createTeam(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        primary_driver_id: body.data.primary_driver_id,
        co_driver_id: body.data.secondary_driver_id,
        team_name: `${names.primary} / ${names.secondary}`.slice(0, 200),
        split_method: splitMethod,
        primary_share_pct: Math.round(body.data.primary_ratio * 10000) / 100,
        co_share_pct: Math.round(body.data.secondary_ratio * 10000) / 100,
        notes: body.data.memo,
        effective_from: body.data.effective_from_date,
      })) as unknown as TeamRowLike;

      // Plural contract allows an effective_to_date at create; canonical createTeam does not.
      // Round-trip it with a scoped follow-up write on the same canonical row.
      let finalTeam = team;
      if (body.data.effective_to_date) {
        finalTeam = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
          const res = await client.query(
            `
              UPDATE mdata.driver_teams
              SET effective_to = $3::date, updated_at = now()
              WHERE id = $1::uuid AND operating_company_id = $2::uuid
              RETURNING *
            `,
            [team.id, query.data.operating_company_id, body.data.effective_to_date]
          );
          return (res.rows[0] as TeamRowLike) ?? team;
        });
      }

      return reply.code(201).send({
        config: teamRowToConfig({
          ...finalTeam,
          primary_driver_name: names.primary,
          secondary_driver_name: names.secondary,
        }),
      });
    } catch (error) {
      return mapServiceError(reply, error);
    }
  });

  app.delete("/api/v1/team-splits/configs/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureOfficeRole((user as { role?: unknown }).role))
      return reply.code(403).send({
        error: "forbidden",
        message: `Team splits decide how a load's driver pay is divided, so only office roles can change them. Your role is ${String((user as { role?: unknown }).role ?? "unknown")}.`,
        your_role: String((user as { role?: unknown }).role ?? "unknown"),
      });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    try {
      await deactivateTeam(user.uuid, {
        operating_company_id: query.data.operating_company_id,
        team_id: params.data.id,
        reason: "team-splits facade: end config (plural DELETE /team-splits/configs/:id)",
      });
      return { ok: true };
    } catch (error) {
      return mapServiceError(reply, error);
    }
  });

  app.post("/api/v1/loads/:id/team-split", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureOfficeRole((user as { role?: unknown }).role))
      return reply.code(403).send({
        error: "forbidden",
        message: `Team splits decide how a load's driver pay is divided, so only office roles can change them. Your role is ${String((user as { role?: unknown }).role ?? "unknown")}.`,
        your_role: String((user as { role?: unknown }).role ?? "unknown"),
      });
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = loadOverrideSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const row = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        // Immutability latch parity with computeTeamLoadSplit: a split already applied to a
        // settlement can never be re-shaped by a late override.
        const postedRes = await client.query(
          `
            SELECT id
            FROM driver_finance.team_settlement_splits
            WHERE load_id = $1::uuid
              AND applied_to_settlement_id IS NOT NULL
            LIMIT 1
          `,
          [params.data.id]
        );
        if (postedRes.rows[0]?.id) throw new Error("E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE");

        const updated = await client.query(
          `
            UPDATE mdata.loads
            SET team_split_override_primary_driver_id = $3::uuid,
                team_split_override_secondary_driver_id = $4::uuid,
                team_split_override_primary_ratio = $5::numeric,
                team_split_override_secondary_ratio = $6::numeric,
                team_split_override_reason = $7,
                team_split_override_set_by_user_id = $8::uuid,
                team_split_override_set_at = now()
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
              AND soft_deleted_at IS NULL
            RETURNING
              id::text AS load_id,
              operating_company_id::text,
              team_split_override_primary_driver_id::text AS primary_driver_id,
              team_split_override_secondary_driver_id::text AS secondary_driver_id,
              team_split_override_primary_ratio AS primary_ratio,
              team_split_override_secondary_ratio AS secondary_ratio,
              team_split_override_reason AS reason,
              team_split_override_set_by_user_id::text AS created_by_user_id,
              team_split_override_set_at AS set_at
          `,
          [
            params.data.id,
            body.data.operating_company_id,
            body.data.primary_driver_id,
            body.data.secondary_driver_id,
            body.data.primary_ratio,
            body.data.secondary_ratio,
            body.data.reason,
            user.uuid,
          ]
        );
        const override = updated.rows[0];
        if (!override) throw new Error("E_LOAD_NOT_FOUND");

        await appendCrudAudit(
          client,
          user.uuid,
          "mdata.load.team_split_override_set",
          {
            resource_type: "mdata.loads",
            resource_id: String(params.data.id),
            operating_company_id: body.data.operating_company_id,
            primary_driver_id: body.data.primary_driver_id,
            secondary_driver_id: body.data.secondary_driver_id,
            primary_ratio: body.data.primary_ratio,
            secondary_ratio: body.data.secondary_ratio,
            reason: body.data.reason,
          },
          "warning",
          "P2B-TEAM-SPLITS-CONVERGE"
        );
        return override;
      });

      return reply.code(201).send({ override: row });
    } catch (error) {
      return mapServiceError(reply, error);
    }
  });
}

export default fp(
  async (app) => {
    await registerTeamSplitRoutes(app);
  },
  { name: "settlements.registerTeamSplitRoutes" }
);
