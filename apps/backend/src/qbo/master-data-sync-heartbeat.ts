import { withLuciaBypass } from "../auth/db.js";

export async function withMasterDataSyncHeartbeat<T>(syncRunId: string, fn: () => Promise<T>): Promise<T> {
  const intervalMs = 30_000;
  const tick = async () => {
    try {
      await withLuciaBypass(async (client) => {
        await client.query(`UPDATE mdata.qbo_sync_runs SET last_heartbeat_at = now() WHERE id = $1::uuid`, [syncRunId]);
      });
    } catch {
      // heartbeat failures are non-fatal
    }
  };
  const handle = setInterval(() => void tick(), intervalMs);
  try {
    await tick();
    return await fn();
  } finally {
    clearInterval(handle);
  }
}
