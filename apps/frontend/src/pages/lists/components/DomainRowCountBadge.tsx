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
  const { count, loading } = useModuleCount(module);
  return <span className={className}>{loading ? "…" : count}</span>;
}
