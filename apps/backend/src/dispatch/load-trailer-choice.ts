/**
 * LEAD 443.107 item 3 (owner, 2026-10-12): every booked load records WHICH trailer moved it, by an explicit choice —
 * a company trailer from the equipment list, a customer / shipper trailer by its number, or no trailer (bobtail /
 * power only). Measured before this: 138 USMCA loads carried no physical trailer at all (Book Load accepted an
 * optional trailer and silently dropped a foreign one), so driver bills and expenses had nothing to inherit.
 *
 * ONE place decides and records it, so Book Load and Edit Load write it the same way:
 *  - company  -> the equipment must be an active trailer this company owns or leases; recorded on the real link
 *                dispatch.load_assignment_history.new_trailer_id (what load-trailer.sql.ts, the driver-bill
 *                writers and the expense trailer trigger read) + mdata.loads.trailer_source = 'company'.
 *  - customer -> the number names a dispatch.non_owned_trailers row (reused or created exactly as
 *                decidePrintedTrailers does: one per number and customer) + trailer_source = 'customer'.
 *  - interchange -> an existing dispatch.non_owned_trailers row of this company (GO-23 A1) + trailer_source = 'customer'.
 *  - none     -> trailer_source = 'none' (migration 202615790910): an explicit, recorded "no trailer", never a gap.
 */
import { z } from "zod";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const trailerChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("company"), equipment_id: z.string().uuid() }),
  z.object({ kind: z.literal("customer"), trailer_number: z.string().trim().min(1).max(40) }),
  z.object({ kind: z.literal("interchange"), non_owned_trailer_id: z.string().uuid() }),
  z.object({ kind: z.literal("none") }),
]);

export type TrailerChoice =
  | { kind: "company"; equipment_id: string }
  | { kind: "customer"; trailer_number: string }
  | { kind: "interchange"; non_owned_trailer_id: string }
  | { kind: "none" };

export type ResolvedTrailerChoice =
  | { kind: "company"; equipment_id: string }
  | { kind: "customer"; trailer_number: string }
  | { kind: "interchange"; non_owned_trailer_id: string }
  | { kind: "none" };

export type TrailerChoiceRefusal = { error: "trailer_choice_required" | "trailer_not_in_company_fleet" | "customer_trailer_number_required" | "interchange_trailer_not_found" };

