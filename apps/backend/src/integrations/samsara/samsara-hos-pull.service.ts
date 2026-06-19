// GO-LIVE driver-activity Step 1: Samsara HOS/ELD pull.
//
// HOS/ELD scope is granted on the live token (confirmed: /fleet/hos/logs returns real per-driver
// drive-time), but HOS was only ever wired as webhook-projection (Samsara isn't pushing those events),
// so hos.duty_status_events is empty. This poll fills it: pull /fleet/hos/logs for a rolling window,
// map each Samsara driver -> mdata.drivers via integrations.samsara_drivers, and insert duty-status
// events idempotently (same ON CONFLICT shape as the webhook projector). This ONLY produces the data
// the 30-day inactivity FLAG reads; it never deactivates anyone.

import { withSavepoint, type SavepointQueryClient } from "../../auth/db.js";
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

// Resolve the Samsara driver to a local mdata.drivers id. Two mapping sources exist and they DRIFT:
// integrations.samsara_drivers (populated by the webhook/driver-import path) vs mdata.drivers.samsara_driver_id
// (the key the working vehicle->driver pairing uses, confirmed mapping all logged-in drivers live). HOS used to
// read ONLY the former, so when it was empty/stale every driver was "unmapped" and hos.duty_status_events stayed
// empty -> the board showed the 14h "fresh shift" default for everyone (fabricated compliance). Resolve via the
// import table first, then FALL BACK to the proven mdata.drivers key so HOS maps exactly the drivers the board pairs.
async function localDriverIdFor(client: PgClient, operatingCompanyId: string, samsaraDriverId: string): Promise<string | null> {
  const res = await client.query(
    `SELECT sd.local_driver_id::text AS local_driver_id
       FROM integrations.samsara_drivers sd
      WHERE sd.operating_company_id = $1::uuid AND sd.samsara_driver_id = $2
      LIMIT 1`,
    [operatingCompanyId, samsaraDriverId]
  );
  const row = res.rows[0] as { local_driver_id?: string | null } | undefined;
  if (row?.local_driver_id) return row.local_driver_id;
  // Fallback: the same key the vehicle->driver pairing resolves on (board-proven).
  const fb = await client.query(
    `SELECT d.id::text AS local_driver_id
       FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid AND d.samsara_driver_id = $2 AND d.deactivated_at IS NULL
      LIMIT 1`,
    [operatingCompanyId, samsaraDriverId]
  );
  const fbRow = fb.rows[0] as { local_driver_id?: string | null } | undefined;
  return fbRow?.local_driver_id ?? null;
}

export async function syncSamsaraHosLogs(
  client: PgClient,
  operatingCompanyId: string,
  windowHours = 48
): Promise<{ inserted: number; mapped_drivers: number; unmapped_drivers: number; driver_errors: number; error: string | null }> {
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
    driverLogs = await api.listHosLogs(start.toISOString(), end.toISOString());
  } catch (err) {
    // Network/timeout/parse failure: record + return so the cron logs it (never throw — a throw inside the
    // tenant tx would roll back the observability row, the exact invisibility class that hid the pairing bug).
    return { inserted: 0, mapped_drivers: 0, unmapped_drivers: 0, driver_errors: 0, error: `fetch:${String((err as Error)?.message ?? err)}` };
  }

  let inserted = 0;
  let mapped = 0;
  let unmapped = 0;
  let driverErrors = 0;
  for (let i = 0; i < driverLogs.length; i++) {
    const dl = driverLogs[i];
    const localDriverId = await localDriverIdFor(client, operatingCompanyId, dl.driverId);
    if (!localDriverId) {
      unmapped += 1;
      continue;
    }
    mapped += 1;
    // Savepoint-isolate each driver's insert batch: one bad log row (e.g. a malformed timestamp) aborts only
    // this driver's savepoint, not the whole tenant tx — so the other drivers' events + the sync-log row commit.
    const result = await withSavepoint<{ rows: number } | "error">(
      client as unknown as SavepointQueryClient,
      `hos_driver_${i}`,
      async () => {
        let rows = 0;
        for (const log of dl.logs) {
          const res = await client.query(
            `INSERT INTO hos.duty_status_events
               (operating_company_id, driver_id, unit_id, duty_status, started_at, ended_at, source, odometer_mi, location)
             VALUES ($1::uuid, $2::uuid, NULL, $3, $4::timestamptz, $5::timestamptz, 'samsara_eld', NULL, NULL)
             ON CONFLICT (operating_company_id, driver_id, duty_status, started_at, source) DO NOTHING`,
            [operatingCompanyId, localDriverId, mapDutyStatus(log.hosStatusType), log.startedAt, log.endedAt]
          );
          rows += res.rowCount ?? 0;
        }
        return { rows };
      },
      "error"
    );
    if (result === "error") driverErrors += 1;
    else inserted += result.rows;
  }
  return { inserted, mapped_drivers: mapped, unmapped_drivers: unmapped, driver_errors: driverErrors, error: null };
}
