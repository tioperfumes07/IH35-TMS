import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
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

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

export async function syncSamsaraDriversMaster(client: PgClient, operatingCompanyId: string): Promise<SyncStats> {
  const errors: string[] = [];
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const token = decryptSamsaraSecret(readEncryptedToken(cfg));
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  const hasOc = await columnExists(client, "mdata", "drivers", "operating_company_id");
  const hasSid = await columnExists(client, "mdata", "drivers", "samsara_driver_id");
  if (!hasOc || !hasSid) {
    const msg = "missing_required_columns:mdata.drivers(operating_company_id|samsara_driver_id)";
    errors.push(msg);
    await writeSyncLog(client, {
      operatingCompanyId,
      syncKind: "drivers_master",
      success: false,
      rowsAdded: 0,
      rowsUpdated: 0,
      rowsRemoved: 0,
      errorMessage: msg,
    });
    return { added: 0, updated: 0, removed: 0, errors };
  }

  const drivers = await api.listDrivers();
  let added = 0;
  let updated = 0;

  for (const d of drivers) {
    const raw = d.raw;
    const name =
      typeof raw.name === "string"
        ? raw.name
        : `${typeof raw.firstName === "string" ? raw.firstName : ""} ${typeof raw.lastName === "string" ? raw.lastName : ""}`.trim();
    const { first, last } = splitName(name || "Driver");
    const phone =
      (typeof raw.phone === "string" && raw.phone.trim()) ||
      (typeof raw.mobilePhone === "string" && raw.mobilePhone.trim()) ||
      "000-000-0000";
    const email = typeof raw.email === "string" && raw.email.trim() ? raw.email.trim() : null;

    const existing = await client.query(
      `
        SELECT id FROM mdata.drivers
        WHERE operating_company_id = $1::uuid AND samsara_driver_id = $2
        LIMIT 1
      `,
      [operatingCompanyId, d.id]
    );
    if (existing.rows[0]) {
      await client.query(
        `
          UPDATE mdata.drivers
          SET first_name = $3,
              last_name = $4,
              phone = $5,
              email = COALESCE($6, email),
              updated_at = now()
          WHERE id = $2::uuid AND operating_company_id = $1::uuid
        `,
        [operatingCompanyId, String(existing.rows[0].id), first, last, phone, email]
      );
      updated += 1;
    } else {
      await client.query(
        `
          INSERT INTO mdata.drivers (
            operating_company_id,
            samsara_driver_id,
            first_name,
            last_name,
            phone,
            email,
            status
          ) VALUES ($1::uuid, $2, $3, $4, $5, $6, 'Active')
        `,
        [operatingCompanyId, d.id, first, last, phone, email]
      );
      added += 1;
    }
  }

  await writeSyncLog(client, {
    operatingCompanyId,
    syncKind: "drivers_master",
    success: errors.length === 0,
    rowsAdded: added,
    rowsUpdated: updated,
    rowsRemoved: 0,
    payload: { remote_count: drivers.length },
  });

  return { added, updated, removed: 0, errors };
}

