import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { runForensicImport } from "../integrations/qbo/forensic-import.service.js";
import { sendEmail } from "../notifications/email.service.js";
import { sendForensicZombieAlert } from "../integrations/email/forensic-alerts.js";
import { auditBatchEvent } from "../integrations/qbo/forensic-audit.service.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";

let initialized = false;
const RUN_EVERY_MINUTE = "*/1 * * * *";

async function appendSystemAudit(eventClass: string, payload: Record<string, unknown>, severity: "info" | "warning" = "info") {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      "P5-T6-QBO-FORENSIC",
    ]);
  });
}

async function autoFailStaleBatches(app: FastifyInstance) {
  const stale = await withLuciaBypass(async (client) => {
    const res = await client.query<{
      id: string;
      operating_company_id: string;
      started_at: string | null;
      last_heartbeat_at: string | null;
      company_name: string | null;
      minutes_stale: number;
    }>(
      `
        UPDATE qbo_archive.import_batches b
        SET status = 'failed',
            completed_at = now(),
            errors_count = b.errors_count + 1,
            last_error_message = COALESCE(b.last_error_message, '')
              || ' [auto-failed: heartbeat stale > 15min]',
            updated_at = now()
        FROM org.companies c
        WHERE b.status = 'in_progress'
          AND b.last_heartbeat_at < now() - interval '15 minutes'
          AND c.id = b.operating_company_id
        RETURNING b.id, b.operating_company_id, b.started_at::text, b.last_heartbeat_at::text, c.legal_name AS company_name,
          GREATEST(16, FLOOR(EXTRACT(EPOCH FROM (now() - b.last_heartbeat_at))/60))::int AS minutes_stale
      `
    );
    return res.rows;
  });

  for (const row of stale) {
    await appendSystemAudit(
      "qbo_archive.batch.auto_failed",
      { batch_id: row.id, operating_company_id: row.operating_company_id, reason: "stale_heartbeat_over_15m" },
      "warning"
    );
    await auditBatchEvent(row.id, row.operating_company_id, "batch_auto_failed_stale", {
      error_message: "heartbeat stale > 15 minutes",
      minutes_stale: row.minutes_stale,
    });
    try {
      await sendForensicZombieAlert({
        batch_id: row.id,
        operating_company_id: row.operating_company_id,
        company_name: row.company_name ?? "Unknown company",
        started_at: row.started_at,
        last_heartbeat_at: row.last_heartbeat_at,
        minutes_stale: row.minutes_stale,
      });
    } catch (error) {
      app.log.error({ err: error, batchId: row.id }, "forensic zombie alert failed");
    }
  }
}

export async function initializeQboHistoricalImportRunner(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  markRunnerInitialized("forensic_runner");
  if (process.env.ENABLE_QBO_FORENSIC_RUNNER === "false") {
    app.log.info("QBO forensic runner disabled via ENABLE_QBO_FORENSIC_RUNNER=false");
    return;
  }

  cron.schedule(
    RUN_EVERY_MINUTE,
    async () => {
      markRunnerTick("forensic_runner");
      await autoFailStaleBatches(app);
      const batches = await withLuciaBypass(async (client) => {
        const res = await client.query<{ id: string; operating_company_id: string }>(
          `
            SELECT id, operating_company_id
            FROM qbo_archive.import_batches
            WHERE status = 'in_progress'
              AND last_heartbeat_at >= now() - interval '15 minutes'
            ORDER BY started_at ASC
            LIMIT 5
          `
        );
        return res.rows;
      });

      for (const batch of batches) {
        try {
          await auditBatchEvent(batch.id, batch.operating_company_id, "batch_started");
          await withLuciaBypass((client) =>
            client.query(
              `
                UPDATE qbo_archive.import_batches
                SET last_heartbeat_at = now(), updated_at = now()
                WHERE id = $1
              `,
              [batch.id]
            )
          );
          await appendSystemAudit("qbo_archive.import_resumed", { batch_id: batch.id, operating_company_id: batch.operating_company_id });
          await runForensicImport(process.env.SYSTEM_ACTOR_USER_ID || "00000000-0000-0000-0000-000000000000", {
            batchId: batch.id,
            sinceDate: "2015-01-01",
            attachmentsSinceDate: "2021-01-01",
          });
          await sendEmail({
            to: "tioperfumes07@gmail.com",
            subject: `[IH 35 TMS] QBO forensic import completed: ${batch.id}`,
            sender: "noreply",
            html: `<p>Forensic import completed for batch ${batch.id}</p>`,
            text: `Forensic import completed for batch ${batch.id}`,
            eventClass: "qbo_archive.import_completed",
            tags: [{ name: "type", value: "qbo_forensic" }],
            actorUserId: null,
          });
        } catch (error) {
          app.log.error({ err: error, batchId: batch.id }, "QBO forensic import batch failed");
          markRunnerFailed("forensic_runner", error);
          await withLuciaBypass((client) =>
            client.query(
              `
                UPDATE qbo_archive.import_batches
                SET status = 'failed',
                    errors_count = errors_count + 1,
                    updated_at = now()
                WHERE id = $1
              `,
              [batch.id]
            )
          );
          await appendSystemAudit("qbo_archive.import_failed", { batch_id: batch.id }, "warning");
          await auditBatchEvent(batch.id, batch.operating_company_id, "batch_failed", {
            error_message: String((error as Error)?.message ?? error),
          });
        }
      }
    },
    { timezone: "America/Chicago" }
  );
  app.log.info("QBO historical import runner initialized (every minute, resumable)");
}

