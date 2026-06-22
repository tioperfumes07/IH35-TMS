import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { GENERIC_CATALOG_REGISTRY, catalogNameToRoutePath } from "../../hooks/useCatalogQuery";
import { ListsSubNav } from "./ListsSubNav";

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
        routePath: catalogNameToRoutePath(definition.catalogName),
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
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Select an operating company to manage catalog rows.
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.domain} className="space-y-2 rounded border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">{group.label}</h2>
          <ul className="divide-y divide-slate-100">
            {group.catalogs.map((catalog) => (
              <li key={catalog.catalogName} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-900">{catalog.displayName}</div>
                  <div className="text-xs text-slate-500">{catalog.description}</div>
                </div>
                <Link
                  to={catalog.routePath}
                  className="rounded border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Open {catalog.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No factory catalogs registered yet.
        </div>
      ) : null}
    </div>
  );
}
