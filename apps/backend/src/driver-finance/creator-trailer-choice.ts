/**
 * LEAD 443.109 (owner, 2026-10-12: "that should have been fixed instantly and engine fixed") — a load the Settlement
 * Creator books is never born without its trailer. The signed settlement document decides, through the same recorded
 * choice Book / Edit Load use (dispatch/load-trailer-choice.ts, 443.107 item 3):
 *   - the draft names a fleet trailer (picked, or its printed number is a trailer this company owns or leases)
 *       -> { kind: "company" }  -> dispatch.load_assignment_history.new_trailer_id (driver bills + expense trigger read it)
 *   - the printed number is NOT a fleet trailer -> { kind: "customer" } (443.90 printed-trailer decision: a customer /
 *       shipper trailer, one dispatch.non_owned_trailers row per number)
 *   - the operator marked "No trailer (bobtail / power only)" -> { kind: "none" } (an explicit, recorded choice)
 *   - nothing at all -> null: the preview refuses (trailer_required) and the seed refuses to book the load.
 * LEAD 443.203 (20:22Z): the company settlement's LOAD table prints a trailer per load — a load row's printed trailer
 * decides that load (creatorLoadTrailerChoice); the settlement-level trailer decides loads whose row names none and the
 * expense documents (fuel / expense rows have no per-row trailer). Before, every load took the settlement-level trailer:
 * 5851's 13689 (customer trailer 10204) was born on fleet trailer 10209.
 */
import type { TrailerChoice } from "../dispatch/load-trailer-choice.js";
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const CREATOR_TRAILER_REQUIRED_MESSAGE =
  "Trailer: the settlement document names no trailer — pick the fleet trailer, type the trailer number printed on the document (a customer / shipper trailer is recorded as such), or mark \"No trailer (bobtail / power only)\" (trailer_required).";

/** The fleet trailer with this equipment number: owned or leased by the company, exactly one. */
async function fleetTrailerByNumber(client: Q, companyId: string, n: string): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.equipment
      WHERE upper(trim(equipment_number)) = upper(trim($2))
        AND (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
        AND deactivated_at IS NULL
      LIMIT 2`,
    [companyId, n],
  );
  return r.rows.length === 1 ? r.rows[0]!.id : null;
}

/**
 * The trailer choice a document makes from its PRINTED trailer number (or an explicit "no trailer"): a fleet trailer of
 * this company -> company; any other number -> customer / shipper trailer; none -> none; nothing -> null (no guessing).
 * Shared by the Settlement Creator and the historical CSV loads import (seed/csv-seed-import.ts, R443.161-G1).
 */
export async function printedTrailerChoice(
  client: Q,
  companyId: string,
  printedNumber: string | null | undefined,
  none: boolean,
): Promise<TrailerChoice | null> {
  const printed = printedNumber?.trim();
  if (printed) {
    const fleet = await fleetTrailerByNumber(client, companyId, printed);
    return fleet ? { kind: "company", equipment_id: fleet } : { kind: "customer", trailer_number: printed };
  }
  if (none) return { kind: "none" };
  return null;
}

/** The trailer choice the document makes for every load of this draft, or null when it makes none. */
export async function creatorTrailerChoice(client: Q, draft: SettlementCreatorDraft): Promise<TrailerChoice | null> {
  if (draft.trailer_id) return { kind: "company", equipment_id: draft.trailer_id };
  return printedTrailerChoice(client, draft.operating_company_id, draft.trailer_equipment_number, draft.trailer_none === true);
}

/** The trailer choice for ONE load of the draft: its own printed trailer when the row names one, else the settlement's. */
export async function creatorLoadTrailerChoice(
  client: Q,
  draft: SettlementCreatorDraft,
  load: { trailer_equipment_number?: string | null },
): Promise<TrailerChoice | null> {
  const printed = load.trailer_equipment_number?.trim();
  if (printed) return printedTrailerChoice(client, draft.operating_company_id, printed, false);
  return creatorTrailerChoice(client, draft);
}

/**
 * LEAD 443.110 G2 — the load's trailer TYPE comes from the same document decision (before this every Creator load was
 * booked DRY_VAN, book-load's default): a fleet trailer's own equipment type (Reefer -> REFRIGERATED_VAN, DryVan ->
 * DRY_VAN, Flatbed -> FLATBED); a customer / shipper trailer -> POWER_ONLY_CUSTOMER_TRAILER; none -> POWER_ONLY_NO_TRAILER.
 * Returns this company's active catalogs.load_trailer_equipment id. An unresolved fleet type or missing catalog
 * mapping refuses booking; silently taking book-load's DRY_VAN default would misrepresent the document.
 * Null is reserved for no choice (the caller's no-seeding / no-loads path; new loads separately require a choice).
 */
const EQUIPMENT_TYPE_TO_TRAILER_CODE: Record<string, string> = { reefer: "REFRIGERATED_VAN", dryvan: "DRY_VAN", flatbed: "FLATBED", lowboy: "LOWBOY" };

export async function creatorLoadTrailerEquipmentId(client: Q, companyId: string, choice: TrailerChoice | null): Promise<string | null> {
  if (!choice) return null;
  let code: string | null = null;
  if (choice.kind === "customer" || choice.kind === "interchange") code = "POWER_ONLY_CUSTOMER_TRAILER";
  else if (choice.kind === "none") code = "POWER_ONLY_NO_TRAILER";
  else {
    const t = (await client.query<{ equipment_type: string | null }>(
      `SELECT equipment_type FROM mdata.equipment WHERE id = $1::uuid
          AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)`,
      [choice.equipment_id, companyId],
    )).rows[0]?.equipment_type;
    code = EQUIPMENT_TYPE_TO_TRAILER_CODE[String(t ?? "").toLowerCase().replace(/[^a-z]/g, "")] ?? null;
  }
  if (!code) throw new SettlementCreatorError(
    "trailer_equipment_type_required",
    "Trailer: the selected fleet trailer has no supported equipment type. Set its actual equipment type before booking; no Dry Van default is allowed.",
  );
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.load_trailer_equipment WHERE operating_company_id = $1::uuid AND code = $2 AND is_active = true LIMIT 1`,
    [companyId, code],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new SettlementCreatorError(
    "trailer_equipment_catalog_missing",
    `Trailer: this company's active equipment catalog has no ${code} mapping. Configure the correct equipment type before booking; no Dry Van default is allowed.`,
  );
  return id;
}
