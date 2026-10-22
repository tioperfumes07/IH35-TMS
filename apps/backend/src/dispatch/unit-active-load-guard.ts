/**
 * NEW-02 (owner urgent live report 2026-09-07): unit T152 was found double-dispatched — two
 * loads (13572, 13575) both in `dispatched` status on the same `assigned_unit_id` simultaneously.
 * Root cause: none of the write paths that set `mdata.loads.assigned_unit_id` (book-load create,
 * quick-assign, quicksave reassign, the generic load-edit PATCH, or the office loads.routes.ts
 * PATCH) ever checked whether the incoming unit was already active on a DIFFERENT load. Only a
 * plain (non-unique) index exists on assigned_unit_id (db/migrations/0034_loads_schema.sql) — no
 * DB-level backstop either.
 *
 * This is the shared application-level check, called by every write path that assigns a unit to
 * a load, BEFORE the write. The permanent DB-level backstop (a partial unique index on
 * assigned_unit_id WHERE status IN (...active...) AND soft_deleted_at IS NULL) is a migration and
 * must be authored by a migration-authorized lane (CC-2 is barred from db/migrations/*.sql by
 * verify-migration-lane-band.mjs) — handed off separately. This check is the real, immediate
 * protection; the DB constraint is defense-in-depth against a future write path skipping this call.
 *
 * ACTIVE_UNIT_STATUSES is the exact "truck is physically out with this load" set — deliberately
 * excludes delivered_pending_docs/completed_docs_received (delivery has happened, unit is free;
 * trucks legitimately carry a backlog of many loads sitting in that status waiting on paperwork,
 * per the owner's own framing of this exact class of report) and every draft/terminal/cancelled
 * status.
 */
// LEAD 443.244 (owner 2026-10-22 2:10 PM CT: "remember we might book a load in advance"): a truck holds ONE load IN MOTION
// plus any number of advance bookings (assigned / assigned_not_dispatched). Only a load in motion occupies the truck, so this
// set is the in-motion set: an advance booking is never refused, and dispatching it while another load is still in motion
// is (the DB backstop, migration 202616150100, applies the same set at COMMIT).
export const ACTIVE_UNIT_STATUSES = [
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;

/** Advance bookings: held by the truck as its NEXT load(s), never a conflict while another load is in motion. */
export const ADVANCE_UNIT_STATUSES = ["assigned", "assigned_not_dispatched"] as const;

export class UnitAlreadyActiveOnLoadError extends Error {
  readonly code = "unit_already_active_on_load";
  readonly conflictingLoadId: string;
  readonly conflictingLoadNumber: string | null;

  constructor(conflictingLoadId: string, conflictingLoadNumber: string | null) {
    super(
      `unit is already active on load ${conflictingLoadNumber ?? conflictingLoadId} — unassign it there first`
    );
    this.conflictingLoadId = conflictingLoadId;
    this.conflictingLoadNumber = conflictingLoadNumber;
  }
}

type QueryableClient = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

/**
 * Throws UnitAlreadyActiveOnLoadError if `unitId` is already assigned_unit_id on some OTHER
 * (soft-delete-excluded, active-status) load in the same operating company. Callers must run this
 * inside the same transaction as the write it's guarding (pass the transactional client), then
 * proceed to write only if this resolves without throwing — never TOCTOU across two connections.
 * `excludeLoadId` is the load currently being written (a load keeping its own already-assigned
 * unit is not a conflict with itself).
 */
/**
 * LEAD 443.209 (20:32Z ruling, moved from Codex): the next leg of the SAME tour is not an overlap when it picks up after
 * the prior leg's scheduled delivery. Measured 10-21: 13694 (T148, Avenel NJ pickup 10-20) is the TR leg after 13688
 * (T148, delivers Swedesboro NJ 10-19, still dispatched in AlwaysTrack) and was refused "unit already active on 13688".
 * A conflicting load is excused ONLY when it is on this tour (non-null) AND every one of its stops has a scheduled time
 * AND the latest of those ends at or before this leg's pickup. No stop time on record -> still a conflict (never assumed).
 * The DB trigger mdata.refuse_overlapping_unit_assignment (migration 202616050700) applies the same rule.
 */
export type SameTourNextLeg = { tour_id: string | null | undefined; pickup_at: string | null | undefined };

export async function assertUnitNotActiveOnAnotherLoad(
  client: QueryableClient,
  input: { operating_company_id: string; unit_id: string | null | undefined; exclude_load_id?: string | null; same_tour_next_leg?: SameTourNextLeg | null }
): Promise<void> {
  if (!input.unit_id) return;
  const values: unknown[] = [input.operating_company_id, input.unit_id, ACTIVE_UNIT_STATUSES];
  let excludeSql = "";
  if (input.exclude_load_id) {
    values.push(input.exclude_load_id);
    excludeSql = `AND l.id <> $${values.length}::uuid`;
  }
  let sameTourSql = "";
  const leg = input.same_tour_next_leg;
  if (leg?.tour_id && leg.pickup_at) {
    values.push(leg.tour_id, leg.pickup_at);
    const t = values.length - 1;
    sameTourSql = `
        AND NOT (
          l.tour_id = $${t}::uuid
          AND EXISTS (SELECT 1 FROM mdata.load_stops s0 WHERE s0.load_id = l.id)
          AND NOT EXISTS (
            SELECT 1 FROM mdata.load_stops s1
             WHERE s1.load_id = l.id
               AND COALESCE(s1.appointment_end_at, s1.appointment_start_at, s1.scheduled_arrival_at) IS NULL
          )
          AND (SELECT max(COALESCE(s2.appointment_end_at, s2.appointment_start_at, s2.scheduled_arrival_at))
                 FROM mdata.load_stops s2 WHERE s2.load_id = l.id) <= $${t + 1}::timestamptz
        )`;
  }
  const res = await client.query<{ id: string; load_number: string | null }>(
    `
      SELECT l.id, l.load_number
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status = ANY($3::mdata.load_status_enum[])
        ${excludeSql}${sameTourSql}
      LIMIT 1
    `,
    values
  );
  const conflict = res.rows[0];
  if (conflict) {
    throw new UnitAlreadyActiveOnLoadError(conflict.id, conflict.load_number ?? null);
  }
}
