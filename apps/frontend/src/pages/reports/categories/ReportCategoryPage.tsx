import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { ReportCard } from "../../../components/reports/ReportCard";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { ReportsSubNav } from "../ReportsSubNav";
import { fetchReportCategoryCatalog } from "./catalog-api";

export function ReportCategoryPage({ categoryId }: { categoryId: string }) {
  const catalogQuery = useQuery({
    queryKey: ["reports", "category-catalog"],
    queryFn: fetchReportCategoryCatalog,
  });
  const category = catalogQuery.data?.categories?.find((value) => value.id === categoryId);

  return (
    <div className="space-y-3" data-testid={`reports-category-${categoryId}`}>
      <ReportsSubNav />
      <PageHeader
        title={category?.label ?? "Report category"}
        subtitle="Canonical report catalog"
        backHref="/reports/hub"
        breadcrumb={["Reports", category?.label ?? categoryId]}
      />
      {catalogQuery.isPending ? <p className="text-xs text-slate-500">Loading report category…</p> : null}
      {catalogQuery.isError ? (
        <ListErrorState
          title="Couldn't load report category"
          {...formatQueryErrorDetail(catalogQuery.error)}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : null}
      {!catalogQuery.isPending && !catalogQuery.isError && !category ? (
        <ListErrorState
          title="Report category not found"
          status={404}
          message={`No canonical report category exists for ${categoryId}.`}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : null}
      {category ? (
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
      ) : null}
    </div>
  );
}