export async function syncSamsaraVehiclesMaster(client: PgClient, operatingCompanyId: string): Promise<SyncStats> {
  const errors: string[] = [];
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const token = decryptSamsaraSecret(readEncryptedToken(cfg));
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  const hasEquipmentVehicleId = await columnExists(client, "mdata", "equipment", "samsara_vehicle_id");
  if (!hasEquipmentVehicleId) {
    const msg = "missing_required_column:mdata.equipment.samsara_vehicle_id";
    errors.push(msg);
    await writeSyncLog(client, {
      operatingCompanyId,
      syncKind: "assets_master",
      success: false,
      rowsAdded: 0,
      rowsUpdated: 0,
      rowsRemoved: 0,
      errorMessage: msg,
    });
    return { added: 0, updated: 0, removed: 0, errors };
  }
  const hasUnitsVehicleId = await columnExists(client, "mdata", "units", "samsara_vehicle_id");

  const vehicles = await api.listVehicles();
  let added = 0;
  let updated = 0;

  for (const v of vehicles) {
    const raw = v.raw;
    const vinRaw = typeof raw.vin === "string" && raw.vin.trim() ? raw.vin.trim() : null;
    const make = typeof raw.make === "string" ? raw.make : null;
    const model = typeof raw.model === "string" ? raw.model : null;
    const year =
      typeof raw.year === "number" && Number.isFinite(raw.year)
        ? Math.trunc(raw.year)
        : typeof raw.year === "string"
          ? parseInt(raw.year, 10)
          : null;
    const licensePlate = typeof raw.licensePlate === "string" ? raw.licensePlate : null;
    const licenseState = typeof raw.state === "string" ? raw.state : null;

    const existing = await client.query(
      `
        SELECT id FROM mdata.equipment
        WHERE samsara_vehicle_id = $2
          AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
        LIMIT 1
      `,
      [operatingCompanyId, v.id]
    );

    if (existing.rows[0]) {
      const equipId = String(existing.rows[0].id);
      await client.query(
        `
          UPDATE mdata.equipment
          SET vin = COALESCE($1, vin),
              make = COALESCE($2, make),
              model = COALESCE($3, model),
              year = COALESCE($4::int, year),
              license_plate = COALESCE($5, license_plate),
              license_state = COALESCE($6, license_state),
              updated_at = now()
          WHERE id = $7::uuid
        `,
        [
          vinRaw,
          make,
          model,
          Number.isFinite(year as number) ? year : null,
          licensePlate,
          licenseState,
          equipId,
        ]
      );
      updated += 1;
    } else {
      const numRes = await client.query(`SELECT gen_random_uuid() AS g`);
      const suffix = String(numRes.rows[0]?.g ?? v.id).replace(/-/g, "").slice(0, 8);
      const equipmentNumber = `SAM-${suffix}`;
      await client.query(
        `
          INSERT INTO mdata.equipment (
            equipment_number,
            vin,
            equipment_type,
            make,
            model,
            year,
            license_plate,
            license_state,
            owner_company_id,
            currently_leased_to_company_id,
            samsara_vehicle_id,
            status
          ) VALUES (
            $1,
            $2,
            'DryVan',
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::uuid,
            $8::uuid,
            $9,
            'InService'
          )
        `,
        [
          equipmentNumber,
          vinRaw,
          make,
          model,
          Number.isFinite(year as number) ? year : null,
          licensePlate,
          licenseState,
          operatingCompanyId,
          v.id,
        ]
      );
      added += 1;
    }

    // Keep /fleet/units views in sync when units support samsara_vehicle_id.
    if (hasUnitsVehicleId) {
      const existingUnit = await client.query(
        `
          SELECT id FROM mdata.units
          WHERE samsara_vehicle_id = $2
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
          LIMIT 1
        `,
        [operatingCompanyId, v.id]
      );

      if (existingUnit.rows[0]) {
        await client.query(
          `
            UPDATE mdata.units
            SET vin = COALESCE($1, vin),
                make = COALESCE($2, make),
                model = COALESCE($3, model),
                year = COALESCE($4::int, year),
                license_plate = COALESCE($5, license_plate),
                license_state = COALESCE($6, license_state),
                updated_at = now()
            WHERE id = $7::uuid
          `,
          [
            vinRaw,
            make,
            model,
            Number.isFinite(year as number) ? year : null,
            licensePlate,
            licenseState,
            String(existingUnit.rows[0].id),
          ]
        );
      } else {
        const numRes = await client.query(`SELECT gen_random_uuid() AS g`);
        const suffix = String(numRes.rows[0]?.g ?? v.id).replace(/-/g, "").slice(0, 8);
        const unitNumber = `SAM-${suffix}`;
        await client.query(
          `
            INSERT INTO mdata.units (
              unit_number,
              vin,
              make,
              model,
              year,
              license_plate,
              license_state,
              owner_company_id,
              currently_leased_to_company_id,
              samsara_vehicle_id,
              status
            ) VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8::uuid,
              $8::uuid,
              $9,
              'InService'
            )
          `,
          [unitNumber, vinRaw ?? `SAMVIN-${suffix}`, make, model, Number.isFinite(year as number) ? year : null, licensePlate, licenseState, operatingCompanyId, v.id]
        );
      }
    }
  }

  await writeSyncLog(client, {
    operatingCompanyId,
    syncKind: "assets_master",
    success: errors.length === 0,
    rowsAdded: added,
    rowsUpdated: updated,
    rowsRemoved: 0,
    payload: { remote_count: vehicles.length },
  });

  return { added, updated, removed: 0, errors };
}

