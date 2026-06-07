/**
 * GAP-65 — Owner Today's Attention Background Worker
 *
 * Runs every 15 minutes. For every active operating_company, it:
 *   1. Computes top-5 attention items via the aggregator service
 *   2. Upserts results into owner.todays_attention_snapshot
 *   3. Cleans up dismissed items older than 24 hours
 *
 * Uses lucia bypass so RLS does not block cross-company iteration.
 */

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { computeTodaysAttention } from "../owner/todays-attention/aggregator.service.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

const WORKER_NAME = "owner.todays_attention_worker";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.TODAYS_ATTENTION_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    // Get all active operating companies
    const companies = await client.query(
      `SELECT id::text FROM org.companies WHERE is_active = true LIMIT 200`
    );

    for (const row of companies.rows) {
      const ociId = String(row.id ?? "");
      if (!ociId) continue;

      try {
        assertTenantContext(ociId, WORKER_NAME);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [ociId]);

        const items = await computeTodaysAttention(client, ociId);

        for (const item of items) {
          await client.query(
            `
              INSERT INTO owner.todays_attention_snapshot
                (operating_company_id, item_id, source, score, title, body,
                 action_url, action_label, severity, extra, computed_at)
              VALUES
                ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
              ON CONFLICT (operating_company_id, item_id) DO UPDATE SET
                source       = EXCLUDED.source,
                score        = EXCLUDED.score,
                title        = EXCLUDED.title,
                body         = EXCLUDED.body,
                action_url   = EXCLUDED.action_url,
                action_label = EXCLUDED.action_label,
                severity     = EXCLUDED.severity,
                extra        = EXCLUDED.extra,
                computed_at  = now(),
                updated_at   = now(),
                dismissed    = CASE
                  WHEN owner.todays_attention_snapshot.dismissed = true
                       AND owner.todays_attention_snapshot.dismissed_at < (now() - interval '24 hours')
                  THEN false
                  ELSE owner.todays_attention_snapshot.dismissed
                END
            `,
            [
              ociId,
              item.item_id,
              item.source,
              item.score,
              item.title,
              item.body,
              item.action_url,
              item.action_label,
              item.severity,
              JSON.stringify(item.extra),
            ]
          );
        }

        // Hard-delete stale items no longer in the top-5 and not dismissed within 1 hour
        if (items.length > 0) {
          const activeIds = items.map((i) => i.item_id);
          await client.query(
            `
              DELETE FROM owner.todays_attention_snapshot
              WHERE operating_company_id = $1::uuid
                AND item_id != ALL($2::text[])
                AND (dismissed = false OR dismissed_at < (now() - interval '1 hour'))
            `,
            [ociId, activeIds]
          );
        }
      } catch (err) {
        app.log.warn({ err, ociId }, `[${WORKER_NAME}] company tick failed — skipping`);
      }
    }
  });
}

export function initializeTodaysAttentionWorker(app: FastifyInstance) {
  const ms = intervalMs();

  const run = async () => {
    try {
      await tick(app);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
  };

  void run();
  timer = setInterval(() => {
    void run();
  }, ms);

  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
}

export function stopTodaysAttentionWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
