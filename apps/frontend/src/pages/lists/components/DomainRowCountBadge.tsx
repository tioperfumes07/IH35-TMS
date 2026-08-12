import type { ListsModule } from "../../../api/listsHub";
import { useModuleCount } from "../../../hooks/useModuleCount";

/**
 * #P3 parity — live count badge for mapped Lists domains. Domains without a backend count spec
 * intentionally render an unavailable marker: no badge is more honest than a fabricated zero.
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
  customers: "CUSTOMERS",
  vendors: "VENDORS",
  reference: "REFERENCE",
};

export function DomainRowCountBadge({ domain, className }: { domain: string; className?: string }) {
  const module = DOMAIN_MODULE[domain];
  const { count, loading, error, degraded, missingTables } = useModuleCount(module);
  if (loading) return <span className={className}>…</span>;
  if (!module || error || count == null) {
    return <span className={className} title={error ?? "Live count is not available for this domain"}>—</span>;
  }
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
