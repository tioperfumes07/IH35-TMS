import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { runForensicImportDeduped } from "../integrations/qbo/forensic-import.service.js";
import { sendEmail } from "../notifications/email.service.js";
import { sendForensicZombieAlert } from "../integrations/email/forensic-alerts.js";
import { auditBatchEvent, auditForensicImportError } from "../integrations/qbo/forensic-audit.service.js";
import { getValidAccessToken } from "../integrations/qbo/qbo-oauth.service.js";
import { markRunnerFailed, markRunnerInitialized, markRunnerTick } from "../admin/runner-status.store.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

/** Cron expression — default every minute. Override with QBO_FORENSIC_CRON (5-field, America/Chicago). */
function forensicCronExpression() {
  const raw = (process.env.QBO_FORENSIC_CRON ?? "").trim();
  return raw || "*/1 * * * *";
}

/**
 * Auto-fail zombie batches after N minutes without heartbeat updates.
 * Only runs when QBO_FORENSIC_AUTO_FAIL_STALE=true (opt-in).
 * When enabled, default window is 10080 minutes (7 days) — not 15 minutes.
 */
function staleHeartbeatMinutesForAutoFail(): number {
  const n = Number(process.env.QBO_FORENSIC_STALE_AFTER_MINUTES ?? "10080");
  return Number.isFinite(n) && n > 0 ? n : 10080;
}

/** Opt-in: set QBO_FORENSIC_AUTO_FAIL_STALE=true to auto-fail very stale in_progress batches. */
function autoFailStaleEnabled() {
  return (process.env.QBO_FORENSIC_AUTO_FAIL_STALE ?? "false").toLowerCase() === "true";
}

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
  if (!autoFailStaleEnabled()) return;

  const staleMinutes = staleHeartbeatMinutesForAutoFail();
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
              || format(' [auto-failed: heartbeat stale > %s minutes]', $1::text),
            updated_at = now()
        FROM org.companies c
        WHERE b.status = 'in_progress'
          AND b.last_heartbeat_at < now() - ($1::int * interval '1 minute')
          AND c.id = b.operating_company_id
        RETURNING b.id, b.operating_company_id, b.started_at::text, b.last_heartbeat_at::text, c.legal_name AS company_name,
          GREATEST($1::int + 1, FLOOR(EXTRACT(EPOCH FROM (now() - b.last_heartbeat_at))/60))::int AS minutes_stale
      `,
      [staleMinutes]
    );
    return res.rows;
  });

  for (const row of stale) {
    await appendSystemAudit(
      "qbo_archive.batch.auto_failed",
      { batch_id: row.id, operating_company_id: row.operating_company_id, reason: "stale_heartbeat_auto_fail", stale_after_minutes: staleHeartbeatMinutesForAutoFail() },
      "warning"
    );
    await auditBatchEvent(row.id, row.operating_company_id, "batch_auto_failed_stale", {
      error_message: `heartbeat stale > ${staleHeartbeatMinutesForAutoFail()} minutes`,
      minutes_stale: row.minutes_stale,
    });
    await auditForensicImportError(
      row.id,
      row.operating_company_id,
      new Error(`batch_auto_failed_stale: heartbeat stale ~${row.minutes_stale} minutes`),
      { phase: "runner", step: "auto_fail_stale_batch" },
      app.log
    );
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

async function runForensicRunnerCronTick(app: FastifyInstance): Promise<void> {
      markRunnerTick("forensic_runner");
      await autoFailStaleBatches(app);
      const batches = await withLuciaBypass(async (client) => {
        const res = await client.query<{ id: string; operating_company_id: string }>(
          `
            SELECT DISTINCT ON (operating_company_id) id, operating_company_id
            FROM qbo_archive.import_batches
            WHERE status = 'in_progress'
            ORDER BY
              operating_company_id,
              (COALESCE(transactions_imported, 0) + COALESCE(entities_imported, 0) + COALESCE(attachments_imported, 0)) DESC,
              started_at DESC NULLS LAST
          `
        );
        return res.rows;
      });

      const sinceDate = process.env.QBO_FORENSIC_SINCE_DATE ?? "2015-01-01";
      const attachmentsSinceDate = process.env.QBO_FORENSIC_ATTACHMENTS_SINCE_DATE ?? "2021-01-01";

      for (const batch of batches) {
        try {
          await appendSystemAudit("qbo_archive.import_resumed", { batch_id: batch.id, operating_company_id: batch.operating_company_id });
          await withLuciaBypass(async (client) => {
            await client.query(
              `
                UPDATE qbo_archive.import_batches
                SET last_heartbeat_at = now(),
                    updated_at = now()
                WHERE id = $1::uuid
                  AND status = 'in_progress'
              `,
              [batch.id]
            );
          });
          try {
            await getValidAccessToken(batch.operating_company_id);
          } catch (err) {
            app.log.warn({ err, operatingCompanyId: batch.operating_company_id, batchId: batch.id }, "QBO token warmup failed before forensic resume");
          }
          await runForensicImportDeduped(process.env.SYSTEM_ACTOR_USER_ID || "00000000-0000-0000-0000-000000000000", {
            batchId: batch.id,
            operatingCompanyId: batch.operating_company_id,
            sinceDate,
            attachmentsSinceDate,
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
          await auditForensicImportError(batch.id, batch.operating_company_id, error, {
            phase: "runner",
            step: "cron_import_failed",
          }, app.log);
          await auditBatchEvent(batch.id, batch.operating_company_id, "batch_failed", {
            error_message: String((error as Error)?.message ?? error),
          });
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

  const cronExpr = forensicCronExpression();
  app.log.info(
    {
      cron: cronExpr,
      timezone: "America/Chicago",
      autoFailStale: autoFailStaleEnabled(),
      staleAfterMinutes: staleHeartbeatMinutesForAutoFail(),
      resumePolicy: "furthest_progress_per_company_no_heartbeat_gate",
    },
    "QBO forensic runner initialized — resumes stalled imports; OAuth tokens refresh automatically before API calls (getValidAccessToken)"
  );

  cron.schedule(
    cronExpr,
    async () => {
      await wrapBackgroundJobTick(
        "qbo.forensic_import_runner",
        async () => {
          await runForensicRunnerCronTick(app);
        },
        app.log,
        {
          onError: (error) => markRunnerFailed("forensic_runner", error),
        }
      );
    },
    { timezone: "America/Chicago" }
  );
}

