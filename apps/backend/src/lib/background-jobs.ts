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
