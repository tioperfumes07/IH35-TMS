import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  since: z.string().datetime().optional(),
  kind: z.enum(["run", "alert", "outbox"]).optional(),
  severity: z.enum(["info", "warn", "error"]).optional(),
  state: z.enum(["dead_letter"]).optional(),
});

type DecodedCursor = {
  occurred_at: string;
  cursor_id: string;
};

function decodeCursor(raw: string | undefined): DecodedCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<DecodedCursor>;
    if (!parsed.occurred_at || !parsed.cursor_id) return null;
    if (Number.isNaN(Date.parse(parsed.occurred_at))) return null;
    return { occurred_at: parsed.occurred_at, cursor_id: parsed.cursor_id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { occurred_at: string | Date; cursor_id: string }) {
  const payload = JSON.stringify({
    occurred_at: new Date(row.occurred_at).toISOString(),
    cursor_id: row.cursor_id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

type BuildParams = {
  operatingCompanyId: string;
  since?: string;
  kind?: "run" | "alert" | "outbox";
  severity?: "info" | "warn" | "error";
  state?: "dead_letter";
};

function buildMergedSql(params: BuildParams): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  const companyUuid = bind(params.operatingCompanyId);
  const companyText = bind(params.operatingCompanyId);

  const includeRuns = !params.kind || params.kind === "run";
  const includeAlerts = !params.kind || params.kind === "alert";
  const includeOutbox = !params.kind || params.kind === "outbox";

  const blocks: string[] = [];

  if (includeRuns) {
    const runSeverityExpr = `CASE
      WHEN lower(coalesce(r.status, '')) IN ('failed', 'dead_letter') THEN 'error'
      WHEN lower(coalesce(r.status, '')) = 'success' THEN 'info'
      ELSE 'warn'
    END`;
    const runWhere = [`r.operating_company_id = ${companyUuid}::uuid`];
    if (params.state === "dead_letter") runWhere.push(`r.status = 'dead_letter'`);
    if (params.since) runWhere.push(`COALESCE(r.completed_at, r.started_at) >= ${bind(params.since)}::timestamptz`);
    if (params.severity) runWhere.push(`${runSeverityExpr} = ${bind(params.severity)}::text`);
    blocks.push(`
      SELECT
        ('run:' || r.id::text) AS id,
        'run'::text AS kind,
        COALESCE(r.completed_at, r.started_at) AS occurred_at,
        ${runSeverityExpr} AS severity,
        concat('sync run ', coalesce(r.kind, 'unknown'), ' ', coalesce(r.status, 'unknown')) AS summary,
        jsonb_build_object(
          'status', r.status,
          'run_kind', r.kind,
          'retry_count', r.retry_count,
          'error_message', r.error_message,
          'payload', r.payload,
          'started_at', r.started_at,
          'completed_at', r.completed_at
        ) AS detail,
        ('run:' || r.id::text) AS cursor_id
      FROM qbo.sync_runs r
      WHERE ${runWhere.join(" AND ")}
    `);
  }

  if (includeAlerts) {
    const alertSeverityExpr = `CASE
      WHEN lower(coalesce(a.severity, '')) IN ('error', 'critical') THEN 'error'
      WHEN lower(coalesce(a.severity, '')) = 'warning' THEN 'warn'
      ELSE 'info'
    END`;
    const alertWhere = [`a.operating_company_id = ${companyUuid}::uuid`];
    if (params.state === "dead_letter") alertWhere.push(`lower(coalesce(a.error_code, '')) = 'dead_letter'`);
    if (params.since) alertWhere.push(`a.created_at >= ${bind(params.since)}::timestamptz`);
    if (params.severity) alertWhere.push(`${alertSeverityExpr} = ${bind(params.severity)}::text`);
    blocks.push(`
      SELECT
        ('alert:' || a.id::text) AS id,
        'alert'::text AS kind,
        a.created_at AS occurred_at,
        ${alertSeverityExpr} AS severity,
        coalesce(a.message, concat('sync alert ', coalesce(a.severity, 'unknown'))) AS summary,
        jsonb_build_object(
          'severity_raw', a.severity,
          'message', a.message,
          'error_code', a.error_code,
          'error_payload', a.error_payload,
          'retry_count', a.retry_count,
          'max_retries', a.max_retries,
          'next_retry_at', a.next_retry_at,
          'resolved_at', a.resolved_at,
          'acknowledged_at', a.acknowledged_at
        ) AS detail,
        ('alert:' || a.id::text) AS cursor_id
      FROM qbo.sync_alerts a
      WHERE ${alertWhere.join(" AND ")}
    `);
  }

  if (includeOutbox) {
    const outboxSeverityExpr = `CASE WHEN o.failed_at IS NOT NULL THEN 'error' ELSE 'info' END`;
    const outboxWhere = [
      `coalesce(o.payload->>'operating_company_id', '') = ${companyText}::text`,
      `o.event_type LIKE 'qbo.%'`,
      `(o.failed_at IS NOT NULL OR o.delivered_at IS NOT NULL)`,
    ];
    if (params.state === "dead_letter") outboxWhere.push(`o.failed_at IS NOT NULL`);
    if (params.since) outboxWhere.push(`COALESCE(o.failed_at, o.delivered_at) >= ${bind(params.since)}::timestamptz`);
    if (params.severity) outboxWhere.push(`${outboxSeverityExpr} = ${bind(params.severity)}::text`);
    blocks.push(`
      SELECT
        ('outbox:' || o.id::text) AS id,
        'outbox'::text AS kind,
        COALESCE(o.failed_at, o.delivered_at) AS occurred_at,
        ${outboxSeverityExpr} AS severity,
        concat('outbox ', o.event_type, ' ', CASE WHEN o.failed_at IS NOT NULL THEN 'failed' ELSE 'delivered' END) AS summary,
        jsonb_build_object(
          'event_type', o.event_type,
          'retry_count', o.retry_count,
          'last_error', o.last_error,
          'payload', o.payload,
          'delivered_at', o.delivered_at,
          'failed_at', o.failed_at
        ) AS detail,
        ('outbox:' || o.id::text) AS cursor_id
      FROM outbox.events o
      WHERE ${outboxWhere.join(" AND ")}
    `);
  }

  if (blocks.length === 0) {
    blocks.push(`
      SELECT
        ''::text AS id,
        'run'::text AS kind,
        now() AS occurred_at,
        'info'::text AS severity,
        ''::text AS summary,
        '{}'::jsonb AS detail,
        ''::text AS cursor_id
      WHERE false
    `);
  }

  return {
    sql: blocks.join("\nUNION ALL\n"),
    values,
  };
}

export async function registerQboSyncEventLogRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo/sync-event-log", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const cursor = decodeCursor(parsed.data.cursor);
    if (parsed.data.cursor && !cursor) {
      return reply.code(400).send({ error: "invalid_cursor" });
    }

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const merged = buildMergedSql({
        operatingCompanyId: parsed.data.operating_company_id,
        since: parsed.data.since,
        kind: parsed.data.kind,
        severity: parsed.data.severity,
        state: parsed.data.state,
      });

      const countRes = (await client.query(
        `
          WITH merged AS (
            ${merged.sql}
          )
          SELECT COUNT(*)::text AS total_estimated
          FROM merged
        `,
        merged.values,
      )) as { rows: Array<{ total_estimated: string }> };

      const pageValues = [...merged.values];
      let cursorPredicate = "";
      if (cursor) {
        pageValues.push(cursor.occurred_at, cursor.cursor_id);
        cursorPredicate = `WHERE (occurred_at, cursor_id) < ($${pageValues.length - 1}::timestamptz, $${pageValues.length}::text)`;
      }
      pageValues.push(parsed.data.limit + 1);

      const rowsRes = (await client.query(
        `
          WITH merged AS (
            ${merged.sql}
          )
          SELECT id, kind, occurred_at::text, severity, summary, detail, cursor_id
          FROM merged
          ${cursorPredicate}
          ORDER BY occurred_at DESC, cursor_id DESC
          LIMIT $${pageValues.length}
        `,
        pageValues,
      )) as {
        rows: Array<{
          id: string;
          kind: "run" | "alert" | "outbox";
          occurred_at: string;
          severity: "info" | "warn" | "error";
          summary: string;
          detail: Record<string, unknown>;
          cursor_id: string;
        }>;
      };

      const hasMore = rowsRes.rows.length > parsed.data.limit;
      const rows = hasMore ? rowsRes.rows.slice(0, parsed.data.limit) : rowsRes.rows;
      const nextCursor = hasMore
        ? encodeCursor({
            occurred_at: rows[rows.length - 1]?.occurred_at,
            cursor_id: rows[rows.length - 1]?.cursor_id,
          })
        : null;

      return {
        events: rows.map((row: (typeof rows)[number]) => ({
          id: row.id,
          kind: row.kind,
          occurred_at: new Date(row.occurred_at).toISOString(),
          severity: row.severity,
          summary: String(row.summary ?? ""),
          detail: row.detail ?? {},
        })),
        next_cursor: nextCursor,
        total_estimated: Number(countRes.rows[0]?.total_estimated ?? 0),
      };
    });

    return payload;
  });
}
