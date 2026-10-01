import { resolveSamsaraApiToken } from "./samsara-token.js";
import { SamsaraClient } from "./samsara-client.js";
import type { PgClient } from "./samsara.service.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";

export type SyncStats = {
  added: number;
  updated: number;
  removed: number;
  errors: string[];
};

async function columnExists(client: PgClient, schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

async function writeSyncLog(
  client: PgClient,
  input: {
    operatingCompanyId: string;
    syncKind: string;
    success: boolean;
    rowsAdded: number;
    rowsUpdated: number;
    rowsRemoved: number;
    errorMessage?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  const exists = await client.query(`SELECT to_regclass('integrations.integration_sync_log') IS NOT NULL AS ok`);
  if (!exists.rows[0]?.ok) return;
  await client.query(
    `
      INSERT INTO integrations.integration_sync_log (
        operating_company_id,
        integration,
        sync_kind,
        finished_at,
        success,
        rows_added,
        rows_updated,
        rows_removed,
        error_message,
        payload
      ) VALUES ($1, 'samsara', $2, now(), $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.operatingCompanyId,
      input.syncKind,
      input.success,
      input.rowsAdded,
      input.rowsUpdated,
      input.rowsRemoved,
      input.errorMessage ?? null,
      JSON.stringify(input.payload ?? {}),
    ]
  );
}

function splitName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: "Samsara", last: "Driver" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? "Driver", last: "—" };
  return { first: parts[0] ?? "Driver", last: parts.slice(1).join(" ") || "—" };
}

/**
 * ROUND 306 / LEAD DECISION 2026-10-01 — Samsara master sync is LINK-ONLY.
 *
 * Measured before this rewrite: 96/96 vehicle+trailer runs failed in 24 h (units_vin_key /
 * equipment_equipment_number_key duplicates + deadlocks from two instances); the vehicle pass wrote every
 * Samsara VEHICLE into mdata.equipment as a 'DryVan' trailer (85 "SAM-" rows) and invented "SAM-" units;
 * the driver pass INSERTed a new driver (phone "000-000-0000") whenever no row carried the Samsara id --
 * the origin of the 32 Samsara-id -> two-driver splits -- and overwrote real names/phones hourly.
 *
 * Now, for drivers, vehicles and trailers alike:
 *  - match an EXISTING record by the Samsara id, else by its global natural key (VIN / equipment number,
 *    both unique), regardless of which company it belongs to -- so a record is never invisible and never
 *    re-inserted;
 *  - a record operated by ANOTHER company is left untouched (skipped, counted);
 *  - link: set the Samsara id when the row has none (a row already linked to a DIFFERENT id is a
 *    conflict: skipped, counted, never overwritten); fill EMPTY columns only from Samsara;
 *  - NEVER create a driver, unit or equipment row (master records are owned by the office) — an unmatched
 *    Samsara record is counted in the sync log payload;
 *  - one runner per company: pg_try_advisory_xact_lock, a second instance skips instead of deadlocking.
 */
async function takeSyncLock(client: PgClient, operatingCompanyId: string, kind: string): Promise<boolean> {
  const r = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok`, [`samsara_master_sync:${kind}:${operatingCompanyId}`]);
  return Boolean(r.rows[0]?.ok);
}

type LinkOutcome = "linked" | "already_linked" | "other_company" | "linked_to_other_samsara_id" | "no_local_record" | "excluded_company_vehicle" | "failed";

function bump(counts: Record<string, number>, k: LinkOutcome) {
  counts[k] = (counts[k] ?? 0) + 1;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function yearOf(v: unknown): number | null {
  const n = typeof v === "number" ? Math.trunc(v) : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function syncSamsaraDriversMaster(client: PgClient, operatingCompanyId: string): Promise<SyncStats> {
  const errors: string[] = [];
  if (!(await takeSyncLock(client, operatingCompanyId, "drivers"))) return { added: 0, updated: 0, removed: 0, errors: ["skipped_another_runner_holds_lock"] };
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null });
  const drivers = await api.listDrivers();
  const counts: Record<string, number> = {};
  let updated = 0;
  for (const d of drivers) {
    const raw = d.raw;
    const email = str(raw.email);
    const phone = str(raw.phone) ?? str(raw.mobilePhone);
    await client.query("SAVEPOINT driver_row");
    try {
      // The Samsara id on mdata.drivers, else the mirror's local link (a merged row resolves to its survivor).
      const found = await client.query(
        `SELECT d.id::text, d.operating_company_id::text AS oc, d.samsara_driver_id::text AS sid
           FROM mdata.drivers d
          WHERE d.samsara_driver_id = $2
             OR d.id = (SELECT COALESCE(m.merged_into_driver_id, m.id) FROM integrations.samsara_drivers sd
                          JOIN mdata.drivers m ON m.id = sd.local_driver_id
                         WHERE sd.operating_company_id = $1::uuid AND sd.samsara_driver_id = $2 AND sd.local_driver_id IS NOT NULL
                         LIMIT 1)
          ORDER BY (d.operating_company_id = $1::uuid) DESC, (d.merged_into_driver_id IS NULL) DESC
          LIMIT 1`,
        [operatingCompanyId, d.id]
      );
      const row = found.rows[0] as { id: string; oc: string; sid: string | null } | undefined;
      if (!row) bump(counts, "no_local_record");
      else if (row.oc !== operatingCompanyId) bump(counts, "other_company");
      else if (row.sid && row.sid !== d.id) bump(counts, "linked_to_other_samsara_id");
      else {
        const taken = row.sid ? 0 : Number((await client.query(
          `SELECT count(*) AS n FROM mdata.drivers WHERE operating_company_id = $1::uuid AND samsara_driver_id = $2 AND id <> $3::uuid`,
          [operatingCompanyId, d.id, row.id])).rows[0]?.n ?? 0);
        if (taken > 0) bump(counts, "linked_to_other_samsara_id");
        else {
          await client.query(
            `UPDATE mdata.drivers
                SET samsara_driver_id = COALESCE(samsara_driver_id, $2),
                    email = COALESCE(NULLIF(email, ''), $3),
                    phone = CASE WHEN phone IS NULL OR phone = '' OR phone = '000-000-0000' THEN COALESCE($4, phone) ELSE phone END,
                    updated_at = now()
              WHERE id = $1::uuid`,
            [row.id, d.id, email, phone]
          );
          bump(counts, row.sid ? "already_linked" : "linked");
          updated += 1;
        }
      }
      await client.query("RELEASE SAVEPOINT driver_row");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT driver_row").catch(() => {});
      bump(counts, "failed");
      errors.push(`driver_link_failed:${d.id}:${String((e as Error)?.message ?? e)}`);
    }
  }
  await writeSyncLog(client, {
    operatingCompanyId, syncKind: "drivers_master", success: errors.length === 0,
    rowsAdded: 0, rowsUpdated: updated, rowsRemoved: 0,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    payload: { remote_count: drivers.length, mode: "link_only", outcomes: counts },
  });
  return { added: 0, updated, removed: 0, errors };
}

export async function syncSamsaraVehiclesMaster(client: PgClient, operatingCompanyId: string): Promise<SyncStats> {
  const errors: string[] = [];
  if (!(await takeSyncLock(client, operatingCompanyId, "vehicles"))) return { added: 0, updated: 0, removed: 0, errors: ["skipped_another_runner_holds_lock"] };
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null });
  const vehicles = await api.listVehicles();
  const counts: Record<string, number> = {};
  let updated = 0;
  for (const v of vehicles) {
    const raw = v.raw;
    const vin = str(raw.vin);
    const make = str(raw.make);
    const model = str(raw.model);
    if (isExcludedCompanyVehicle(make, model)) { bump(counts, "excluded_company_vehicle"); continue; }
    await client.query("SAVEPOINT unit_row");
    try {
      // Vehicles are UNITS only -- never mdata.equipment (that wrote every truck in as a 'DryVan' trailer).
      const found = await client.query(
        `SELECT id::text, COALESCE(currently_leased_to_company_id, owner_company_id)::text AS oc, samsara_vehicle_id::text AS sid
           FROM mdata.units
          WHERE deactivated_at IS NULL AND (samsara_vehicle_id = $1 OR ($2::text IS NOT NULL AND vin = $2))
          ORDER BY (samsara_vehicle_id = $1) DESC NULLS LAST
          LIMIT 1`,
        [v.id, vin]
      );
      const row = found.rows[0] as { id: string; oc: string; sid: string | null } | undefined;
      if (!row) bump(counts, "no_local_record");
      else if (row.oc !== operatingCompanyId) bump(counts, "other_company");
      else if (row.sid && row.sid !== v.id) bump(counts, "linked_to_other_samsara_id");
      else {
        await client.query(
          `UPDATE mdata.units
              SET samsara_vehicle_id = COALESCE(samsara_vehicle_id, $2),
                  vin = COALESCE(NULLIF(vin, ''), $3),
                  make = COALESCE(NULLIF(make, ''), $4),
                  model = COALESCE(NULLIF(model, ''), $5),
                  year = COALESCE(year, $6::int),
                  license_plate = COALESCE(NULLIF(license_plate, ''), $7),
                  license_state = COALESCE(NULLIF(license_state, ''), $8),
                  updated_at = now()
            WHERE id = $1::uuid`,
          [row.id, v.id, vin, make, model, yearOf(raw.year), str(raw.licensePlate), str(raw.state)]
        );
        bump(counts, row.sid ? "already_linked" : "linked");
        updated += 1;
      }
      await client.query("RELEASE SAVEPOINT unit_row");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT unit_row").catch(() => {});
      bump(counts, "failed");
      errors.push(`unit_link_failed:${v.id}:${String((e as Error)?.message ?? e)}`);
    }
  }
  await writeSyncLog(client, {
    operatingCompanyId, syncKind: "assets_master", success: errors.length === 0,
    rowsAdded: 0, rowsUpdated: updated, rowsRemoved: 0,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    payload: { remote_count: vehicles.length, mode: "link_only", outcomes: counts },
  });
  return { added: 0, updated, removed: 0, errors };
}

