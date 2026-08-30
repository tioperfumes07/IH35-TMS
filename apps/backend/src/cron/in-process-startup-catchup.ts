import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { isReconciliationJobOverdue } from "./reconciliation-worker.cron.js";
import { runSearchIndexerIncrementalTick } from "../jobs/search-indexer-incremental.js";
import { purgeExpiredIdempotencyKeys } from "../middleware/idempotency-cleanup.cron.js";
import { runCertExpiryMonitorTick } from "../jobs/cert-expiry-monitor.js";
import { runDocumentAlertEngineCronTick } from "../drivers/document-alerts.cron.js";
import { refreshSafetyReminders } from "../safety/reminders.cron.js";
import { runModelLifecycleCheck } from "./model-lifecycle-monitor.cron.js";
import { runSamsaraWebhookProjectionTick } from "./samsara-webhook-projection.cron.js";
import { runLegalMattersReminderTick } from "../legal/matters-reminder.cron.js";
import { runInsurancePaymentReminderTick } from "../insurance/payment-reminder.service.js";
import { runCashAdvanceExpiryTick } from "./cash-advance-request-expiry-cron.js";
import { processEmailQueueTick } from "../email/cron.js";
import { runChatConfirmationEscalationTick } from "./chat-confirmation-escalation.cron.js";

/**
 * SYSTEM-BACKGROUND-JOB-LEDGER-STALE-AFTER-SUCCESSFUL-TICKS
 *
 * node-cron does not backfill ticks missed while the API was down. Daily/hourly jobs with a
 * two-period health window stay LATE for days of restart churn even though the scheduler is
 * healthy. Reconciliation already catch-up-ticks on boot (#8168). This list is the same pattern
 * for in-process, non-QBO, non-poster jobs that currently make /healthz background_jobs.stale DOWN.
 *
 * Forbidden here: TMS→QBO push, QBO inbound/CDC/token/forensic, money posters (collections,
 * loves import, factoring interest, settlement auto-pay, bank recon auto-match). Those stay
 * honestly LATE until their owning lane runs them or health mirrors their OFF flags.
 */
export const IN_PROCESS_CATCHUP_WINDOWS: ReadonlyArray<{
  jobName: string;
  maxStaleMinutes: number;
  disabled: () => boolean;
}> = [
  { jobName: "samsara.webhook_projection_cron", maxStaleMinutes: 15, disabled: () => (process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON ?? "true").trim() === "false" },
  { jobName: "ai.model_lifecycle_monitor", maxStaleMinutes: 2880, disabled: () => process.env.ENABLE_MODEL_LIFECYCLE_MONITOR_CRON === "false" },
  { jobName: "safety.reminders_cron", maxStaleMinutes: 2880, disabled: () => process.env.ENABLE_SAFETY_REMINDERS_CRON === "false" },
  { jobName: "cash_advance.expiry_cron", maxStaleMinutes: 1560, disabled: () => process.env.ENABLE_CASH_ADVANCE_REQUEST_EXPIRY_CRON === "false" },
  { jobName: "insurance.payment_reminder_cron", maxStaleMinutes: 1560, disabled: () => false },
  { jobName: "legal.matters_reminder_cron", maxStaleMinutes: 1560, disabled: () => process.env.ENABLE_LEGAL_MATTERS_REMINDER_CRON === "false" },
  { jobName: "drivers.document_alert_engine_cron", maxStaleMinutes: 2880, disabled: () => process.env.ENABLE_DOCUMENT_ALERT_ENGINE_CRON === "false" },
  { jobName: "safety.cert_expiry_monitor", maxStaleMinutes: 2880, disabled: () => process.env.ENABLE_CERT_EXPIRY_MONITOR === "false" },
  { jobName: "search.indexer_incremental", maxStaleMinutes: 2880, disabled: () => process.env.ENABLE_SEARCH_INDEXER_INCREMENTAL === "false" },
  { jobName: "idempotency.cleanup_cron", maxStaleMinutes: 2880, disabled: () => process.env.ENABLE_IDEMPOTENCY_CLEANUP_CRON === "false" },
  { jobName: "email.queue_processor", maxStaleMinutes: 5, disabled: () => process.env.EMAIL_CRON_ENABLED !== "true" },
  { jobName: "chat.confirmation_escalation", maxStaleMinutes: 5, disabled: () => process.env.ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON === "false" },
];