/** Normalise a customer trailer number the way decidePrintedTrailers keys it (trimmed, upper case). */
export function normalizeTrailerNumber(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** Pure shape check — no database access. null = the choice is complete. */
export function trailerChoiceShapeRefusal(choice: TrailerChoice | null | undefined): TrailerChoiceRefusal | null {
  if (!choice) return { error: "trailer_choice_required" };
  if (!["company", "customer", "interchange", "none"].includes(choice.kind)) return { error: "trailer_choice_required" };
  if (choice.kind === "customer" && !normalizeTrailerNumber(choice.trailer_number)) return { error: "customer_trailer_number_required" };
  if (choice.kind === "company" && !choice.equipment_id) return { error: "trailer_choice_required" };
  if (choice.kind === "interchange" && !choice.non_owned_trailer_id) return { error: "trailer_choice_required" };
  return null;
}

/** PATCH may retain a recorded choice, but may not preserve an unresolved trailer gap. */
export async function requireRecordedTrailerChoice(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string,
  load: Record<string, unknown>,
): Promise<TrailerChoiceRefusal | null> {
  if (load.trailer_source === "none" && !load.non_owned_trailer_id) return null;
  if (load.trailer_source === "customer" && load.non_owned_trailer_id) {
    const resolved = await resolveTrailerChoice(client, operatingCompanyId, {
      kind: "interchange", non_owned_trailer_id: String(load.non_owned_trailer_id),
    });
    return resolved.ok ? null : resolved.refusal;
  }
  if (load.trailer_source === "company" && !load.non_owned_trailer_id) {
    const history = await client.query<{ new_trailer_id: string | null }>(
      // No JOIN to mdata.equipment: new_trailer_id is FK-bound to it (load_assignment_history_new_trailer_id_fkey) and the
      // history row is this company's (h.operating_company_id = $2), so the join filtered nothing — it only read another
      // entity's equipment row unscoped (verify-join-entity-scoped).
      `SELECT h.new_trailer_id::text FROM dispatch.load_assignment_history h
        WHERE h.load_id = $1::uuid AND h.operating_company_id = $2::uuid AND h.new_trailer_id IS NOT NULL
        ORDER BY h.created_at DESC, h.id DESC LIMIT 1`,
      [loadId, operatingCompanyId],
    );
    const trailerId = history.rows[0]?.new_trailer_id;
    // Retaining history is not a new assignment: later retirement/lease changes cannot erase a valid trip choice.
    if (trailerId) return null;
  }
  return { error: "trailer_choice_required" };
}

/**
 * Validate a choice against the company (read-only). A company trailer must be an active trailer the company owns
 * or currently leases — a foreign or deactivated trailer is refused, never silently dropped.
 */
export async function resolveTrailerChoice(
  client: DbClient,
  operatingCompanyId: string,
  choice: TrailerChoice | null | undefined,
): Promise<{ ok: true; choice: ResolvedTrailerChoice } | { ok: false; refusal: TrailerChoiceRefusal }> {
  const shape = trailerChoiceShapeRefusal(choice);
  if (shape) return { ok: false, refusal: shape };
  const c = choice as TrailerChoice;
  if (c.kind === "company") {
    const rows = (await client.query<{ id: string }>(
      `SELECT e.id::text
         FROM mdata.equipment e
        WHERE e.id = $1::uuid
          AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $2::uuid
          AND e.deactivated_at IS NULL
        LIMIT 1`,
      [c.equipment_id, operatingCompanyId],
    )).rows;
    if (!rows[0]) return { ok: false, refusal: { error: "trailer_not_in_company_fleet" } };
    return { ok: true, choice: { kind: "company", equipment_id: rows[0].id } };
  }
  if (c.kind === "interchange") {
    // GO-23 A1 interchange trailer: an existing dispatch.non_owned_trailers row of THIS company, not voided.
    const rows = (await client.query<{ id: string }>(
      `SELECT id::text FROM dispatch.non_owned_trailers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
      [c.non_owned_trailer_id, operatingCompanyId],
    )).rows;
    if (!rows[0]) return { ok: false, refusal: { error: "interchange_trailer_not_found" } };
    return { ok: true, choice: { kind: "interchange", non_owned_trailer_id: rows[0].id } };
  }
  if (c.kind === "customer") return { ok: true, choice: { kind: "customer", trailer_number: normalizeTrailerNumber(c.trailer_number) } };
  return { ok: true, choice: { kind: "none" } };
}

/** Record a resolved choice on the load (inside the caller's transaction). Returns what was recorded. */
export async function applyTrailerChoice(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    loadId: string;
    actorUserId: string;
    choice: ResolvedTrailerChoice;
    assignmentMethod: "full_form" | "manual_reassign";
  },
): Promise<{ trailer_source: "company" | "customer" | "none"; equipment_id: string | null; non_owned_trailer_id: string | null }> {
  const { operatingCompanyId: co, loadId, actorUserId, choice } = input;
  if (choice.kind === "company") {
    const prev = (await client.query<{ new_trailer_id: string | null }>(
      `SELECT new_trailer_id::text FROM dispatch.load_assignment_history
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND new_trailer_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [loadId, co],
    )).rows[0]?.new_trailer_id ?? null;
    if (prev !== choice.equipment_id) {
      await client.query(
        `INSERT INTO dispatch.load_assignment_history (
           operating_company_id, load_id, assignment_method, previous_trailer_id, new_trailer_id,
           assigned_by_user_id, warnings_acknowledged)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, '[]'::jsonb)`,
        [co, loadId, input.assignmentMethod, prev, choice.equipment_id, actorUserId],
      );
    }
    await client.query(
      `UPDATE mdata.loads SET trailer_source = 'company', non_owned_trailer_id = NULL, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND (trailer_source IS DISTINCT FROM 'company' OR non_owned_trailer_id IS NOT NULL)`,
      [loadId, co],
    );
    return { trailer_source: "company", equipment_id: choice.equipment_id, non_owned_trailer_id: null };
  }
  if (choice.kind === "interchange") {
    await client.query(
      `UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND (trailer_source IS DISTINCT FROM 'customer' OR non_owned_trailer_id IS DISTINCT FROM $3::uuid)`,
      [loadId, co, choice.non_owned_trailer_id],
    );
    return { trailer_source: "customer", equipment_id: null, non_owned_trailer_id: choice.non_owned_trailer_id };
  }
  if (choice.kind === "customer") {
    const customerId = (await client.query<{ customer_id: string | null }>(
      `SELECT customer_id::text FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [loadId, co],
    )).rows[0]?.customer_id ?? null;
    const existing = (await client.query<{ id: string }>(
      `SELECT id::text FROM dispatch.non_owned_trailers
        WHERE operating_company_id = $1::uuid AND upper(trailer_number) = $2 AND counterparty_type = 'customer'
          AND counterparty_id IS NOT DISTINCT FROM $3::uuid AND voided_at IS NULL
        LIMIT 1`,
      [co, choice.trailer_number, customerId],
    )).rows[0];
    const nid = existing?.id ?? (await client.query<{ id: string }>(
      `INSERT INTO dispatch.non_owned_trailers
         (operating_company_id, trailer_number, counterparty_type, counterparty_id, notes, is_active, is_sample_data, created_by_user_id)
       VALUES ($1::uuid, $2, 'customer', $3::uuid, $4, true, false, $5::uuid)
       RETURNING id::text`,
      [co, choice.trailer_number, customerId, "443.107: customer / shipper trailer chosen at Book / Edit Load", actorUserId],
    )).rows[0]!.id;
    await client.query(
      `UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND (trailer_source IS DISTINCT FROM 'customer' OR non_owned_trailer_id IS DISTINCT FROM $3::uuid)`,
      [loadId, co, nid],
    );
    return { trailer_source: "customer", equipment_id: null, non_owned_trailer_id: nid };
  }
  await client.query(
    `UPDATE mdata.loads SET trailer_source = 'none', non_owned_trailer_id = NULL, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
        AND (trailer_source IS DISTINCT FROM 'none' OR non_owned_trailer_id IS NOT NULL)`,
    [loadId, co],
  );
  return { trailer_source: "none", equipment_id: null, non_owned_trailer_id: null };
}
