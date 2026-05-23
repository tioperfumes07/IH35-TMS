import type { PoolClient } from "pg";

export const MAX_SYNC_ATTEMPTS = 5;

export type SyncState = "pending" | "in_progress" | "succeeded" | "failed_retryable" | "failed_terminal";
export type PersistedSyncStatus = "pending" | "running" | "success" | "failed" | "dead_letter" | "cancelled";

// Explicit state graph (no implicit transitions allowed).
export const STATE_TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  pending: ["in_progress"],
  in_progress: ["succeeded", "failed_retryable", "failed_terminal"],
  succeeded: [],
  failed_retryable: ["in_progress", "failed_terminal"],
  failed_terminal: ["pending"], // manual retry re-opens a dead-lettered run
} as const;

function persistStatusForState(state: SyncState): PersistedSyncStatus {
  if (state === "pending") return "pending";
  if (state === "in_progress") return "running";
  if (state === "succeeded") return "success";
  if (state === "failed_retryable") return "failed";
  return "dead_letter";
}

export function computeRetryDelayMinutes(attemptCountAfterFailure: number): number {
  const safeAttempt = Math.max(1, attemptCountAfterFailure);
  return Math.min(60, Math.pow(2, safeAttempt));
}

export function computeRetryDelayMs(attemptCountAfterFailure: number): number {
  return computeRetryDelayMinutes(attemptCountAfterFailure) * 60_000;
}

export function isTerminalAttempt(attemptCountAfterFailure: number): boolean {
  return attemptCountAfterFailure >= MAX_SYNC_ATTEMPTS;
}

export async function transitionToInProgress(client: PoolClient, input: { syncRunId: string; operatingCompanyId: string }) {
  const targetStatus = persistStatusForState("in_progress");
  const res = await client.query<{ id: string }>(
    `
      UPDATE qbo.sync_runs
      SET status = $3,
          started_at = COALESCE(started_at, now()),
          completed_at = NULL,
          error_message = NULL
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status IN ('pending', 'failed')
      RETURNING id::text
    `,
    [input.syncRunId, input.operatingCompanyId, targetStatus],
  );
  return Boolean(res.rows[0]?.id);
}

export async function transitionToSucceeded(client: PoolClient, input: { syncRunId: string; operatingCompanyId: string }) {
  const targetStatus = persistStatusForState("succeeded");
  const res = await client.query<{ id: string }>(
    `
      UPDATE qbo.sync_runs
      SET status = $3,
          completed_at = now(),
          error_message = NULL,
          next_retry_at = NULL,
          records_processed = COALESCE(records_processed, 0) + 1
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'running'
      RETURNING id::text
    `,
    [input.syncRunId, input.operatingCompanyId, targetStatus],
  );
  return Boolean(res.rows[0]?.id);
}

export async function transitionToFailed(client: PoolClient, input: {
  syncRunId: string;
  operatingCompanyId: string;
  attemptCountAfterFailure: number;
  errorMessage: string;
}) {
  const terminal = isTerminalAttempt(input.attemptCountAfterFailure);
  const targetStatus = terminal ? persistStatusForState("failed_terminal") : persistStatusForState("failed_retryable");
  const nextRetryAt = terminal ? null : new Date(Date.now() + computeRetryDelayMs(input.attemptCountAfterFailure)).toISOString();
  const res = await client.query<{ id: string }>(
    `
      UPDATE qbo.sync_runs
      SET status = $3,
          retry_count = $4,
          error_message = $5,
          completed_at = CASE WHEN $6 THEN now() ELSE NULL END,
          dead_letter_at = CASE WHEN $6 THEN now() ELSE dead_letter_at END,
          next_retry_at = CASE WHEN $6 THEN NULL ELSE $7::timestamptz END
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'running'
      RETURNING id::text
    `,
    [input.syncRunId, input.operatingCompanyId, targetStatus, input.attemptCountAfterFailure, input.errorMessage, terminal, nextRetryAt],
  );
  return {
    updated: Boolean(res.rows[0]?.id),
    terminal,
    nextRetryAt,
  };
}

export async function transitionTerminalToPending(client: PoolClient, input: { syncRunId: string; operatingCompanyId: string }) {
  const targetStatus = persistStatusForState("pending");
  const res = await client.query<{ id: string }>(
    `
      UPDATE qbo.sync_runs
      SET status = $3,
          retry_count = 0,
          error_message = NULL,
          next_retry_at = NULL,
          dead_letter_at = NULL,
          completed_at = NULL
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'dead_letter'
      RETURNING id::text
    `,
    [input.syncRunId, input.operatingCompanyId, targetStatus],
  );
  return Boolean(res.rows[0]?.id);
}

export async function dismissTerminalRun(client: PoolClient, input: { syncRunId: string; operatingCompanyId: string }) {
  const res = await client.query<{ id: string }>(
    `
      UPDATE qbo.sync_runs
      SET status = 'cancelled',
          dead_letter_at = NULL
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status = 'dead_letter'
      RETURNING id::text
    `,
    [input.syncRunId, input.operatingCompanyId],
  );
  return Boolean(res.rows[0]?.id);
}
