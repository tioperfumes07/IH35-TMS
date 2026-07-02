import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { initializeCsaBasicPullCron, pullAndPersistCsaBasicsForCompany } from "./csa-basic-pull.js";
import {
  buildProjectionSet,
  CSA_BASIC_CATEGORIES,
  CSA_LABELS,
  getMitigationSuggestion,
  projectBasicTrend,
  rankMitigationQueue,
  type CsaAlertStatus,
  type CsaBasicCategory,
  type CsaMitigationActionRow,
  type CsaSnapshotRow,
} from "./csa-basic-projection.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const ACTION_TYPES = [
  "coaching_campaign",
  "elog_audit",
  "dq_file_audit",
  "drug_program_audit",
  "inspection_blitz",
  "hazmat_file_review",
  "incident_prevention",
  "other",
] as const;
const ACTION_STATUSES = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;

const basicCategorySchema = z.enum(CSA_BASIC_CATEGORIES);
const actionTypeSchema = z.enum(ACTION_TYPES);
const actionStatusSchema = z.enum(ACTION_STATUSES);
const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});
const trendQuerySchema = companyQuerySchema.extend({
  basic: basicCategorySchema,
});
const actionCreateSchema = companyQuerySchema.extend({
  basic_category: basicCategorySchema,
  action_type: actionTypeSchema.optional(),
  title: z.string().trim().min(5).max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.coerce.number().int().min(0).max(10).optional(),
  status: actionStatusSchema.optional(),
});
const actionPatchSchema = companyQuerySchema.extend({
  action_type: actionTypeSchema.optional(),
  title: z.string().trim().min(5).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.coerce.number().int().min(0).max(10).optional(),
  status: actionStatusSchema.optional(),
});
const actionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type RawSnapshotRow = {
  basic_category: string;
  snapshot_date: string;
  score: string | number | null;
  pct_percentile: string | number | null;
  threshold: string | number;
  alert_status: string;
  pulled_at: string;
};

