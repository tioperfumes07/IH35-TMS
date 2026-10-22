/**
 * LEAD 443.219 (runtime audit F-r1): the pg driver had NO type parsers, so every bigint (COUNT(*), SUM(int), *_cents bigint)
 * arrived as a STRING — 228 client-side `a + row.x` sums in apps/backend/src would string-concatenate ("100" + "50" = "10050")
 * the moment one of them read a bigint column without Number() / ::int.
 * THE rule, registered once for the backend process (auth/db.ts, before any pool is built):
 *   - int8 (OID 20) → a JS number when it is a safe integer; a value beyond Number.MAX_SAFE_INTEGER stays its exact string
 *     (never a silently rounded number);
 *   - numeric (OID 1700) is deliberately NOT parsed: money in numeric(…,2) stays an exact decimal string — 1,727 call sites
 *     already coerce it on purpose, and a float parse would change every money value the API returns.
 */
import pg from "pg";

export const PG_INT8_OID = 20;

export function parseInt8(value: string | null): number | string | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : value;
}

let registered = false;
export function registerPgTypeParsers(): void {
  if (registered) return;
  // A test that mocks the pg module has no `types` registry — nothing to register there.
  const types = (pg as { types?: { setTypeParser?: (oid: number, fn: (v: string) => unknown) => void } }).types;
  if (!types?.setTypeParser) return;
  types.setTypeParser(PG_INT8_OID, parseInt8 as (v: string) => unknown);
  registered = true;
}
