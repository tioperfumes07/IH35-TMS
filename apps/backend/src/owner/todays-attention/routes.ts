/**
 * GAP-65 — Owner Today's Attention Routes
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCompanyScope } from "../../accounting/shared.js";
import {
  ATTENTION_SOURCE_COUNT,
  ATTENTION_SOURCE_STATS_ITEM_ID,
  computeTodaysAttention,
} from "./aggregator.service.js";

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

function parseSourceStats(extra: unknown): {
  sourcesRan: number;
  sourcesSkipped: number;
  totalSources: number;
} | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const o = extra as Record<string, unknown>;
  const sourcesRan = Number(o.sourcesRan);
  const sourcesSkipped = Number(o.sourcesSkipped);
  const totalSources = Number(o.totalSources);
  if (!Number.isFinite(sourcesRan) || !Number.isFinite(sourcesSkipped) || !Number.isFinite(totalSources)) {
    return null;
  }
  return { sourcesRan, sourcesSkipped, totalSources };
}

export async function registerOwnerTodaysAttentionRoutes(app: FastifyInstance) {
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
        const tableOk = await client.query(
          `SELECT to_regclass('owner.todays_attention_snapshot') IS NOT NULL AS ok`
        );

        if (!tableOk.rows[0]?.ok) {
          const live = await computeTodaysAttention(client, operating_company_id, 5, app.log);
          return {
            items: live.items,
            computed_at: null,
            source: "live",
            sourcesRan: live.sourcesRan,
            sourcesSkipped: live.sourcesSkipped,
            totalSources: live.totalSources,
          };
        }

        const res = await client.query(
          `
            SELECT id::text, item_id, source, score, title, body, action_url, action_label,
                   severity, extra, dismissed, computed_at::text
            FROM owner.todays_attention_snapshot
            WHERE operating_company_id = $1::uuid
              AND dismissed = false
              AND item_id NOT LIKE '__attention_%'
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

        const statsRow = await client.query(
          `
            SELECT extra, computed_at::text
            FROM owner.todays_attention_snapshot
            WHERE operating_company_id = $1::uuid AND item_id = $2
            LIMIT 1
          `,
          [operating_company_id, ATTENTION_SOURCE_STATS_ITEM_ID]
        );

        let sourcesRan = ATTENTION_SOURCE_COUNT;
        let sourcesSkipped = 0;
        let totalSources = ATTENTION_SOURCE_COUNT;
        let computed_at = items[0]?.computed_at ?? null;

        const statsFromMeta = parseSourceStats(statsRow.rows[0]?.extra);
        if (statsFromMeta) {
          sourcesRan = statsFromMeta.sourcesRan;
          sourcesSkipped = statsFromMeta.sourcesSkipped;
          totalSources = statsFromMeta.totalSources;
          computed_at =
            typeof statsRow.rows[0]?.computed_at === "string" ? statsRow.rows[0].computed_at : computed_at;
        } else if (items.length === 0) {
          const live = await computeTodaysAttention(client, operating_company_id, 5, app.log);
          sourcesRan = live.sourcesRan;
          sourcesSkipped = live.sourcesSkipped;
          totalSources = live.totalSources;
        }

        return { items, computed_at, source: "snapshot", sourcesRan, sourcesSkipped, totalSources };
      } catch (err) {
        app.log.warn({ err }, "[owner-attention] GET failed — returning empty");
        return {
          items: [],
          computed_at: null,
          source: "error",
          sourcesRan: 0,
          sourcesSkipped: ATTENTION_SOURCE_COUNT,
          totalSources: ATTENTION_SOURCE_COUNT,
        };
      }
    });
  });

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

    if (item_id.startsWith("__attention_")) {
      return reply.code(400).send({ error: "validation_error", message: "Cannot dismiss internal meta rows" });
    }

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const tableOk = await client.query(
        `SELECT to_regclass('owner.todays_attention_snapshot') IS NOT NULL AS ok`
      );
      if (!tableOk.rows[0]?.ok) {
        return reply.code(404).send({ error: "not_found", message: "Attention snapshot not available" });
      }

      const updated = await client.query(
        `
          UPDATE owner.todays_attention_snapshot
          SET dismissed = true, dismissed_by = $3::uuid, dismissed_at = now(), updated_at = now()
          WHERE operating_company_id = $1::uuid AND item_id = $2 AND dismissed = false
          RETURNING id::text AS id, item_id
        `,
        [operating_company_id, item_id, user.uuid]
      );

      if (updated.rows.length === 0) {
        return reply.code(404).send({ error: "not_found", message: "Item not found or already dismissed" });
      }

      try {
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
        // non-fatal
      }

      return { ok: true, item_id, dismissed: true };
    });
  });
}
