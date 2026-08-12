import type { ListsModule } from "../../api/listsHub";
import { ModuleHeader } from "../../components/layout/ModuleHeader";
import { ComingSoonPage } from "../ComingSoonPage";
import { Link, useParams, useNavigate } from "react-router-dom";
import { DomainCatalogSection, buildCatalogPath, buildDomainModulePath, sortDomainsForDisplay } from "./components/AllCatalogsMap";

// domain.key -> ListsModule, same mapping DomainRowCountBadge uses so this hub's header count and the
// ribbon/map badges can never disagree.
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

// Per-domain Lists hub: renders ONLY the requested domain's catalogs, from the SAME DOMAIN_CONFIG
// source as the main hub (via sortDomainsForDisplay). Unknown domain keys fall back to ComingSoon,
// so this never dead-ends. Reaching a catalog from here and pressing browser-back returns to this
// hub (its own route), not the bottom of the mega-list.

export function DomainCatalogHubPage() {
  const { domain: domainKey } = useParams();
  const navigate = useNavigate();

  const domain = domainKey ? sortDomainsForDisplay().find((d) => d.key === domainKey) : undefined;
  if (!domain) {
    return <ComingSoonPage />;
  }

  function openCatalog(d: string, catalogKey: string) {
    navigate(buildCatalogPath(d, catalogKey));
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        backHref="/lists"
        breadcrumb={["Lists & Catalogs", domain.label]}
        title={`${domain.label} catalogs`}
        subtitle="Catalogs in this domain"
        countModule={DOMAIN_MODULE[domain.key]}
        actions={
          buildDomainModulePath(domain.key) ? (
            <Link
              to={buildDomainModulePath(domain.key)!}
              data-testid={`lists-domain-hub-open-module-${domain.key}`}
              className="rounded-sm border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Open {domain.label} module
            </Link>
          ) : null
        }
      />

      <div className="rounded-sm border border-slate-200 bg-white p-3">
        <div className="space-y-2">
          <DomainCatalogSection domain={domain} onCatalogClick={openCatalog} />
        </div>
      </div>
    </div>
  );
}
