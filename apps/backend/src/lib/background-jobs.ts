import * as Sentry from "@sentry/node";
import { withLuciaBypass } from "../auth/db.js";

export async function recordBackgroundJobRun(
  jobName: string,
  success: boolean,
  errorMessage?: string | null
): Promise<void> {
  try {
    await withLuciaBypass(async (client) => {
      const exists = await client.query(`SELECT to_regclass('_system.background_jobs') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return;
      await client.query(`SELECT _system.record_job_run($1::text, $2::boolean, $3::text)`, [
        jobName,
        success,
        errorMessage ?? null,
      ]);
    });
  } catch (error) {
    console.warn("[background-jobs] record_job_run failed", error);
  }
}

// GO-0017-L3-CRON-WRITES-OUTCOME: an env-var-gated cron's disabled-early-return (BEFORE
// cron.schedule is ever called) previously wrote NOTHING to _system.background_jobs — the job's
// last recorded row just sat at whatever timestamp it had before being disabled, indistinguishable
// from a silently crashed/stopped process (both look identical: a frozen last_successful_run_at).
// Confirmed live via Render logs (INFRA-F9935, GO-0016): email.queue_processor,
// chat.confirmation_escalation, and samsara.webhook_projection_cron were all disabled in the same
// 2026-08-21 deploy-storm window as INFRA-F6350, and their background_jobs rows have been frozen
// at their pre-disable timestamps ever since — the exact ambiguity this fix closes.
//
// Correctly determining "I am disabled, I will not run" and skipping is NOT a failure — it is the
// job's registration logic executing exactly as designed. Recording it as success=true means
// last_successful_run_at refreshes on every process boot (this repo deploys frequently), so a
// disabled-by-design job shows a RECENT, moving timestamp forever — cleanly distinguishable from a
// job that silently stopped ticking and never recovers. _system.background_jobs currently has no
// third "skipped"/"disabled" state (only success/failure booleans) — extending the schema for a
// genuine tri-state signal is a reasonable follow-up, not required for this fix.
export async function recordBackgroundJobDisabled(jobName: string): Promise<void> {
  await recordBackgroundJobRun(jobName, true, null);
}

export async function wrapBackgroundJobTick(
  jobName: string,
  fn: () => Promise<void>,
  log?: { error?: (obj: unknown, msg?: string) => void },
  opts?: { onError?: (error: unknown) => void }
): Promise<void> {
  try {
    await fn();
    await recordBackgroundJobRun(jobName, true, null);
  } catch (error) {
    await recordBackgroundJobRun(jobName, false, String((error as Error)?.message ?? error));
    opts?.onError?.(error);
    log?.error?.({ err: error, jobName }, `[background-job:${jobName}] tick failed`);
    if (process.env.SENTRY_DSN?.trim()) {
      Sentry.captureException(error, { tags: { job_name: jobName } });
    }
  }
}
