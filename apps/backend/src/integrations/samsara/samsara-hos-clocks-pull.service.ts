// VERBATIM HOS CLOCKS (Path B, Blueprint §3.15.9.2 / §3.15.8.3). Pull Samsara's COMPUTED driving/shift/cycle/break
// remaining from GET /fleet/hos/clocks, store verbatim (ms→min) in samsara.hos_snapshots, and let the board + roster
// + Block 05 DISPLAY those numbers — NOT our computeHosClocks recompute. The recompute stays only for the visual
// ELD timeline + 8-day breakdown bars (Samsara doesn't return those). board==roster==certified-ELD by construction.
import { SamsaraClient } from "./samsara-client.js";
import { getSamsaraConfigForCompany, type PgClient } from "./samsara.service.js";

export type HosClocksPullResult = {
  active_drivers: number;
  mapped: number;
  written: number;
  errors: number;
  error: string | null;
};

export async function syncSamsaraHosClocks(client: PgClient, operatingCompanyId: string): Promise<HosClocksPullResult> {
  // Active board drivers = OPEN vehicle assignment, resolved to Samsara id via the board-proven key (same set the
  // logs pull uses). Carry the unit so the snapshot can record vehicle_uuid.
  const active = await client.query(
    `SELECT DISTINCT ON (d.id)
       d.id::text AS local_driver_id, d.samsara_driver_id::text AS samsara_driver_id, a.unit_id::text AS unit_id
     FROM mdata.drivers d
     JOIN telematics.vehicle_driver_assignments a ON a.driver_id = d.id AND a.ended_at IS NULL
     WHERE d.operating_company_id = $1::uuid AND d.samsara_driver_id IS NOT NULL AND d.deactivated_at IS NULL
     ORDER BY d.id, a.started_at DESC`,
    [operatingCompanyId]
  );
  const rows = active.rows as Array<{ local_driver_id: string; samsara_driver_id: string; unit_id: string | null }>;
  const localBySamsara = new Map<string, { local: string; unit: string | null }>();
  for (const r of rows) localBySamsara.set(r.samsara_driver_id, { local: r.local_driver_id, unit: r.unit_id });
  const activeDrivers = localBySamsara.size;
  if (activeDrivers === 0) return { active_drivers: 0, mapped: 0, written: 0, errors: 0, error: null };

  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const api = new SamsaraClient({ apiToken: null, samsaraOrgId: cfg && cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });

  let clocks;
  try {
    clocks = await api.listHosClocks([...localBySamsara.keys()]);
  } catch (err) {
    return { active_drivers: activeDrivers, mapped: 0, written: 0, errors: 0, error: `fetch:${String((err as Error)?.message ?? err)}` };
  }

  let mapped = 0;
  let written = 0;
  let errors = 0;
  let firstError: string | null = null;
  for (let i = 0; i < clocks.length; i++) {
    const c = clocks[i];
    const map = localBySamsara.get(c.driverId);
    if (!map) continue; // not one of our active drivers
    mapped += 1;
    const sp = `hos_clk_${i}`;
    await client.query(`SAVEPOINT ${sp}`);
    try {
      // Verbatim into the (already-migrated) snapshot columns — values stored in MINUTES.
      const res = await client.query(
        `INSERT INTO samsara.hos_snapshots
           (operating_company_id, driver_uuid, vehicle_uuid, duty_status,
            driving_hours_remaining, on_duty_hours_remaining, cycle_hours_remaining, time_to_next_break_minutes,
            samsara_payload, polled_at, samsara_event_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, NULL, $4, $5, $6, $7, $8::jsonb, now(), $9::timestamptz)`,
        [
          operatingCompanyId, map.local, map.unit,
          c.drive_remaining_min, c.shift_remaining_min, c.cycle_remaining_min, c.break_remaining_min,
          JSON.stringify(c.raw), c.cycle_started_at,
        ]
      );
      written += res.rowCount ?? 0;
      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => undefined);
      errors += 1;
      if (!firstError) firstError = `clock_insert:${String((err as Error)?.message ?? err)}`;
    }
  }
  return { active_drivers: activeDrivers, mapped, written, errors, error: firstError };
}

export type LatestHosClocks = {
  drive_remaining_min: number | null;
  shift_remaining_min: number | null; // 14h window
  cycle_remaining_min: number | null;
  break_remaining_min: number | null;
  cycle_started_at: string | null;
  violation: boolean; // Samsara's numbers: any of cycle/drive/shift remaining <= 0
  polled_at: string;
};

// Latest verbatim Samsara clocks per driver (most-recent snapshot). The board + roster read THIS for the headline
// numbers + violation; a driver with NO snapshot => null (honest "unavailable" — Samsara returned nothing).
export async function getLatestHosClocksByDriver(
  client: PgClient,
  operatingCompanyId: string
): Promise<Map<string, LatestHosClocks>> {
  const res = await client.query(
    `SELECT DISTINCT ON (driver_uuid)
       driver_uuid::text AS driver_uuid,
       driving_hours_remaining, on_duty_hours_remaining, cycle_hours_remaining, time_to_next_break_minutes,
       samsara_event_at::text AS samsara_event_at, polled_at::text AS polled_at
     FROM samsara.hos_snapshots
     WHERE operating_company_id = $1::uuid
     ORDER BY driver_uuid, polled_at DESC`,
    [operatingCompanyId]
  );
  const out = new Map<string, LatestHosClocks>();
  for (const r of res.rows as Array<Record<string, unknown>>) {
    const drive = r.driving_hours_remaining == null ? null : Number(r.driving_hours_remaining);
    const shift = r.on_duty_hours_remaining == null ? null : Number(r.on_duty_hours_remaining);
    const cycle = r.cycle_hours_remaining == null ? null : Number(r.cycle_hours_remaining);
    const brk = r.time_to_next_break_minutes == null ? null : Number(r.time_to_next_break_minutes);
    const violation = [cycle, drive, shift].some((v) => v != null && v <= 0);
    out.set(String(r.driver_uuid), {
      drive_remaining_min: drive, shift_remaining_min: shift, cycle_remaining_min: cycle, break_remaining_min: brk,
      cycle_started_at: (r.samsara_event_at as string | null) ?? null,
      violation,
      polled_at: String(r.polled_at),
    });
  }
  return out;
}
