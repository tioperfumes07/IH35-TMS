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
 * The document carries ONE trailer for the whole settlement (fuel / expense rows have no per-row trailer), so there is
 * no other source on the document to read.
 */
import type { TrailerChoice } from "../dispatch/load-trailer-choice.js";
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";

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

/** The trailer choice the document makes for every load of this draft, or null when it makes none. */
export async function creatorTrailerChoice(client: Q, draft: SettlementCreatorDraft): Promise<TrailerChoice | null> {
  if (draft.trailer_id) return { kind: "company", equipment_id: draft.trailer_id };
  const printed = draft.trailer_equipment_number?.trim();
  if (printed) {
    const fleet = await fleetTrailerByNumber(client, draft.operating_company_id, printed);
    return fleet ? { kind: "company", equipment_id: fleet } : { kind: "customer", trailer_number: printed };
  }
  if (draft.trailer_none === true) return { kind: "none" };
  return null;
}