function tickFor(jobName: string, app: FastifyInstance): (() => Promise<void>) | null {
  switch (jobName) {
    case "samsara.webhook_projection_cron":
      return () => runSamsaraWebhookProjectionTick();
    case "ai.model_lifecycle_monitor":
      return () => runModelLifecycleCheck(app.log).then(() => undefined);
    case "safety.reminders_cron":
      return () => refreshSafetyReminders();
    case "cash_advance.expiry_cron":
      return () => runCashAdvanceExpiryTick(app);
    case "insurance.payment_reminder_cron":
      return () => runInsurancePaymentReminderTick();
    case "legal.matters_reminder_cron":
      return () => runLegalMattersReminderTick(app);
    case "drivers.document_alert_engine_cron":
      return () => runDocumentAlertEngineCronTick();
    case "safety.cert_expiry_monitor":
      return () => runCertExpiryMonitorTick(app);
    case "search.indexer_incremental":
      return () => runSearchIndexerIncrementalTick();
    case "idempotency.cleanup_cron":
      return async () => {
        await purgeExpiredIdempotencyKeys();
      };
    case "email.queue_processor":
      return async () => {
        await processEmailQueueTick(app.log);
      };
    case "chat.confirmation_escalation":
      return async () => {
        await runChatConfirmationEscalationTick();
      };
    default:
      return null;
  }
}

export async function catchUpOverdueInProcessJobTicks(app: FastifyInstance): Promise<void> {
  const ages = new Map<string, string | null>();
  try {
    await withLuciaBypass(async (client) => {
      const reg = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
      if (!reg.rows[0]?.ok) {
        // CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE: honest signal instead of a bare skip — a fresh/
        // unmigrated DB fails closed (no catch-up runs) rather than silently doing nothing with no
        // trace anywhere that the health-window mechanism could not even check its own ledger.
        app.log.warn("[in-process-catchup] _system.background_jobs not available — fails closed, no catch-up");
        return;
      }
      const res = await client.query<{ job_name: string; last_successful_run_at: string | null }>(
        `SELECT job_name, last_successful_run_at
           FROM _system.background_jobs
          WHERE job_name = ANY($1::text[])`,
        [IN_PROCESS_CATCHUP_WINDOWS.map((j) => j.jobName)]
      );
      for (const row of res.rows) {
        ages.set(row.job_name, row.last_successful_run_at);
      }
    });
  } catch (error) {
    app.log.error({ err: error }, "[in-process-catchup] age lookup failed — skipping catch-up");
    return;
  }

  for (const { jobName, maxStaleMinutes, disabled } of IN_PROCESS_CATCHUP_WINDOWS) {
    if (disabled()) continue;
    const last = ages.has(jobName) ? ages.get(jobName) : null;
    if (!isReconciliationJobOverdue(last ?? null, maxStaleMinutes)) continue;
    const tick = tickFor(jobName, app);
    if (!tick) continue;
    try {
      app.log.warn({ jobName }, `[in-process-catchup] overdue — running one startup tick for ${jobName}`);
      await wrapBackgroundJobTick(jobName, tick, app.log);
    } catch (error) {
      app.log.error({ err: error, jobName }, `[in-process-catchup] ${jobName} catch-up threw`);
    }
  }
}

export function startInProcessJobCatchup(app: FastifyInstance): void {
  void catchUpOverdueInProcessJobTicks(app).catch((error) => {
    app.log.error({ err: error }, "[in-process-catchup] unexpected rejection");
  });
}