type RawActionRow = {
  id: string;
  basic_category: string;
  action_type: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  due_date: string;
  status: string;
  priority: number | string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompanyScope<T>(userId: string, role: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client as DbClient);
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeSnapshotRow(row: RawSnapshotRow): CsaSnapshotRow {
  return {
    basic_category: basicCategorySchema.parse(row.basic_category),
    snapshot_date: String(row.snapshot_date),
    score: toFiniteNumber(row.score),
    pct_percentile: toFiniteNumber(row.pct_percentile),
    threshold: Number(toFiniteNumber(row.threshold) ?? 0),
    alert_status: (["yes", "no", "inconclusive"].includes(row.alert_status)
      ? row.alert_status
      : "inconclusive") as CsaAlertStatus,
    pulled_at: String(row.pulled_at),
  };
}

function normalizeActionRow(row: RawActionRow): CsaMitigationActionRow {
  return {
    id: String(row.id),
    basic_category: basicCategorySchema.parse(row.basic_category),
    action_type: String(row.action_type),
    title: String(row.title),
    description: row.description ?? null,
    owner_user_id: row.owner_user_id ?? null,
    due_date: String(row.due_date).slice(0, 10),
    status: String(row.status),
    priority: toFiniteNumber(row.priority),
    completed_at: row.completed_at ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function listRecentSnapshots(client: DbClient, companyId: string, perBasicLimit = 6): Promise<CsaSnapshotRow[]> {
  const res = await client.query<RawSnapshotRow>(
    `
      SELECT basic_category::text, snapshot_date::text, score, pct_percentile, threshold, alert_status::text, pulled_at::text
      FROM (
        SELECT
          basic_category,
          snapshot_date,
          score,
          pct_percentile,
          threshold,
          alert_status,
          pulled_at,
          row_number() OVER (PARTITION BY basic_category ORDER BY snapshot_date DESC, pulled_at DESC) AS rn
        FROM compliance.csa_basic_scores
        WHERE operating_company_id = $1::uuid
      ) ranked
      WHERE rn <= $2
      ORDER BY basic_category, snapshot_date DESC, pulled_at DESC
    `,
    [companyId, perBasicLimit]
  );
  return res.rows.map(normalizeSnapshotRow);
}

async function listLatestSnapshots(client: DbClient, companyId: string): Promise<CsaSnapshotRow[]> {
  const res = await client.query<RawSnapshotRow>(
    `
      SELECT DISTINCT ON (basic_category)
        basic_category::text,
        snapshot_date::text,
        score,
        pct_percentile,
        threshold,
        alert_status::text,
        pulled_at::text
      FROM compliance.csa_basic_scores
      WHERE operating_company_id = $1::uuid
      ORDER BY basic_category, snapshot_date DESC, pulled_at DESC
    `,
    [companyId]
  );
  return res.rows.map(normalizeSnapshotRow);
}

async function listTrendSnapshots(client: DbClient, companyId: string, basic: CsaBasicCategory): Promise<CsaSnapshotRow[]> {
  const res = await client.query<RawSnapshotRow>(
    `
      SELECT basic_category::text, snapshot_date::text, score, pct_percentile, threshold, alert_status::text, pulled_at::text
      FROM (
        SELECT basic_category, snapshot_date, score, pct_percentile, threshold, alert_status, pulled_at
        FROM compliance.csa_basic_scores
        WHERE operating_company_id = $1::uuid
          AND basic_category = $2::compliance.csa_basic_category
        ORDER BY snapshot_date DESC, pulled_at DESC
        LIMIT 24
      ) recent
      ORDER BY snapshot_date ASC, pulled_at ASC
    `,
    [companyId, basic]
  );
  return res.rows.map(normalizeSnapshotRow);
}

async function listOpenMitigationActions(client: DbClient, companyId: string): Promise<CsaMitigationActionRow[]> {
  const res = await client.query<RawActionRow>(
    `
      SELECT
        id::text,
        basic_category::text,
        action_type::text,
        title,
        description,
        owner_user_id::text,
        due_date::text,
        status::text,
        priority,
        completed_at::text,
        created_at::text,
        updated_at::text
      FROM compliance.csa_mitigation_actions
      WHERE operating_company_id = $1::uuid
        AND status IN ('open', 'in_progress', 'blocked')
      ORDER BY due_date ASC, created_at ASC
    `,
    [companyId]
  );
  return res.rows.map(normalizeActionRow);
}

async function getCompanyUsdotNumber(client: DbClient, companyId: string) {
  const res = await client.query<{ usdot_number: string | null }>(
    `SELECT usdot_number FROM org.companies WHERE id = $1::uuid LIMIT 1`,
    [companyId]
  );
  return res.rows[0]?.usdot_number?.trim() ?? "";
}

function plusDaysIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function registerCsaRoutes(app: FastifyInstance) {
  initializeCsaBasicPullCron(app);

  app.get("/api/v1/compliance/csa/current", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, user.role, companyId, async (client) => {
      const latest = await listLatestSnapshots(client, companyId);
      const recent = await listRecentSnapshots(client, companyId, 6);
      const projections = buildProjectionSet(recent);
      const latestSnapshotDate = latest
        .map((row) => Date.parse(row.snapshot_date))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0];
      const latestPulledAt = latest
        .map((row) => Date.parse(row.pulled_at))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0];
      const pullAgeDays = Number.isFinite(latestPulledAt)
        ? Math.floor((Date.now() - Number(latestPulledAt)) / 86_400_000)
        : null;
      return {
        snapshot_date:
          latestSnapshotDate != null && Number.isFinite(latestSnapshotDate)
            ? new Date(Number(latestSnapshotDate)).toISOString().slice(0, 10)
            : null,
        pulled_at:
          latestPulledAt != null && Number.isFinite(latestPulledAt)
            ? new Date(Number(latestPulledAt)).toISOString()
            : null,
        pull_age_days: pullAgeDays,
        is_stale: pullAgeDays == null ? true : pullAgeDays > 7,
        basics: projections.map((projection) => ({
          ...projection,
          label: CSA_LABELS[projection.basic_category],
        })),
      };
    });

    return reply.send(payload);
  });

  app.get("/api/v1/compliance/csa/trend", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = trendQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const payload = await withCompanyScope(user.uuid, user.role, q.operating_company_id, async (client) => {
      const history = await listTrendSnapshots(client, q.operating_company_id, q.basic);
      const projection = projectBasicTrend(history.slice(-6), q.basic);
      return {
        basic: q.basic,
        label: CSA_LABELS[q.basic],
        history,
        projection,
      };
    });
    return reply.send(payload);
  });

  app.get("/api/v1/compliance/csa/mitigation-queue", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, user.role, companyId, async (client) => {
      const actions = await listOpenMitigationActions(client, companyId);
      const projections = buildProjectionSet(await listRecentSnapshots(client, companyId, 6));
      const queue = rankMitigationQueue(actions, projections);
      return {
        queue,
        generated_at: new Date().toISOString(),
      };
    });

    return reply.send(payload);
  });

  app.post("/api/v1/compliance/csa/mitigation-actions", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = actionCreateSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const created = await withCompanyScope(user.uuid, user.role, b.operating_company_id, async (client) => {
      const suggestion = getMitigationSuggestion(b.basic_category);
      const actionType = b.action_type ?? (suggestion.action_type as (typeof ACTION_TYPES)[number]);
      const title = b.title ?? suggestion.title;
      const description = b.description ?? suggestion.description;
      const dueDate = b.due_date ?? plusDaysIso(14);
      const status = b.status ?? "open";
      const result = await client.query<RawActionRow>(
        `
          INSERT INTO compliance.csa_mitigation_actions (
            operating_company_id,
            basic_category,
            action_type,
            title,
            description,
            owner_user_id,
            due_date,
            status,
            priority,
            source_trigger,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES (
            $1::uuid,
            $2::compliance.csa_basic_category,
            $3::compliance.csa_mitigation_action_type,
            $4,
            $5,
            $6::uuid,
            $7::date,
            $8::compliance.csa_mitigation_status,
            $9,
            'manual',
            $10::uuid,
            $10::uuid
          )
          RETURNING
            id::text,
            basic_category::text,
            action_type::text,
            title,
            description,
            owner_user_id::text,
            due_date::text,
            status::text,
            priority,
            completed_at::text,
            created_at::text,
            updated_at::text
        `,
        [
          b.operating_company_id,
          b.basic_category,
          actionType,
          title,
          description,
          b.owner_user_id ?? null,
          dueDate,
          status,
          b.priority ?? 0,
          user.uuid,
        ]
      );
      const action = normalizeActionRow(result.rows[0]);
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.csa.mitigation_action_created",
        {
          resource_type: "compliance.csa_mitigation_actions",
          resource_id: action.id,
          operating_company_id: b.operating_company_id,
          basic_category: action.basic_category,
          action_type: action.action_type,
        },
        "info",
        "P8-COMP-3-CSA-BASIC"
      );
      return action;
    });

    return reply.code(201).send({ mitigation_action: created });
  });

  app.patch("/api/v1/compliance/csa/mitigation-actions/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = actionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = actionPatchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const updated = await withCompanyScope(user.uuid, user.role, b.operating_company_id, async (client) => {
      const values: unknown[] = [params.data.id, b.operating_company_id];
      const updates: string[] = [];

      if (b.action_type !== undefined) {
        values.push(b.action_type);
        updates.push(`action_type = $${values.length}::compliance.csa_mitigation_action_type`);
      }
      if (b.title !== undefined) {
        values.push(b.title);
        updates.push(`title = $${values.length}`);
      }
      if (b.description !== undefined) {
        values.push(b.description);
        updates.push(`description = $${values.length}`);
      }
      if (b.owner_user_id !== undefined) {
        values.push(b.owner_user_id);
        updates.push(`owner_user_id = $${values.length}::uuid`);
      }
      if (b.due_date !== undefined) {
        values.push(b.due_date);
        updates.push(`due_date = $${values.length}::date`);
      }
      if (b.priority !== undefined) {
        values.push(b.priority);
        updates.push(`priority = $${values.length}`);
      }
      if (b.status !== undefined) {
        values.push(b.status);
        updates.push(`status = $${values.length}::compliance.csa_mitigation_status`);
        if (b.status === "completed") {
          updates.push(`completed_at = now()`);
        } else if (b.status === "open" || b.status === "in_progress" || b.status === "blocked") {
          updates.push(`completed_at = NULL`);
        }
      }

      if (updates.length === 0) {
        const existing = await client.query<RawActionRow>(
          `
            SELECT
              id::text,
              basic_category::text,
              action_type::text,
              title,
              description,
              owner_user_id::text,
              due_date::text,
              status::text,
              priority,
              completed_at::text,
              created_at::text,
              updated_at::text
            FROM compliance.csa_mitigation_actions
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, b.operating_company_id]
        );
        return existing.rows[0] ? normalizeActionRow(existing.rows[0]) : null;
      }

      values.push(user.uuid);
      updates.push(`updated_by_user_id = $${values.length}::uuid`);
      const result = await client.query<RawActionRow>(
        `
          UPDATE compliance.csa_mitigation_actions
          SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING
            id::text,
            basic_category::text,
            action_type::text,
            title,
            description,
            owner_user_id::text,
            due_date::text,
            status::text,
            priority,
            completed_at::text,
            created_at::text,
            updated_at::text
        `,
        values
      );
      const row = result.rows[0];
      if (!row) return null;
      const action = normalizeActionRow(row);
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.csa.mitigation_action_updated",
        {
          resource_type: "compliance.csa_mitigation_actions",
          resource_id: action.id,
          operating_company_id: b.operating_company_id,
          updated_fields: updates,
        },
        "info",
        "P8-COMP-3-CSA-BASIC"
      );
      return action;
    });

    if (!updated) return reply.code(404).send({ error: "mitigation_action_not_found" });
    return reply.send({ mitigation_action: updated });
  });

  app.post("/api/v1/compliance/csa/pull-now", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = companyQuerySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = body.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, user.role, companyId, async (client) => {
      const usdotNumber = await getCompanyUsdotNumber(client, companyId);
      if (!usdotNumber) {
        throw new Error("missing_company_usdot_number");
      }
      const pulled = await pullAndPersistCsaBasicsForCompany(client, {
        operatingCompanyId: companyId,
        usdotNumber,
      });
      await appendCrudAudit(
        client,
        user.uuid,
        "compliance.csa.pull_now",
        {
          resource_type: "compliance.csa_basic_scores",
          operating_company_id: companyId,
          snapshot_date: pulled.snapshot_date,
          row_count: pulled.row_count,
          source_url: pulled.source_url,
        },
        "info",
        "P8-COMP-3-CSA-BASIC"
      );
      return pulled;
    }).catch((error: Error) => {
      if (error.message === "missing_company_usdot_number") {
        return null;
      }
      throw error;
    });

    if (!result) {
      return reply.code(409).send({ error: "missing_company_usdot_number" });
    }
    return reply.send(result);
  });
}
