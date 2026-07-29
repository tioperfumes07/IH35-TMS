import type { ListsModule } from "../../../api/listsHub";
import { useModuleCount } from "../../../hooks/useModuleCount";

/**
 * #P3 parity — the single live count badge for a Lists domain. Both the Domain ribbon
 * (DomainModuleTab) and the All Catalogs map render their domain count from useModuleCount via this
 * source, so the two surfaces can never disagree (the original P3 bug: badge=live-rows vs map=static
 * catalog-types). Canonical metric = live catalog-row count (enforced by verify:header-counts).
 */
const DOMAIN_MODULE: Record<string, ListsModule> = {
  safety: "SAFETY",
  maintenance: "MAINTENANCE",
  dispatch: "DISPATCH",
  fuel: "FUEL",
  drivers: "DRIVERS",
  fleet: "FLEET",
  accounting: "ACCOUNTING",
  names_master: "NAMES_MASTER",
};

export function DomainRowCountBadge({ domain, className }: { domain: string; className?: string }) {
  const module = DOMAIN_MODULE[domain];
  const { count, loading, degraded, missingTables } = useModuleCount(module);
  if (loading) return <span className={className}>…</span>;
  // LST-F21: when a spec table is absent the count covers only the tables that exist. Marking it "+"
  // and naming the missing tables in the tooltip keeps a partial total from reading as a complete one.
  // The number is still shown — degrading to a dash would throw away a count that IS correct as far
  // as it goes.
  if (degraded) {
    return (
      <span className={className} title={`Partial count — not counted: ${missingTables.join(", ")}`}>
        {count}
        <span aria-hidden="true">+</span>
        <span className="sr-only"> (partial count; some tables are not present on this database)</span>
      </span>
    );
  }
  return <span className={className}>{count}</span>;
}
