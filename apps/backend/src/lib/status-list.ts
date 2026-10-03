// U12 (owner UI register 2026-10-03) — "status is a multi-selector everywhere". One parser and one SQL builder for every
// list endpoint whose status filter becomes multi-select: the client sends ?status=a&status=b (a single ?status=a is
// still accepted), and the endpoint filters with ONE condition.
import { z } from "zod";

/** Query-param schema: one status or a repeated list of them -> string[] | undefined. */
export function statusListParam<T extends string>(allowed: readonly [T, ...T[]]) {
  return z
    .union([z.enum(allowed), z.array(z.enum(allowed))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? (v.length ? v : undefined) : [v]));
}

/**
 * SQL condition for a list of statuses (null when no filter). `bind` pushes a value and returns its placeholder, so the
 * helper fits both `$${params.length}` and `$${pi++}` styles.
 * `notVoidedPseudo` — on endpoints where "active" is a pseudo-status meaning "not voided" (credit memos, vendor credits),
 * pass the statuses it excludes; "active" is then OR'd with the literal statuses picked alongside it.
 */
export function statusListCondition(
  column: string,
  statuses: readonly string[] | undefined,
  bind: (value: unknown) => string,
  opts: { notVoidedPseudo?: { value: string; excludes: readonly string[] } } = {}
): string | null {
  if (!statuses || statuses.length === 0) return null;
  const parts: string[] = [];
  const pseudo = opts.notVoidedPseudo;
  const literal = pseudo ? statuses.filter((s) => s !== pseudo.value) : [...statuses];
  if (pseudo && statuses.includes(pseudo.value)) parts.push(`${column}::text <> ALL(${bind([...pseudo.excludes])}::text[])`);
  if (literal.length) parts.push(`${column}::text = ANY(${bind(literal)}::text[])`);
  return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
}
