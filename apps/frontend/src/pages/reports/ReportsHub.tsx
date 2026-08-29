import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ReportCard } from "../../components/reports/ReportCard";
import { ReportCategoryHoverNav } from "../../components/reports/ReportCategoryHoverNav";
import { ReportsSubNav } from "./ReportsSubNav";
import { EntityLink } from "../../components/shared/EntityLink";
import { fetchReportCategoryCatalog } from "./categories/catalog-api";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

export function ReportsHubPage() {
  const [search, setSearch] = useState("");
  const catalogQuery = useQuery({
    queryKey: ["reports", "category-catalog"],
    queryFn: fetchReportCategoryCatalog,
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
      <PageHeader title="Reports Hub" subtitle="9 categories with hover-dropdown navigation" />
      <ReportCategoryHoverNav />
      <input
        type="search"
        aria-label="Search reports"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search reports…"
        className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
        data-testid="reports-hub-search"
      />
      {catalogQuery.isError ? (
        // GO-0028: a failed catalog fetch used to render zero cards with no error message --
        // the whole Reports Hub just looked broken/empty instead of reporting the failure.
        <ListErrorState
          title="Couldn't load the report catalog"
          status={0}
          message={userFacingApiError(catalogQuery.error, "Failed to load reports")}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : null}
      {filtered.map((category) => (
        <section key={category.id} className="space-y-2">
          <EntityLink
            kind="report_category"
            id={category.id}
            label={category.label}
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-[#1f2a44] hover:underline"
          />
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
