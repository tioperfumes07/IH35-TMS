// GO-LIVE driver-activity Step 1: Samsara HOS/ELD pull.
//
// Fills hos.duty_status_events (which the fleet board's HOS clocks + the 30-day inactivity flag read) by polling
// /fleet/hos/logs. SCOPED to the tenant's ACTIVE board drivers — NOT the whole Samsara account. The account-wide
// pull returned 1358 drivers, mapped almost nothing (1204 unmapped) and missed the 8 trucks that matter; it also
// can't carry 8 days of cycle history per driver. We instead resolve the active drivers via the board-proven key
// (mdata.drivers.samsara_driver_id, on units with an OPEN telematics assignment), pull /fleet/hos/logs for exactly
// those driverIds over an 8-day window (so the 70h cycle + hours-driven are real), and insert idempotently.

import { SamsaraClient } from "./samsara-client.js";
import { getSamsaraConfigForCompany, type PgClient } from "./samsara.service.js";

/** Samsara hosStatusType -> normalized duty_status text (matches the webhook projector's vocabulary). */
function mapDutyStatus(hosStatusType: string): string {
  const s = hosStatusType.toLowerCase();
  if (s.includes("driv")) return "driving";
  if (s.includes("sleeper")) return "sleeper";
  if (s.includes("personal")) return "personal_conveyance";
  if (s.includes("yard")) return "yard_move";
  if (s.includes("offduty") || s === "off") return "off_duty";
  if (s.includes("onduty") || s.includes("on_duty")) return "on_duty";
  return s.replace(/[^a-z]/g, "_");
}

export type HosPullResult = {
  inserted: number;
  mapped_drivers: number;
  unmapped_drivers: number;
  driver_errors: number;
  active_drivers: number;
  error: string | null;
};

export async function syncSamsaraHosLogs(
  client: PgClient,
  operatingCompanyId: string,
  windowHours = 192 // 8 days — the 70h/8-day cycle + hours-driven need the full window, not 48h
): Promise<HosPullResult> {
  // SCOPE: the active board drivers = drivers with an OPEN vehicle assignment (the same set the board shows HOS
  // for), resolved to their Samsara id via the board-proven key. This is the 8, not the account's 1358.
  const active = await client.query(
    `SELECT DISTINCT d.id::text AS local_driver_id, d.samsara_driver_id::text AS samsara_driver_id
       FROM mdata.drivers d
       JOIN telematics.vehicle_driver_assignments a ON a.driver_id = d.id AND a.ended_at IS NULL
      WHERE d.operating_company_id = $1::uuid
        AND d.samsara_driver_id IS NOT NULL
        AND d.deactivated_at IS NULL`,
    [operatingCompanyId]
  );
  const localBySamsara = new Map<string, string>();
  for (const r of active.rows as Array<{ local_driver_id: string; samsara_driver_id: string }>) {
    localBySamsara.set(r.samsara_driver_id, r.local_driver_id);
  }
  const activeDrivers = localBySamsara.size;
  if (activeDrivers === 0) {
    return { inserted: 0, mapped_drivers: 0, unmapped_drivers: 0, driver_errors: 0, active_drivers: 0, error: null };
  }

  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  // Token resolution: SamsaraClient.effectiveToken falls back to env SAMSARA_API_TOKEN when the
  // per-tenant config carries no plaintext token (the live token is configured at the env level).
  const api = new SamsaraClient({
    apiToken: null,
    samsaraOrgId: cfg && cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  const end = new Date();
  const start = new Date(end.getTime() - windowHours * 3600_000);
  let driverLogs: Awaited<ReturnType<typeof api.listHosLogs>>;
  try {
    driverLogs = await api.listHosLogs(start.toISOString(), end.toISOString(), [...localBySamsara.keys()]);
  } catch (err) {
    // Network/timeout/parse failure: record + return so the cron logs it (never throw — a throw inside the
    // tenant tx would roll back the observability row, the exact invisibility class that hid the pairing bug).
    return { inserted: 0, mapped_drivers: 0, unmapped_drivers: 0, driver_errors: 0, active_drivers: activeDrivers, error: `fetch:${String((err as Error)?.message ?? err)}` };
  }

  let inserted = 0;
  let mapped = 0;
  let unmapped = 0;
  let driverErrors = 0;
  let firstError: string | null = null; // HONEST: a committed row must never be success=false with a null error
  for (let i = 0; i < driverLogs.length; i++) {
    const dl = driverLogs[i];
    const localDriverId = localBySamsara.get(dl.driverId);
    if (!localDriverId) {
      unmapped += 1; // should be ~0 now that we only request the active driverIds
      continue;
    }
    mapped += 1;
    // Savepoint-isolate each driver's insert batch AND capture the real error (not swallow it): one bad log row
    // aborts only this driver's savepoint, the others + the sync-log row commit, and the reason is persisted.
    const sp = `hos_driver_${i}`;
    await client.query(`SAVEPOINT ${sp}`);
    try {
      for (const log of dl.logs) {
        const res = await client.query(
          `INSERT INTO hos.duty_status_events
             (operating_company_id, driver_id, unit_id, duty_status, started_at, ended_at, source, odometer_mi, location)
           VALUES ($1::uuid, $2::uuid, NULL, $3, $4::timestamptz, $5::timestamptz, 'samsara_eld', NULL, NULL)
           ON CONFLICT (operating_company_id, driver_id, duty_status, started_at, source) DO NOTHING`,
          [operatingCompanyId, localDriverId, mapDutyStatus(log.hosStatusType), log.startedAt, log.endedAt]
        );
        inserted += res.rowCount ?? 0;
      }
      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => undefined);
      driverErrors += 1;
      if (!firstError) firstError = `driver_insert:${String((err as Error)?.message ?? err)}`;
    }
  }
  // error is non-null whenever driver_errors > 0 — so the cron's success=(error==null && driver_errors===0) can
  // never commit a success=false row with a null reason.
  return { inserted, mapped_drivers: mapped, unmapped_drivers: unmapped, driver_errors: driverErrors, active_drivers: activeDrivers, error: firstError };
}
