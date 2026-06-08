import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { HoverDropdown } from "../shared/HoverDropdown";
import { ReportFlyoutPanel } from "./ReportFlyoutPanel";

type CatalogCategory = {
  id: string;
  label: string;
  reports: Array<{ id: string; label: string; route: string; description: string }>;
};

async function fetchCatalog() {
  return apiRequest<{ categories: CatalogCategory[] }>("/api/reports/categories/catalog");
}

export function ReportCategoryHoverNav() {
  const navigate = useNavigate();
  const catalogQuery = useQuery({
    queryKey: ["reports", "category-catalog"],
    queryFn: fetchCatalog,
  });
  const categories = catalogQuery.data?.categories ?? [];

  return (
    <div className="overflow-x-auto border-b border-slate-200 bg-white px-2 py-1" data-testid="report-category-hover-nav">
      <div className="flex min-w-max gap-3">
        {categories.map((category) => (
          <HoverDropdown
            key={category.id}
            trigger={
              <span className="inline-flex items-center border-b-2 border-b-transparent px-1 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
                {category.label}
              </span>
            }
          >
            <ReportFlyoutPanel
              title={`${category.label} reports`}
              items={category.reports.map((r) => ({ id: r.id, label: r.label, hint: r.description }))}
              onSelect={(itemId) => {
                const report = category.reports.find((r) => r.id === itemId);
                if (report) navigate(report.route);
              }}
              footer="Click any report to open"
            />
          </HoverDropdown>
        ))}
      </div>
    </div>
  );
}
