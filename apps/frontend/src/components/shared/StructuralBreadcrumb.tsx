import { useLocation } from "react-router-dom";
import { structuralCrumbsForPath } from "../../lib/structuralBreadcrumb";
import { Breadcrumb } from "./Breadcrumb";

/**
 * ROUND 367.9 — one app-wide structural breadcrumb. Mounted in Shell.
 * Accounting is skipped (CC-2 AccountingSubNavWrapper). Derived from the route only.
 */
export function StructuralBreadcrumb() {
  const { pathname } = useLocation();
  const items = structuralCrumbsForPath(pathname);
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-2 shrink-0" data-testid="structural-breadcrumb" data-structural-breadcrumb="true">
      <Breadcrumb items={items} />
    </div>
  );
}
