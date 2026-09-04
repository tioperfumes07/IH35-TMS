import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { GENERIC_CATALOG_REGISTRY } from "../../hooks/useCatalogQuery";
import { buildCatalogPath, DOMAIN_CONFIG } from "./components/AllCatalogsMap";
import { ListsSubNav } from "./ListsSubNav";

// Factory-only namespace (CATALOG-2). Used ONLY when DOMAIN_CONFIG has no live hub card for the
// same catalogKey — otherwise Open must hit the bespoke /lists/:domain/:key page (CoA, Items, …)
// so create chrome + data path never diverge from the main Lists hub (LST-F3352).
function factoryRoutePath(domain: string, catalogKey: string): string {
  return `/lists/catalogs/${domain}/${catalogKey}`;
}

function hubDomainForRegistry(domain: string): string {
  return domain === "driver" ? "drivers" : domain;
}

/** Prefer the live Lists hub / bespoke route when DOMAIN_CONFIG already owns this catalog. */
export function catalogIndexOpenPath(domain: string, catalogKey: string): string {
  const hubDomain = hubDomainForRegistry(domain);
  const domainCfg = DOMAIN_CONFIG.find((d) => d.key === hubDomain);
  const liveOnHub = domainCfg?.catalogs.some((c) => c.catalogKey === catalogKey && c.live);
  if (liveOnHub) return buildCatalogPath(hubDomain, catalogKey);
  return factoryRoutePath(domain, catalogKey);
}

type DomainGroup = {
  domain: string;
  label: string;
  catalogs: Array<{
    catalogName: string;
    displayName: string;
    routePath: string;
    description: string;
  }>;
};

const DOMAIN_LABELS: Record<string, string> = {
  fleet: "Fleet",
  fuel: "Fuel",
  dispatch: "Dispatch",
  maintenance: "Maintenance",
  accounting: "Accounting",
  safety: "Safety",
  driver: "Driver",
  drivers: "Drivers",
};

export function CatalogIndex() {
  const { selectedCompanyId } = useCompanyContext();
  const companyReady = Boolean(selectedCompanyId);

  const groups = useMemo(() => {
    const byDomain = new Map<string, DomainGroup>();
    for (const definition of Object.values(GENERIC_CATALOG_REGISTRY)) {
      const existing = byDomain.get(definition.domain) ?? {
        domain: definition.domain,
        label: DOMAIN_LABELS[definition.domain] ?? definition.domain,
        catalogs: [],
      };
      existing.catalogs.push({
        catalogName: definition.catalogName,
        displayName: definition.displayName,
        routePath: catalogIndexOpenPath(definition.domain, definition.catalogKey),
        description: `Generic CRUD for ${definition.catalogName}`,
      });
      byDomain.set(definition.domain, existing);
    }
    return Array.from(byDomain.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  return (
    <div className="space-y-4">
      <ListsSubNav />
      <PageHeader
        title="Catalog Index"
        subtitle="Factory-backed catalogs using the generic CRUD framework (CATALOG-2)"
      />

      {!companyReady ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-4 text-xs text-slate-700">
          Select an operating company to manage catalog rows.
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.domain} className="space-y-2 rounded-sm border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold text-slate-800">{group.label}</h2>
          <ul className="divide-y divide-slate-100">
            {group.catalogs.map((catalog) => (
              <li key={catalog.catalogName} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-900">{catalog.displayName}</div>
                  <div className="text-xs text-slate-500">{catalog.description}</div>
                </div>
                <Link
                  to={catalog.routePath}
                  className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Open {catalog.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className="rounded-sm border border-slate-200 bg-white p-4 text-xs text-slate-500">
          No factory catalogs registered yet.
        </div>
      ) : null}
    </div>
  );
}