type MdataEquipmentType =
  | "DryVan"
  | "Reefer"
  | "Flatbed"
  | "Tanker"
  | "Container"
  | "Chassis"
  | "StepDeck"
  | "Lowboy";

const TRAILER_TYPE_RULES: Array<[RegExp, MdataEquipmentType]> = [
  // "REEFER" and the recurring "REFEER" misspelling both map to Reefer.
  [/reef|refe+r|refrig/i, "Reefer"],
  [/low\s*boy/i, "Lowboy"],
  [/flat\s*bed/i, "Flatbed"],
  [/step\s*deck/i, "StepDeck"],
  [/tanker/i, "Tanker"],
  [/container|chassis/i, "Container"],
  [/van|dry/i, "DryVan"],
];

/** Map a Samsara trailer's free-text type hints to the mdata.equipment CHECK enum. Defaults to DryVan. */
export function mapSamsaraTrailerType(raw: Record<string, unknown>): MdataEquipmentType {
  const textHints = [raw.trailerType, raw.type, raw.equipmentType, raw.name, raw.model, raw.notes]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  const attrText = raw.attributes && typeof raw.attributes === "object" ? JSON.stringify(raw.attributes) : "";
  const hay = `${textHints} ${attrText}`;
  for (const [re, type] of TRAILER_TYPE_RULES) {
    if (re.test(hay)) return type;
  }
  return "DryVan";
}

