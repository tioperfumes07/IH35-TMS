import { z } from "zod";

/** RFC-4122 UUID (any version) — load primary key. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server-minted load_number shapes seen on prod:
 * - Canonical Book Load: `L-YYYYMMDD-NNNN` (e.g. L-20260811-0032)
 * - Legacy mdata create path: `LUSMCAFREIGHT-YYYYMMDD-NNNN`
 * Keep mutations UUID-only; GET detail accepts these human refs for deeplinks.
 */
const LOAD_NUMBER_RE = /^L[\w-]{1,60}$/i;

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
 * Never cast a non-UUID string to uuid (would 22P02).
 */
export function loadRefMatchSql(alias: string, paramIndex: number): string {
  return `(
    ($${paramIndex}::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND ${alias}.id = $${paramIndex}::uuid)
    OR ${alias}.load_number = $${paramIndex}
  )`;
}
