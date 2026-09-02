/**
 * GAP-65 — Owner Today's Attention Background Worker
 */

import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import {
  ATTENTION_SOURCE_STATS_ITEM_ID,
  computeTodaysAttention,
} from "../owner/todays-attention/aggregator.service.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

const WORKER_NAME = "owner.todays_attention_worker";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let timer: NodeJS.Timeout | undefined;

function intervalMs(): number {
  const raw = Number(process.env.TODAYS_ATTENTION_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

async function tick(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query(
      `SELECT id::text FROM org.companies WHERE is_active = true LIMIT 200`
    );

    for (const row of companies.rows) {
      const ociId = String(row.id ?? "");
      if (!ociId) continue;

      try {
        assertTenantContext(ociId, WORKER_NAME);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [ociId]);

        const result = await computeTodaysAttention(client, ociId, 5, app.log);
        const { items } = result;

        for (const item of items) {
          await client.query(
            `
              INSERT INTO owner.todays_attention_snapshot
                (operating_company_id, item_id, source, score, title, body,
                 action_url, action_label, severity, extra, computed_at)
              VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
              ON CONFLICT (operating_company_id, item_id) DO UPDATE SET
                source = EXCLUDED.source, score = EXCLUDED.score, title = EXCLUDED.title,
                body = EXCLUDED.body, action_url = EXCLUDED.action_url,
                action_label = EXCLUDED.action_label, severity = EXCLUDED.severity,
                extra = EXCLUDED.extra, computed_at = now(), updated_at = now(),
                dismissed = CASE
                  WHEN owner.todays_attention_snapshot.dismissed = true
                       AND owner.todays_attention_snapshot.dismissed_at < (now() - interval '24 hours')
                  THEN false ELSE owner.todays_attention_snapshot.dismissed END
            `,
            [
              ociId, item.item_id, item.source, item.score, item.title, item.body,
              item.action_url, item.action_label, item.severity, JSON.stringify(item.extra),
            ]
          );
        }

        await client.query(
          `
            INSERT INTO owner.todays_attention_snapshot
              (operating_company_id, item_id, source, score, title, body,
               action_url, action_label, severity, extra, computed_at)
            VALUES ($1::uuid, $2, 'meta', 0, 'Source stats', '', '/', 'View', 'info', $3::jsonb, now())
            ON CONFLICT (operating_company_id, item_id) DO UPDATE SET
              extra = EXCLUDED.extra, computed_at = now(), updated_at = now()
          `,
          [
            ociId,
            ATTENTION_SOURCE_STATS_ITEM_ID,
            JSON.stringify({
              sourcesRan: result.sourcesRan,
              sourcesSkipped: result.sourcesSkipped,
              totalSources: result.totalSources,
              skippedSources: result.skippedSources,
            }),
          ]
        );

        const activeIds = [...items.map((i) => i.item_id), ATTENTION_SOURCE_STATS_ITEM_ID];
        await client.query(
          `
            DELETE FROM owner.todays_attention_snapshot
            WHERE operating_company_id = $1::uuid AND item_id != ALL($2::text[])
              AND (dismissed = false OR dismissed_at < (now() - interval '1 hour'))
          `,
          [ociId, activeIds]
        );
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
  timer = setInterval(() => { void run(); }, ms);
  app.log.info({ intervalMs: ms }, `[${WORKER_NAME}] started`);
}

export function stopTodaysAttentionWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
