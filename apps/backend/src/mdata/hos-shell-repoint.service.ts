/**
 * Register row 93 (2026-11-03) — a merged shell's HOS rows move to the survivor AT THE MERGE.
 *
 * WHY: one driver profile per person. hos.duty_status_events is append-only, so the merge engine's generic repoint
 * (driver-merge.service.ts repointAll) recorded it "history_kept" and every duty event stayed on the shell; the Samsara
 * mapping "retire" path (driver-mapping.routes.ts) set merged_into_driver_id without moving any child row, so the shell's
 * samsara.hos_snapshots stayed too. Measured 11-03 on prod, USMCA: 9,035 duty events on 15 shells, 49,486 snapshots on 8.
 * Migration 202616340100 admits exactly one UPDATE on the ledger: driver_id from a merged shell to THAT shell's survivor,
 * every other column unchanged.
 *
 * RULES: call AFTER mdata.drivers.merged_into_driver_id is set (the ledger trigger checks it). A duty event the survivor
 * already holds (same duty_status, started_at, source — the dedupe key) is an exact duplicate: it stays on the shell, never
 * deleted, never moved onto the survivor twice. Snapshots have no natural key — every one moves. Same company only.
 */
type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type HosShellRepoint = { duty_events_moved: number; duty_events_duplicate_kept: number; snapshots_moved: number };

export const HOS_DUTY_EVENTS_SHELL_REPOINT_SQL = `
  UPDATE hos.duty_status_events e
     SET driver_id = shell.merged_into_driver_id
    FROM mdata.drivers shell
   WHERE shell.id = $1::uuid
     AND shell.merged_into_driver_id = $2::uuid
     AND e.driver_id = shell.id
     AND e.operating_company_id = shell.operating_company_id
     AND NOT EXISTS (
       SELECT 1 FROM hos.duty_status_events s
        WHERE s.operating_company_id = e.operating_company_id
          AND s.driver_id = shell.merged_into_driver_id
          AND s.duty_status = e.duty_status
          AND s.started_at = e.started_at
          AND s.source = e.source)`;

export const HOS_SNAPSHOTS_SHELL_REPOINT_SQL = `
  UPDATE samsara.hos_snapshots h
     SET driver_uuid = shell.merged_into_driver_id
    FROM mdata.drivers shell
   WHERE shell.id = $1::uuid
     AND shell.merged_into_driver_id = $2::uuid
     AND h.driver_uuid = shell.id
     AND h.operating_company_id = shell.operating_company_id`;

export async function repointHosRowsToSurvivor(client: Db, shellId: string, survivorId: string): Promise<HosShellRepoint> {
  const duty = await client.query(HOS_DUTY_EVENTS_SHELL_REPOINT_SQL, [shellId, survivorId]);
  const snaps = await client.query(HOS_SNAPSHOTS_SHELL_REPOINT_SQL, [shellId, survivorId]);
  const left = await client.query(
    `SELECT count(*)::int AS n FROM hos.duty_status_events e JOIN mdata.drivers shell ON shell.id = e.driver_id
      WHERE shell.id = $1::uuid AND e.operating_company_id = shell.operating_company_id`,
    [shellId]
  );
  return {
    duty_events_moved: duty.rowCount ?? 0,
    duty_events_duplicate_kept: Number(left.rows[0]?.n ?? 0),
    snapshots_moved: snaps.rowCount ?? 0,
  };
}
