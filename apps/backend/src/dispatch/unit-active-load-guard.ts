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
export const ACTIVE_UNIT_STATUSES = [
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;

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
export async function assertUnitNotActiveOnAnotherLoad(
  client: QueryableClient,
  input: { operating_company_id: string; unit_id: string | null | undefined; exclude_load_id?: string | null }
): Promise<void> {
  if (!input.unit_id) return;
  const res = await client.query<{ id: string; load_number: string | null }>(
    `
      SELECT id, load_number
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND assigned_unit_id = $2::uuid
        AND soft_deleted_at IS NULL
        AND status = ANY($3::mdata.load_status_enum[])
        ${input.exclude_load_id ? "AND id <> $4::uuid" : ""}
      LIMIT 1
    `,
    input.exclude_load_id
      ? [input.operating_company_id, input.unit_id, ACTIVE_UNIT_STATUSES, input.exclude_load_id]
      : [input.operating_company_id, input.unit_id, ACTIVE_UNIT_STATUSES]
  );
  const conflict = res.rows[0];
  if (conflict) {
    throw new UnitAlreadyActiveOnLoadError(conflict.id, conflict.load_number ?? null);
  }
}
