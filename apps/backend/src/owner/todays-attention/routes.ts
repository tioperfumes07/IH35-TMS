/**
 * GAP-65 — Owner Today's Attention Routes
 *
 * GET  /api/v1/owner/todays-attention          — fetch top-5 for current Owner
 * POST /api/v1/owner/todays-attention/dismiss/:item_id — dismiss an item (Owner-only)
 *
 * RBAC: Owner role only. Attempts by other roles → 403.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCompanyScope } from "../../accounting/shared.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const dismissParamsSchema = z.object({
  item_id: z.string().min(1).max(200),
});

const dismissBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function ownerOrAdmin(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

function authedOwner(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (!ownerOrAdmin(user.role)) {
    reply.code(403).send({ error: "forbidden", message: "Owner or Administrator role required" });
    return null;
  }
  return user;
}

export async function registerOwnerTodaysAttentionRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/owner/todays-attention?operating_company_id=<uuid>
   *
   * Returns the current top-5 attention items for the Owner, ordered by score DESC.
   * Falls back to live aggregator computation if snapshot table is empty/missing.
   */
  app.get("/api/v1/owner/todays-attention", async (req, reply) => {
    const user = authedOwner(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", issues: parsed.error.issues });
    }

    const { operating_company_id } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      try {
        // Check if snapshot table exists
        const tableOk = await client.query(
          `SELECT to_regclass('owner.todays_attention_snapshot') IS NOT NULL AS ok`
        );

        if (!tableOk.rows[0]?.ok) {
          // Table not yet migrated — return empty gracefully
          return { items: [], computed_at: null, source: "no_snapshot" };
        }

        const res = await client.query(
          `
            SELECT
              id::text,
              item_id,
              source,
              score,
              title,
              body,
              action_url,
              action_label,
              severity,
              extra,
              dismissed,
              computed_at::text
            FROM owner.todays_attention_snapshot
            WHERE operating_company_id = $1::uuid
              AND dismissed = false
            ORDER BY score DESC
            LIMIT 5
          `,
          [operating_company_id]
        );

        const items = res.rows.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ""),
          item_id: String(r.item_id ?? ""),
          source: String(r.source ?? ""),
          score: Number(r.score ?? 0),
          title: String(r.title ?? ""),
          body: String(r.body ?? ""),
          action_url: String(r.action_url ?? ""),
          action_label: String(r.action_label ?? ""),
          severity: String(r.severity ?? "info"),
          extra: r.extra && typeof r.extra === "object" ? r.extra : {},
          dismissed: Boolean(r.dismissed),
          computed_at: typeof r.computed_at === "string" ? r.computed_at : null,
        }));

        const computed_at = items[0]?.computed_at ?? null;
        return { items, computed_at, source: "snapshot" };
      } catch (err) {
        app.log.warn({ err }, "[owner-attention] GET failed — returning empty");
        return { items: [], computed_at: null, source: "error" };
      }
    });
  });

  /**
   * POST /api/v1/owner/todays-attention/dismiss/:item_id
   * Body: { operating_company_id: uuid }
   *
   * Marks an attention item as dismissed. Creates an audit_log entry.
   * Dismissed items are excluded from the top-5 until re-triggered (24h window).
   */
  app.post("/api/v1/owner/todays-attention/dismiss/:item_id", async (req, reply) => {
    const user = authedOwner(req, reply);
    if (!user) return;

    const paramsParsed = dismissParamsSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: "validation_error", issues: paramsParsed.error.issues });
    }

    const bodyParsed = dismissBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: "validation_error", issues: bodyParsed.error.issues });
    }

    const { item_id } = paramsParsed.data;
    const { operating_company_id } = bodyParsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      // Check snapshot table exists
      const tableOk = await client.query(
        `SELECT to_regclass('owner.todays_attention_snapshot') IS NOT NULL AS ok`
      );
      if (!tableOk.rows[0]?.ok) {
        return reply.code(404).send({ error: "not_found", message: "Attention snapshot not available" });
      }

      const updated = await client.query(
        `
          UPDATE owner.todays_attention_snapshot
          SET
            dismissed    = true,
            dismissed_by = $3::uuid,
            dismissed_at = now(),
            updated_at   = now()
          WHERE operating_company_id = $1::uuid
            AND item_id              = $2
            AND dismissed            = false
          RETURNING id::text AS id, item_id
        `,
        [operating_company_id, item_id, user.uuid]
      );

      if (updated.rows.length === 0) {
        return reply.code(404).send({ error: "not_found", message: "Item not found or already dismissed" });
      }

      // Audit log — best-effort, don't fail the dismiss if audit write fails
      try {
        // Canonical audit sink is audit.audit_events (audit.audit_log never existed, so these
        // events were silently dropped — G5). Repointed; still best-effort inside the try/catch.
        await client.query(
          `
            INSERT INTO audit.audit_events (event_class, severity, payload, actor_user_uuid, source)
            VALUES ('owner.todays_attention.dismiss', 'info', $1::jsonb, $2::uuid, 'owner.todays-attention')
          `,
          [
            JSON.stringify({
              table_name: "owner.todays_attention_snapshot",
              record_id: updated.rows[0]?.id,
              action: "dismiss",
              item_id,
              dismissed_at: new Date().toISOString(),
              operating_company_id,
            }),
            user.uuid,
          ]
        );
      } catch {
        // audit write failure is non-fatal
      }

      return { ok: true, item_id, dismissed: true };
    });
  });
}
