import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withLuciaBypass, withCurrentUser } from "../auth/db.js";
import {
  dismissOutboundSyncQueueItem,
  getSyncQueueStats,
  retrySyncQueueItem,
} from "../integrations/qbo/qbo-sync.service.js";

const ownerAdmin = new Set(["Owner", "Administrator"]);

function gate(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { role?: string; uuid?: string } | undefined;
  if (!user?.role || !ownerAdmin.has(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { role: string; uuid: string };
}

export async function registerAdminAccountingSyncRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/sync/outbound", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const q = z
      .object({
        operating_company_id: z.string().uuid(),
        status: z.string().optional(),
        entity_type: z.string().optional(),
        cursor: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional().default(50),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

    const offset = q.data.cursor ?? 0;
    const rows = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const params: unknown[] = [q.data.operating_company_id];
      let where = `operating_company_id = $1`;
      if (q.data.status) {
        params.push(q.data.status);
        where += ` AND sync_status = $${params.length}`;
      }
      if (q.data.entity_type) {
        params.push(q.data.entity_type);
        where += ` AND entity_type = $${params.length}`;
      }
      params.push(q.data.limit);
      params.push(offset);
      const limIdx = params.length - 1;
      const offIdx = params.length;
      const res = await client.query(
        `
          SELECT *
          FROM integrations.qbo_sync_queue
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${limIdx} OFFSET $${offIdx}
        `,
        params
      );
      return res.rows;
    });

    return { items: rows, next_cursor: offset + rows.length };
  });

  app.post("/api/v1/admin/sync/outbound/:id/retry", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    await retrySyncQueueItem(params.data.id, user.uuid, body.data.operating_company_id);
    return { ok: true };
  });

  app.post("/api/v1/admin/sync/outbound/:id/dismiss", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        note: z.string().trim().max(2000).optional(),
      })
      .safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    await dismissOutboundSyncQueueItem(params.data.id, user.uuid, body.data.operating_company_id, body.data.note ?? "dismissed");
    return { ok: true };
  });

  app.get("/api/v1/admin/sync/inbound", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const q = z
      .object({
        operating_company_id: z.string().uuid(),
        status: z.string().optional(),
        realm: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional().default(50),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

    const rows = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const params: unknown[] = [q.data.operating_company_id];
      let where = `operating_company_id = $1`;
      if (q.data.status) {
        params.push(q.data.status);
        where += ` AND status = $${params.length}`;
      }
      if (q.data.realm) {
        params.push(q.data.realm);
        where += ` AND qbo_realm_id = $${params.length}`;
      }
      params.push(q.data.limit);
      const limIdx = params.length;
      const res = await client.query(
        `
          SELECT *
          FROM integrations.qbo_inbound_events
          WHERE ${where}
          ORDER BY received_at DESC
          LIMIT $${limIdx}
        `,
        params
      );
      return res.rows;
    });

    return { items: rows };
  });

  app.post("/api/v1/admin/sync/inbound/replay-since", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        since_iso: z.string(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    await appendAudit(user.uuid, body.data.operating_company_id, "integrations.qbo_inbound_replay_requested", {
      since_iso: body.data.since_iso,
    });
    return { ok: true, note: "replay_stub_audit_only" };
  });

  app.get("/api/v1/admin/sync/health", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

    const stats = await getSyncQueueStats(q.data.operating_company_id);

    const detail = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const conn = await client.query(
        `
          SELECT realm_id, access_token_expires_at, revoked_at, last_used_at
          FROM integrations.qbo_connections
          WHERE operating_company_id = $1 AND revoked_at IS NULL
          ORDER BY last_used_at DESC NULLS LAST
          LIMIT 5
        `,
        [q.data.operating_company_id]
      );
      const lastInbound = await client.query<{ max: string | null }>(
        `SELECT MAX(received_at)::text AS max FROM integrations.qbo_inbound_events WHERE operating_company_id = $1`,
        [q.data.operating_company_id]
      );
      const lastApplied = await client.query<{ max: string | null }>(
        `SELECT MAX(applied_at)::text AS max FROM integrations.qbo_inbound_events WHERE operating_company_id = $1 AND status = 'applied'`,
        [q.data.operating_company_id]
      );
      const conflicts = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM integrations.qbo_sync_conflicts WHERE operating_company_id = $1 AND resolved_at IS NULL`,
        [q.data.operating_company_id]
      );
      return {
        connections: conn.rows,
        last_webhook_received_at: lastInbound.rows[0]?.max ?? null,
        last_inbound_applied_at: lastApplied.rows[0]?.max ?? null,
        unresolved_conflicts: Number(conflicts.rows[0]?.c ?? 0),
      };
    });

    return {
      outbound_queue: stats,
      ...detail,
    };
  });

  app.post("/api/v1/admin/sync/reset-realm", async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        confirm: z.literal(true),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      await client.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = 'dead_letter',
              error_message = COALESCE(error_message, '') || ' reset-realm dead-letter',
              updated_at = now()
          WHERE operating_company_id = $1
            AND sync_status IN ('pending','failed','in_flight')
        `,
        [body.data.operating_company_id]
      );
    });

    await appendAudit(user.uuid, body.data.operating_company_id, "integrations.qbo_sync.reset_realm_requested", {});
    return { ok: true };
  });
}

async function appendAudit(actorId: string, operatingCompanyId: string, eventClass: string, payload: Record<string, unknown>) {
  await withCurrentUser(actorId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      eventClass,
      "info",
      JSON.stringify(payload),
      actorId,
      "P7-W2-SYNC-ADMIN",
    ]);
  });
}
