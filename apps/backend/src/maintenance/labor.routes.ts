import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { companyQuerySchema, validationError, withCompanyScope } from "../accounting/shared.js";

const woIdParamsSchema = z.object({ woId: z.string().uuid() });
const entryIdParamsSchema = z.object({ entryId: z.string().uuid() });

const actorKindSchema = z.enum(["vendor", "internal_mechanic", "driver", "admin"]);

const startBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  actor_kind: actorKindSchema,
  actor_vendor_id: z.string().uuid().optional().nullable(),
  actor_user_id: z.string().uuid().optional().nullable(),
  actor_employee_id: z.string().uuid().optional().nullable(),
  wo_task_id: z.string().uuid().optional().nullable(),
  labor_code_id: z.string().uuid().optional().nullable(),
  labor_rate_cents_per_hour: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const manualBodySchema = startBodySchema.extend({
  work_order_id: z.string().uuid(),
  started_at: z.string().trim().min(1),
  ended_at: z.string().trim().min(1),
});

const patchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  labor_code_id: z.string().uuid().optional().nullable(),
  labor_rate_cents_per_hour: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const stopBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

export function assertManualRange(startIso: string, endIso: string): boolean {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
}

async function woTimeEntriesReady(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }) {
  const res = await client.query(`SELECT to_regclass('maintenance.wo_time_entries') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}


const laborMetaPrefix = "ih35-labor-meta:";
export type LaborNotesMeta = { labor_code_id: string | null; text: string | null };
export function laborCodeRateCentsPerHour(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  for (const key of ["rate_cents_per_hour", "default_rate_cents_per_hour"]) {
    const raw = meta[key];
    if (typeof raw === "number" && raw >= 0) return Math.round(raw);
  }
  const dollars = meta.rate_per_hour;
  if (typeof dollars === "number" && dollars >= 0) return Math.round(dollars * 100);
  return null;
}
export function encodeLaborNotes(meta: LaborNotesMeta): string | null {
  if (!meta.labor_code_id && !meta.text?.trim()) return null;
  return `${laborMetaPrefix}${JSON.stringify({ labor_code_id: meta.labor_code_id ?? null, text: meta.text?.trim() || null })}`;
}
export function parseLaborNotes(raw: unknown): LaborNotesMeta {
  if (typeof raw !== "string" || !raw.startsWith(laborMetaPrefix)) {
    return { labor_code_id: null, text: typeof raw === "string" ? raw : null };
  }
  try {
    const parsed = JSON.parse(raw.slice(laborMetaPrefix.length)) as Record<string, unknown>;
    return {
      labor_code_id: typeof parsed.labor_code_id === "string" ? parsed.labor_code_id : null,
      text: typeof parsed.text === "string" ? parsed.text : null,
    };
  } catch {
    return { labor_code_id: null, text: raw };
  }
}
export function computeLaborCostCents(durationMinutes: number | null, rateCentsPerHour: number | null): number | null {
  if (durationMinutes == null || rateCentsPerHour == null || durationMinutes < 0) return null;
  return Math.round((durationMinutes / 60) * rateCentsPerHour);
}
export function computeRunningLaborCostCents(startedAtIso: string, rateCentsPerHour: number | null, nowMs = Date.now()): number | null {
  if (rateCentsPerHour == null) return null;
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) return null;
  return computeLaborCostCents(Math.max(0, (nowMs - startedMs) / 60_000), rateCentsPerHour);
}
export function mapLaborTimeEntryRow(row: Record<string, unknown>, laborCode?: { id: string; code: string; display_name: string } | null) {
  const notesMeta = parseLaborNotes(row.notes);
  const rate = row.labor_rate_cents_per_hour != null ? Number(row.labor_rate_cents_per_hour) : null;
  const stored = row.computed_labor_cost_cents != null ? Number(row.computed_labor_cost_cents) : null;
  const running = !row.ended_at && row.started_at ? computeRunningLaborCostCents(String(row.started_at), rate) : null;
  return { ...row, notes: notesMeta.text, labor_code_id: notesMeta.labor_code_id, labor_code: laborCode ?? null, computed_labor_cost_cents: stored ?? running, is_running: !row.ended_at };
}
async function laborCodesReady(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }) {
  const res = await client.query(`SELECT to_regclass('catalogs.maintenance_labor_codes') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

export async function registerMaintenanceLaborRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/labor-codes", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await laborCodesReady(client))) return { kind: "unavailable" as const };
      const rows = await client.query(
        `SELECT id, code, display_name, description, metadata, is_active, sort_order FROM catalogs.maintenance_labor_codes WHERE operating_company_id = $1::uuid AND is_active = true ORDER BY sort_order ASC LIMIT 200`,
        [query.data.operating_company_id]
      );
      return { kind: "ok" as const, rows: rows.rows.map((row: Record<string, unknown>) => ({ ...row, rate_cents_per_hour: laborCodeRateCentsPerHour(row.metadata) })) };
    });
    if (payload.kind === "unavailable") return reply.code(501).send({ error: "maintenance_labor_codes_not_available" });
    return { labor_codes: payload.rows };
  });

  app.post("/api/v1/work-orders/:woId/time-entries/start", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = woIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = startBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await woTimeEntriesReady(client))) return { kind: "unavailable" as const };

      const wo = await client.query(
        `SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.woId, body.data.operating_company_id]
      );
      if (!wo.rows[0]) return { kind: "missing_wo" as const };

      const insert = await client.query(
        `
          INSERT INTO maintenance.wo_time_entries (
            operating_company_id,
            work_order_id,
            wo_task_id,
            actor_kind,
            actor_vendor_id,
            actor_user_id,
            actor_employee_id,
            started_at,
            ended_at,
            labor_rate_cents_per_hour,
            notes,
            updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,now(),NULL,$8,$9,now()
          )
          RETURNING *
        `,
        [
          body.data.operating_company_id,
          params.data.woId,
          body.data.wo_task_id ?? null,
          body.data.actor_kind,
          body.data.actor_vendor_id ?? null,
          body.data.actor_user_id ?? null,
          body.data.actor_employee_id ?? null,
          body.data.labor_rate_cents_per_hour ?? null,
          body.data.notes ?? null,
        ]
      );

      return { kind: "ok" as const, entry: insert.rows[0] };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "wo_time_entries_schema_not_available" });
    if (payload.kind === "missing_wo") return reply.code(404).send({ error: "work_order_not_found" });
    return { time_entry: payload.entry };
  });

  app.get("/api/v1/work-orders/:woId/time-entries", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = woIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await woTimeEntriesReady(client))) return { kind: "unavailable" as const };

      const wo = await client.query(
        `SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.woId, query.data.operating_company_id]
      );
      if (!wo.rows[0]) return { kind: "missing_wo" as const };

      const rows = await client.query(
        `
          SELECT *
          FROM maintenance.wo_time_entries
          WHERE work_order_id = $1
            AND operating_company_id = $2
            AND deleted_at IS NULL
          ORDER BY started_at DESC
        `,
        [params.data.woId, query.data.operating_company_id]
      );

      return { kind: "ok" as const, entries: rows.rows };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "wo_time_entries_schema_not_available" });
    if (payload.kind === "missing_wo") return reply.code(404).send({ error: "work_order_not_found" });
    return { time_entries: payload.entries };
  });

  app.post("/api/v1/time-entries/:entryId/stop", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = entryIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = stopBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await woTimeEntriesReady(client))) return { kind: "unavailable" as const };

      const update = await client.query(
        `
          UPDATE maintenance.wo_time_entries
          SET ended_at = now(),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND deleted_at IS NULL
            AND ended_at IS NULL
          RETURNING *
        `,
        [params.data.entryId, body.data.operating_company_id]
      );

      const row = update.rows[0];
      if (!row) return { kind: "missing_or_closed" as const };
      return { kind: "ok" as const, entry: row };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "wo_time_entries_schema_not_available" });
    if (payload.kind === "missing_or_closed") return reply.code(404).send({ error: "time_entry_not_found_or_closed" });
    return { time_entry: payload.entry };
  });

  app.post("/api/v1/time-entries", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const body = manualBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!assertManualRange(body.data.started_at, body.data.ended_at)) {
      return reply.code(400).send({ error: "invalid_time_range" });
    }

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await woTimeEntriesReady(client))) return { kind: "unavailable" as const };

      const wo = await client.query(
        `SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [body.data.work_order_id, body.data.operating_company_id]
      );
      if (!wo.rows[0]) return { kind: "missing_wo" as const };

      const insert = await client.query(
        `
          INSERT INTO maintenance.wo_time_entries (
            operating_company_id,
            work_order_id,
            wo_task_id,
            actor_kind,
            actor_vendor_id,
            actor_user_id,
            actor_employee_id,
            started_at,
            ended_at,
            labor_rate_cents_per_hour,
            notes,
            updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,now()
          )
          RETURNING *
        `,
        [
          body.data.operating_company_id,
          body.data.work_order_id,
          body.data.wo_task_id ?? null,
          body.data.actor_kind,
          body.data.actor_vendor_id ?? null,
          body.data.actor_user_id ?? null,
          body.data.actor_employee_id ?? null,
          body.data.started_at,
          body.data.ended_at,
          body.data.labor_rate_cents_per_hour ?? null,
          body.data.notes ?? null,
        ]
      );

      return { kind: "ok" as const, entry: insert.rows[0] };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "wo_time_entries_schema_not_available" });
    if (payload.kind === "missing_wo") return reply.code(404).send({ error: "work_order_not_found" });
    return { time_entry: payload.entry };
  });

  app.patch("/api/v1/time-entries/:entryId", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(String(user.role ?? ""))) return reply.code(403).send({ error: "owner_admin_only" });

    const params = entryIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await woTimeEntriesReady(client))) return { kind: "unavailable" as const };

      const update = await client.query(
        `
          UPDATE maintenance.wo_time_entries
          SET labor_rate_cents_per_hour = COALESCE($3, labor_rate_cents_per_hour),
              notes = COALESCE($4, notes),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND deleted_at IS NULL
          RETURNING *
        `,
        [params.data.entryId, body.data.operating_company_id, body.data.labor_rate_cents_per_hour ?? null, body.data.notes ?? null]
      );

      const row = update.rows[0];
      if (!row) return { kind: "missing" as const };
      return { kind: "ok" as const, entry: row };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "wo_time_entries_schema_not_available" });
    if (payload.kind === "missing") return reply.code(404).send({ error: "time_entry_not_found" });
    return { time_entry: payload.entry };
  });

  app.delete("/api/v1/time-entries/:entryId", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = entryIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await woTimeEntriesReady(client))) return { kind: "unavailable" as const };

      const update = await client.query(
        `
          UPDATE maintenance.wo_time_entries
          SET deleted_at = now(),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND deleted_at IS NULL
          RETURNING *
        `,
        [params.data.entryId, query.data.operating_company_id]
      );

      const row = update.rows[0];
      if (!row) return { kind: "missing" as const };
      return { kind: "ok" as const, entry: row };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "wo_time_entries_schema_not_available" });
    if (payload.kind === "missing") return reply.code(404).send({ error: "time_entry_not_found" });
    return { ok: true, time_entry: payload.entry };
  });
}
