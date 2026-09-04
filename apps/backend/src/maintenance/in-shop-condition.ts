/**
 * Canonical maintenance condition: a unit is in shop iff it has a non-void,
 * non-terminal work order in the viewed operating company.
 *
 * Keep every Fleet/Dispatch reader on this SQL predicate so "In shop" and
 * "Awaiting/available" cannot disagree about the same unit.
 */
export function openWorkOrderPredicateSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error("invalid_sql_alias");
  }
  return `${alias}.voided_at IS NULL AND ${alias}.status NOT IN ('complete', 'cancelled')`;
}