// SCOPE LOCK (Jorge 2026-06-16): trailers ONLY. Exclude company cars/pickups by
// make/model — Samsara's Type can mislabel them (e.g. a Nissan Versa tagged
// "53' Flatbed"). Real trailers are make UTILITY/WABASH.
const EXCLUDED_VEHICLE_MAKES = ["nissan", "honda", "kia", "chevrolet", "chevy"];
const EXCLUDED_VEHICLE_MODELS = ["versa", "element", "rio", "soul", "ranger", "silverado"];

/** True when a Samsara row is a company car/pickup that must NOT be imported as a trailer. */
export function isExcludedCompanyVehicle(make: string | null, model: string | null): boolean {
  const mk = (make ?? "").trim().toLowerCase();
  const md = (model ?? "").trim().toLowerCase();
  if (EXCLUDED_VEHICLE_MAKES.some((x) => mk.includes(x))) return true;
  if (EXCLUDED_VEHICLE_MODELS.some((x) => md.includes(x))) return true;
  return false;
}

export async function syncSamsaraTrailersMaster(client: PgClient, operatingCompanyId: string): Promise<SyncStats> {
  const errors: string[] = [];
  if (!(await takeSyncLock(client, operatingCompanyId, "trailers"))) return { added: 0, updated: 0, removed: 0, errors: ["skipped_another_runner_holds_lock"] };
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null });
  const trailers = await api.listTrailers();
  const counts: Record<string, number> = {};
  let updated = 0;
  for (const t of trailers) {
    const raw = t.raw;
    const make = str(raw.make);
    const model = str(raw.model);
    if (isExcludedCompanyVehicle(make, model)) { bump(counts, "excluded_company_vehicle"); continue; }
    const vin = str(raw.vin);
    const equipmentNumber = str(raw.name);
    await client.query("SAVEPOINT trailer_row");
    try {
      const found = await client.query(
        `SELECT id::text, COALESCE(currently_leased_to_company_id, owner_company_id)::text AS oc, samsara_vehicle_id::text AS sid
           FROM mdata.equipment
          WHERE samsara_vehicle_id = $1 OR ($2::text IS NOT NULL AND vin = $2) OR ($3::text IS NOT NULL AND equipment_number = $3)
          ORDER BY (samsara_vehicle_id = $1) DESC NULLS LAST, ($2::text IS NOT NULL AND vin = $2) DESC
          LIMIT 1`,
        [t.id, vin, equipmentNumber]
      );
      const row = found.rows[0] as { id: string; oc: string; sid: string | null } | undefined;
      if (!row) bump(counts, "no_local_record");
      else if (row.oc !== operatingCompanyId) bump(counts, "other_company");
      else if (row.sid && row.sid !== t.id) bump(counts, "linked_to_other_samsara_id");
      else {
        await client.query(
          `UPDATE mdata.equipment
              SET samsara_vehicle_id = COALESCE(samsara_vehicle_id, $2),
                  vin = COALESCE(NULLIF(vin, ''), $3),
                  make = COALESCE(NULLIF(make, ''), $4),
                  model = COALESCE(NULLIF(model, ''), $5),
                  year = COALESCE(year, $6::int),
                  license_plate = COALESCE(NULLIF(license_plate, ''), $7),
                  license_state = COALESCE(NULLIF(license_state, ''), $8),
                  updated_at = now()
            WHERE id = $1::uuid`,
          [row.id, t.id, vin, make, model, yearOf(raw.year), str(raw.licensePlate), str(raw.state) ?? str(raw.licenseState)]
        );
        bump(counts, row.sid ? "already_linked" : "linked");
        updated += 1;
      }
      await client.query("RELEASE SAVEPOINT trailer_row");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT trailer_row").catch(() => {});
      bump(counts, "failed");
      errors.push(`trailer_link_failed:${t.id}:${String((e as Error)?.message ?? e)}`);
    }
  }
  await writeSyncLog(client, {
    operatingCompanyId, syncKind: "trailers_master", success: errors.length === 0,
    rowsAdded: 0, rowsUpdated: updated, rowsRemoved: 0,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    payload: { remote_count: trailers.length, mode: "link_only", outcomes: counts },
  });
  return { added: 0, updated, removed: 0, errors };
}
