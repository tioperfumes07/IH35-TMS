import { useParams, useNavigate, Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ComingSoonPage } from "../ComingSoonPage";
import { DomainCatalogSection, buildCatalogPath, sortDomainsForDisplay } from "./components/AllCatalogsMap";

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
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/lists" className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold text-slate-600 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400">
          <span aria-hidden="true">←</span> Lists &amp; Catalogs
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-700">{domain.label}</span>
      </div>

      <PageHeader title={`${domain.label} catalogs`} subtitle="Catalogs in this domain" />

      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="space-y-2">
          <DomainCatalogSection domain={domain} onCatalogClick={openCatalog} />
        </div>
      </div>
    </div>
  );
}
