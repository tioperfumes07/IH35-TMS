import { withLuciaBypass } from "../../auth/db.js";

export type WithHeartbeatOpts = {
  /** Milliseconds between heartbeat writes; default 30_000. */
  intervalMs?: number;
  /** Included in warn logs when a heartbeat write fails. */
  phase?: string;
};

/**
 * Runs `fn` while periodically updating `last_heartbeat_at` on the import batch.
 * Uses setInterval; clears the timer in `finally`. Heartbeat failures are logged and ignored.
 */
export async function withHeartbeat<T>(batchId: string, opts: WithHeartbeatOpts | undefined, fn: () => Promise<T>): Promise<T> {
  const intervalMs = opts?.intervalMs ?? 30_000;
  const phase = opts?.phase ?? "unknown";

  const tick = async () => {
    try {
      await withLuciaBypass(async (client) => {
        await client.query(
          `
            UPDATE qbo_archive.import_batches
            SET last_heartbeat_at = now(),
                updated_at = now()
            WHERE id = $1::uuid
              AND status = 'in_progress'
          `,
          [batchId]
        );
      });
    } catch (err) {
      console.warn("[FORENSIC_HEARTBEAT]", {
        batchId,
        phase,
        message: String((err as Error)?.message ?? err),
      });
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  try {
    return await fn();
  } finally {
    clearInterval(handle);
  }
}
