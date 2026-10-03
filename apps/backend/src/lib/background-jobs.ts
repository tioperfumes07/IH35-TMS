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

/**
 * Standing order point 9 — single-fire. Two backend instances run every node-cron schedule; this lets exactly one of
 * them run a job inside its lease window. The claim is ONE atomic statement on _system.job_leases (migration
 * 202615340700): insert the job's row, or take it over only when the current lease has expired. Returns "skipped"
 * when another instance holds the lease — the holder records the run, so a skip is not a failure.
 */
/** Default lease for CC-2's daily / 6-hourly / hourly jobs: longer than the instance stagger, shorter than any period. */
export const JOB_LEASE_SECONDS = 600;

export async function withJobLease(
  jobName: string,
  leaseSeconds: number,
  fn: () => Promise<void>
): Promise<"ran" | "skipped"> {
  const holder = `${process.env.RENDER_INSTANCE_ID ?? process.env.HOSTNAME ?? "local"}:${process.pid}`;
  const claimed = await withLuciaBypass(async (client) => {
    const r = await client.query<{ job_name: string }>(
      `
        INSERT INTO _system.job_leases (job_name, holder, leased_at, leased_until)
        VALUES ($1, $2, now(), now() + make_interval(secs => $3))
        ON CONFLICT (job_name) DO UPDATE
           SET holder = EXCLUDED.holder, leased_at = EXCLUDED.leased_at, leased_until = EXCLUDED.leased_until
         WHERE _system.job_leases.leased_until < now()
        RETURNING job_name
      `,
      [jobName, holder, leaseSeconds]
    );
    return r.rows.length === 1;
  });
  if (!claimed) return "skipped";
  try {
    await fn();
  } finally {
    await withLuciaBypass((client) =>
      client.query(`UPDATE _system.job_leases SET last_finished_at = now() WHERE job_name = $1 AND holder = $2`, [jobName, holder])
    ).catch((err) => console.warn("[background-jobs] job lease finish stamp failed", err));
  }
  return "ran";
}

export async function wrapBackgroundJobTick(
  jobName: string,
  fn: () => Promise<void>,
  log?: { error?: (obj: unknown, msg?: string) => void },
  /**
   * rethrow (ROUND 330.1): after recording + logging the failure, throw it on — for engines whose policy is "never
   * swallowed" (fault-poll, samsara-dvir-poll, harsh-events-poll), so they can route through this wrapper too.
   */
  /**
   * leaseSeconds (standing order point 9): run under withJobLease so only one instance runs this tick; the other
   * instance skips silently (the holder records the run).
   */
  opts?: { onError?: (error: unknown) => void; rethrow?: boolean; leaseSeconds?: number }
): Promise<void> {
  try {
    if (opts?.leaseSeconds) {
      const outcome = await withJobLease(jobName, opts.leaseSeconds, fn);
      if (outcome === "skipped") return;
    } else {
      await fn();
    }
    await recordBackgroundJobRun(jobName, true, null);
  } catch (error) {
    await recordBackgroundJobRun(jobName, false, String((error as Error)?.message ?? error));
    opts?.onError?.(error);
    log?.error?.({ err: error, jobName }, `[background-job:${jobName}] tick failed`);
    if (process.env.SENTRY_DSN?.trim()) {
      Sentry.captureException(error, { tags: { job_name: jobName } });
    }
    if (opts?.rethrow) throw error;
  }
}
