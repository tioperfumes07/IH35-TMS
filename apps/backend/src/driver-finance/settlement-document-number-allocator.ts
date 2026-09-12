/** Matches the local `DbClient` shape used throughout settlements-load-bookended.service.ts
 *  (and elsewhere in driver-finance) rather than importing the `pg` package directly. */
type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * P1 SETTLEMENT NUMBERING (Claude Lead, ROUND 18.3, Item A) — allocates the next
 * AlwaysTrack settlement document number for `operatingCompanyId`.
 *
 * MUST be called inside the SAME database transaction that stamps trip_closed_at /
 * locks the settlement (both call sites: settlements-load-bookended.service.ts's
 * closeTripForLoad + progressToAnchorLoad), so a crash or rollback before COMMIT never
 * burns a number, and two concurrent closes for the same company can never race to the
 * same value.
 *
 * LOCK CHOICE: a per-company Postgres advisory transaction lock
 * (`pg_advisory_xact_lock(hashtext(operatingCompanyId))`), not a dedicated allocator
 * row + `SELECT … FOR UPDATE`. There is no existing per-company sequence/counter row to
 * lock — `driver_settlements` rows themselves are the wrong lock target, because locking
 * one arbitrary existing row does not serialize against a concurrent close that is about
 * to UPDATE a *different* row. An advisory lock needs no new table or migration, is
 * scoped per company (never blocks a different company's close), and is released
 * automatically at COMMIT or ROLLBACK — it cannot leak across requests/connections.
 *
 * NUMBER SOURCE: MAX(source_document_ref::int) + 1 across ALL of the company's rows with
 * a numeric source_document_ref, regardless of status/voided/reversed. AlwaysTrack
 * document numbers are physical, sequential, pre-printed documents — once a number has
 * been issued (even to a settlement later voided/reversed/cancelled) it must never be
 * reissued to a different settlement. This intentionally does NOT match the narrower
 * WHERE clause on the partial unique index (which excludes voided/reversed/cancelled) —
 * that index enforces "at most one *live* settlement per number", not "never reuse a
 * number", and a voided settlement's own historical number stays retired forever.
 *
 * ONLY fills a NULL source_document_ref. Never overwrites a value a settlement already
 * carries — some settlements have their number entered directly (e.g. a company user
 * keying in the AlwaysTrack number by hand) rather than via this allocator, and that
 * value is authoritative once set.
 */
export async function allocateSettlementDocumentNumber(
  client: DbClient,
  operatingCompanyId: string,
): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [operatingCompanyId]);
  const { rows } = await client.query<{ next: string }>(
    `
      SELECT COALESCE(MAX(source_document_ref::int), 0) + 1 AS next
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND source_document_ref IS NOT NULL
        AND source_document_ref ~ '^[0-9]+$'
    `,
    [operatingCompanyId],
  );
  return String(rows[0]?.next ?? 1);
}

/**
 * Stamps `source_document_ref` on `settlementId` via the allocator above, but ONLY if
 * the row's current value is NULL (see "ONLY fills a NULL" above). Call this in the same
 * transaction as (and immediately after) the trip_closed_at/status UPDATE at each close
 * call site. No-op (returns null) if the row already has a number.
 */
export async function allocateSettlementDocumentNumberIfMissing(
  client: DbClient,
  settlementId: string,
  operatingCompanyId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ source_document_ref: string | null }>(
    `SELECT source_document_ref FROM driver_finance.driver_settlements WHERE id = $1::uuid FOR UPDATE`,
    [settlementId],
  );
  if (rows[0]?.source_document_ref) return null;
  const next = await allocateSettlementDocumentNumber(client, operatingCompanyId);
  await client.query(
    `UPDATE driver_finance.driver_settlements SET source_document_ref = $2, updated_at = now() WHERE id = $1::uuid`,
    [settlementId, next],
  );
  return next;
}
