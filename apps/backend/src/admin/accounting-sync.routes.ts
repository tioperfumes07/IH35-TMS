import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withLuciaBypass, withCurrentUser } from "../auth/db.js";
import { dismissOutboundSyncQueueItem, retrySyncQueueItem } from "../integrations/qbo/qbo-sync.service.js";
import { buildIdempotencyKey, enqueueAdminJob } from "./admin-jobs.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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

function ownerGate(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  const user = gate(req, reply);
  if (!user) return null;
  if (user.role !== "Owner") {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

// CLS-GUC-BASELINE (MDATA-F09 class) — every route below takes operating_company_id from the
// caller (query/body) and hands it straight to set_config('app.operating_company_id', ...).
// gate()/ownerGate() only check ROLE (Owner/Administrator), not membership in the named company —
// an Administrator of Company A could read or dead-letter Company B's QBO sync queue by naming
// Company B's id. Each route below asserts membership BEFORE the caller-supplied id is used for
// anything (house pattern: accounting/recon/recon.routes.ts).

export async function registerAdminAccountingSyncRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/sync/outbound", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
    try { await assertCompanyMembership(user.uuid, q.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }

    const offset = q.data.cursor ?? 0;
    const rows = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      const params: unknown[] = [q.data.operating_company_id];
      let where = `operating_company_id = $1::uuid`;
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

  app.post("/api/v1/admin/sync/outbound/:id/retry", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    try { await assertCompanyMembership(user.uuid, body.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }

    await retrySyncQueueItem(params.data.id, user.uuid, body.data.operating_company_id);
    return { ok: true };
  });

  app.post("/api/v1/admin/sync/outbound/:id/dismiss", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
    try { await assertCompanyMembership(user.uuid, body.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }

    await dismissOutboundSyncQueueItem(params.data.id, user.uuid, body.data.operating_company_id, body.data.note ?? "dismissed");
    return { ok: true };
  });

  app.get("/api/v1/admin/sync/inbound", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
    try { await assertCompanyMembership(user.uuid, q.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }

    const rows = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      const params: unknown[] = [q.data.operating_company_id];
      let where = `operating_company_id = $1::uuid`;
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

  app.post("/api/v1/admin/sync/inbound/replay-since", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ownerGate(req, reply);
    if (!user) return;

    const body = z
      .object({
        since_iso: z.string().min(1),
        realm: z.string().trim().min(1),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const ocRow = await withLuciaBypass(async (client) => {
      const res = await client.query<{ operating_company_id: string }>(
        `
          SELECT operating_company_id::text
          FROM integrations.qbo_connections
          WHERE realm_id = $1 AND revoked_at IS NULL
          ORDER BY last_used_at DESC NULLS LAST
          LIMIT 1
        `,
        [body.data.realm]
      );
      return res.rows[0] ?? null;
    });

    if (!ocRow) return reply.code(404).send({ error: "realm_not_connected" });

    const jobId = await enqueueAdminJob({
      operation: "qbo.inbound.replay_since",
      operatingCompanyId: ocRow.operating_company_id,
      requestedByUserId: user.uuid,
      idempotencyKey: buildIdempotencyKey({
        operation: "qbo.inbound.replay_since",
        operatingCompanyId: ocRow.operating_company_id,
        realmId: body.data.realm,
        sinceIso: body.data.since_iso,
      }),
      payload: {
        realm_id: body.data.realm,
        since_iso: body.data.since_iso,
      },
    });

    await appendAudit(user.uuid, ocRow.operating_company_id, "integrations.qbo_inbound_replay_requested", {
      since_iso: body.data.since_iso,
      realm: body.data.realm,
      job_id: jobId,
    });

    return reply.code(202).send({ accepted: true, job_id: jobId });
  });

  app.post("/api/v1/admin/sync/reset-realm", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = gate(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        confirm: z.literal(true),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try { await assertCompanyMembership(user.uuid, body.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [body.data.operating_company_id]);
      await client.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = 'dead_letter',
              error_message = COALESCE(error_message, '') || ' reset-realm dead-letter',
              updated_at = now()
          WHERE operating_company_id = $1::uuid
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      eventClass,
      "info",
      JSON.stringify(payload),
      actorId,
      "P7-W2-SYNC-ADMIN",
    ]);
  });
}
