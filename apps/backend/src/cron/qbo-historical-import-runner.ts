import type { FastifyBaseLogger } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { runForensicImport } from "../integrations/qbo/forensic-import.service.js";
import { sendEmail } from "../notifications/email.service.js";

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

export function initializeQboHistoricalImportRunner(logger: FastifyBaseLogger) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_QBO_FORENSIC_RUNNER === "false") {
    logger.info("QBO forensic runner disabled via ENABLE_QBO_FORENSIC_RUNNER=false");
    return;
  }

  cron.schedule(
    RUN_EVERY_MINUTE,
    async () => {
      const batches = await withLuciaBypass(async (client) => {
        const res = await client.query<{ id: string; operating_company_id: string }>(
          `
            SELECT id, operating_company_id
            FROM qbo_archive.import_batches
            WHERE status = 'in_progress'
            ORDER BY started_at ASC
            LIMIT 5
          `
        );
        return res.rows;
      });

      for (const batch of batches) {
        try {
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
          logger.error({ err: error, batchId: batch.id }, "QBO forensic import batch failed");
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
        }
      }
    },
    { timezone: "America/Chicago" }
  );
  logger.info("QBO historical import runner initialized (every minute, resumable)");
}

