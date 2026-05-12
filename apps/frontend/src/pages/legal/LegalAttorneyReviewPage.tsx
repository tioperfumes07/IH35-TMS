import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { legalTemplatesApi } from "../../api/legal-templates";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalModuleTabs } from "./LegalModuleTabs";

export function LegalAttorneyReviewPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["legal", "attorney-review", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () =>
      legalTemplatesApi.list({
        operating_company_id: operatingCompanyId,
        status: "pending_review",
      }),
  });

  const rows = query.data?.templates ?? [];

  return (
    <div className="space-y-3">
      <PageHeader title="Attorney Review" subtitle="Templates pending legal approval" />
      <LegalModuleTabs activeTabId="attorney-review" />

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Review Queue</div>
        {rows.length === 0 ? <div className="text-sm text-gray-500">No templates currently pending attorney review.</div> : null}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-gray-900">{row.display_name_en}</div>
                <div className="text-xs text-gray-500">
                  {row.template_code} · v{row.version} · submitted {row.submitted_for_review_at ? new Date(row.submitted_for_review_at).toLocaleString() : "—"}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/legal/templates/${row.id}`)}>
                Review Template
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
