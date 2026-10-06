import { useLocation } from "react-router-dom";
import { useBreadcrumbClaimed } from "../../lib/breadcrumbOwner";
import { structuralCrumbsForPath, accountingFallbackCrumbs } from "../../lib/structuralBreadcrumb";
import { Breadcrumb } from "./Breadcrumb";

/**
 * ROUND 367.9 — one app-wide structural breadcrumb. Mounted in Shell.
 * R433 (U18): every route gets one. Accounting pages that do not render the AccountingSubNavWrapper
 * crumb (or any own breadcrumb) get the route-derived fallback; a page that renders its own breadcrumb
 * claims the slot so this one steps aside (never two). Derived from the route only.
 */
export function StructuralBreadcrumb() {
  const { pathname } = useLocation();
  const claimed = useBreadcrumbClaimed();
  const items = structuralCrumbsForPath(pathname) ?? accountingFallbackCrumbs(pathname);
  if (claimed || !items || items.length === 0) return null;
  return (
    <div className="mb-2 shrink-0" data-testid="structural-breadcrumb" data-structural-breadcrumb="true">
      <Breadcrumb items={items} skipClaim />
    </div>
  );
}
