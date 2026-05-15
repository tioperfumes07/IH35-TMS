import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { countBufferedErrorsSince } from "../lib/error-monitor-buffer.js";

function thresholdPerMinute(): number {
  const raw = process.env.ERROR_DIGEST_THRESHOLD ?? "10";
  const n = Number(raw);
  return Number.isFinite(n) ? n : 10;
}

async function appendDigestAudit(summary: Record<string, unknown>) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1::text, $2::text, $3::jsonb, NULL::uuid, $4::text)`, [
      "admin.error_digest",
      "warning",
      JSON.stringify(summary),
      "BLOCK-L-ERROR-DIGEST",
    ]);
  }).catch(() => undefined);
}

export function initializeErrorDigestCron(app: FastifyInstance) {
  const windowMs = 5 * 60 * 1000;
  setInterval(() => {
    void (async () => {
      try {
        const total = countBufferedErrorsSince(windowMs, "any");
        if (total < thresholdPerMinute()) return;

        await appendDigestAudit({
          window_minutes: 5,
          total_buffered_events: total,
          threshold: thresholdPerMinute(),
          ts: new Date().toISOString(),
        });

        app.log.error({ total, threshold: thresholdPerMinute() }, "[error-digest] elevated error volume detected");
      } catch (error) {
        app.log.warn({ err: error }, "[error-digest] failed");
      }
    })();
  }, 60_000);

  app.log.info("[error-digest] 60s scheduler initialized");
}
