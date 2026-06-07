import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ReportCard } from "../../components/reports/ReportCard";
import { ReportCategoryHoverNav } from "../../components/reports/ReportCategoryHoverNav";
import { apiRequest } from "../../api/client";
import { ReportsSubNav } from "./ReportsSubNav";

type CatalogCategory = {
  id: string;
  label: string;
  reports: Array<{ id: string; label: string; route: string; icon: string; description: string }>;
};

async function fetchCatalog() {
  return apiRequest<{ categories: CatalogCategory[] }>("/api/reports/categories/catalog");
}

export function ReportsHubPage() {
  const [search, setSearch] = useState("");
  const catalogQuery = useQuery({
    queryKey: ["reports", "category-catalog"],
    queryFn: fetchCatalog,
  });

  const categories = catalogQuery.data?.categories ?? [];
  const needle = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!needle) return categories;
    return categories
      .map((category) => ({
        ...category,
        reports: category.reports.filter(
          (r) => r.label.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle)
        ),
      }))
      .filter((c) => c.reports.length > 0);
  }, [categories, needle]);

  return (
    <div className="space-y-3" data-testid="reports-hub-page">
      <ReportsSubNav />
      <PageHeader title="Reports Hub" subtitle="WF-061 · 9 categories with hover-dropdown navigation" />
      <ReportCategoryHoverNav />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search reports…"
        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
        data-testid="reports-hub-search"
      />
      {filtered.map((category) => (
        <section key={category.id} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category.label}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {category.reports.map((report) => (
              <ReportCard
                key={report.id}
                id={report.id}
                label={report.label}
                description={report.description}
                route={report.route}
                icon={report.icon}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