// --- Real trailer sync (E2 / tracker 886) -----------------------------------
// Pulls Samsara's /fleet/trailers resource into mdata.equipment with the REAL
// equipment_type, replacing the phantom hardcoded-DryVan SAM-* rows that the
// vehicle (truck) sync above mis-writes. Trucks are intentionally left to the
// vehicle sync — not touched here.

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
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  const token = decryptSamsaraSecret(readEncryptedToken(cfg));
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg?.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  const hasEquipmentVehicleId = await columnExists(client, "mdata", "equipment", "samsara_vehicle_id");
  if (!hasEquipmentVehicleId) {
    const msg = "missing_required_column:mdata.equipment.samsara_vehicle_id";
    errors.push(msg);
    await writeSyncLog(client, {
      operatingCompanyId,
      syncKind: "trailers_master",
      success: false,
      rowsAdded: 0,
      rowsUpdated: 0,
      rowsRemoved: 0,
      errorMessage: msg,
    });
    return { added: 0, updated: 0, removed: 0, errors };
  }

  const trailers = await api.listTrailers();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const t of trailers) {
    const raw = t.raw;
    const make = typeof raw.make === "string" ? raw.make : null;
    const model = typeof raw.model === "string" ? raw.model : null;

    // Drop company cars/pickups even if Samsara's type mislabels them as trailers.
    if (isExcludedCompanyVehicle(make, model)) {
      skipped += 1;
      continue;
    }

    const vinRaw = typeof raw.vin === "string" && raw.vin.trim() ? raw.vin.trim() : null;
    const yearNum =
      typeof raw.year === "number" && Number.isFinite(raw.year)
        ? Math.trunc(raw.year)
        : typeof raw.year === "string"
          ? parseInt(raw.year, 10)
          : null;
    const year = Number.isFinite(yearNum as number) ? yearNum : null;
    const licensePlate = typeof raw.licensePlate === "string" ? raw.licensePlate : null;
    const licenseState =
      typeof raw.state === "string" ? raw.state : typeof raw.licenseState === "string" ? raw.licenseState : null;
    const equipmentType = mapSamsaraTrailerType(raw);
    const equipmentNumber = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;

    // Per-row SAVEPOINT: the sync runs inside one transaction, so a failed upsert
    // (e.g. a VIN that already exists under another entity) would otherwise abort
    // every following row. Roll back just this row and keep going.
    await client.query("SAVEPOINT trailer_row");
    try {
      // Match an existing row by Samsara id OR VIN — VIN match also UPGRADES a
      // phantom SAM-* DryVan to its real trailer identity in place.
      const existing = await client.query(
        `
          SELECT id FROM mdata.equipment
          WHERE (samsara_vehicle_id = $2 OR ($3::text IS NOT NULL AND vin = $3))
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
          LIMIT 1
        `,
        [operatingCompanyId, t.id, vinRaw]
      );

      if (existing.rows[0]) {
        await client.query(
          `
            UPDATE mdata.equipment
            SET equipment_number = COALESCE($1, equipment_number),
                vin = COALESCE($2, vin),
                equipment_type = $3,
                make = COALESCE($4, make),
                model = COALESCE($5, model),
                year = COALESCE($6::int, year),
                license_plate = COALESCE($7, license_plate),
                license_state = COALESCE($8, license_state),
                samsara_vehicle_id = $9,
                updated_at = now()
            WHERE id = $10::uuid
          `,
          [equipmentNumber, vinRaw, equipmentType, make, model, year, licensePlate, licenseState, t.id, String(existing.rows[0].id)]
        );
        updated += 1;
      } else {
        await client.query(
          `
            INSERT INTO mdata.equipment (
              equipment_number,
              vin,
              equipment_type,
              make,
              model,
              year,
              license_plate,
              license_state,
              owner_company_id,
              currently_leased_to_company_id,
              samsara_vehicle_id,
              status
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $9::uuid, $10, 'InService'
            )
          `,
          [equipmentNumber ?? `T-${t.id.slice(0, 8)}`, vinRaw, equipmentType, make, model, year, licensePlate, licenseState, operatingCompanyId, t.id]
        );
        added += 1;
      }
      await client.query("RELEASE SAVEPOINT trailer_row");
    } catch (e) {
      // Roll back just this row so the transaction stays usable; record the failure.
      await client.query("ROLLBACK TO SAVEPOINT trailer_row").catch(() => {});
      errors.push(`trailer_upsert_failed:${t.id}:${String((e as Error)?.message ?? e)}`);
    }
  }

  await writeSyncLog(client, {
    operatingCompanyId,
    syncKind: "trailers_master",
    success: errors.length === 0,
    rowsAdded: added,
    rowsUpdated: updated,
    rowsRemoved: 0,
    payload: { remote_count: trailers.length, excluded_company_vehicles: skipped },
  });

  return { added, updated, removed: 0, errors };
}
