/**
 * Stage-1 pull flag OFF must leave a durable qbo.sync_runs audit row.
 * Without this, OFF looks identical to a dead cron (false silence).
 *
 * Uses status=cancelled (allowed by CHECK) + payload.reason=flag_disabled —
 * not success (would look healthy) and not a new skipped status (needs migration).
 */
import { withLuciaBypass } from "../auth/db.js";

export async function recordFlagDisabledMirrorSyncRun(input: {
  operatingCompanyId: string;
  kind: string;
  flagKey: string;
  mirrorTable: string;
}): Promise<void> {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    const exists = await client.query<{ ok: boolean }>(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return;
    await client.query(
      `
        INSERT INTO qbo.sync_runs (
          operating_company_id,
          kind,
          status,
          started_at,
          completed_at,
          records_processed,
          payload
        )
        VALUES ($1, $2, 'cancelled', now(), now(), 0, $3::jsonb)
      `,
      [
        input.operatingCompanyId,
        input.kind,
        JSON.stringify({
          direction: "qbo_to_tms",
          reason: "flag_disabled",
          flag_key: input.flagKey,
          mirror_table: input.mirrorTable,
          source_id_key: "qbo_id",
        }),
      ]
    );
  });
}
