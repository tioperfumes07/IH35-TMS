import { z } from "zod";

/** RFC-4122 UUID (any version) — load primary key. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Human load_number for GET detail / deeplink (mutations stay UUID-only).
 *
 * Canonical (GO-10 REV-B + GO-19): plain digits, e.g. "13561".
 * Legacy still on prod: `L-YYYYMMDD-NNNN` (cancelled USMCA L-20260901-0001)
 * and old mdata `L<TOKEN>-YYYYMMDD-NNNN`.
 */
export const LOAD_NUMBER_RE = /^(?:[0-9]{1,20}|L[\w-]{1,60})$/i;

/**
 * LV-DOCS-LOAD-DISPLAY-ID-DEEPLINK / LV-LOAD-REF-GET
 * Path param for load DETAIL reads: UUID or human load_number.
 * Do NOT reuse for PATCH/transition — those stay UUID-only.
 */
export const loadRefParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => UUID_RE.test(value) || LOAD_NUMBER_RE.test(value), {
      message: "Must be a load UUID or load_number",
    }),
});

/**
 * SQL predicate: match alias.id when $n is a UUID, else alias.load_number.
 * CRITICAL: Postgres does NOT short-circuit AND — `cond AND $n::uuid` still casts
 * a load_number and raises 22P02 (`invalid input syntax for type uuid: "L-…"`).
 * Live FAIL Devin healthz 59e4d6b after #8631. Use CASE so the ::uuid cast never runs
 * for non-UUID refs. Plain-digit load numbers must also skip the uuid cast.
 */
export function loadRefMatchSql(alias: string, paramIndex: number): string {
  return `(
    CASE
      WHEN $${paramIndex}::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ${alias}.id = $${paramIndex}::uuid
      ELSE false
    END
    OR ${alias}.load_number = $${paramIndex}
  )`;
}
