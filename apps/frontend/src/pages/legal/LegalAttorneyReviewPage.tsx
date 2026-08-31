import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { legalTemplatesApi, type LegalTemplateSummary } from "../../api/legal-templates";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalModuleTabs } from "./LegalModuleTabs";
import { ListErrorState } from "../../components/ListErrorState";

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

  const columns = useMemo<ParityColumn<LegalTemplateSummary>[]>(
    () => [
      { key: "display_name_en", label: "Template", sortable: true, render: (row) => row.display_name_en },
      { key: "template_code", label: "Code", sortable: true, render: (row) => row.template_code },
      { key: "version", label: "Version", sortable: true, render: (row) => String(row.version) },
      {
        key: "submitted_for_review_at",
        label: "Submitted",
        sortable: true,
        render: (row) => (row.submitted_for_review_at ? new Date(row.submitted_for_review_at).toLocaleString() : "—"),
      },
      {
        key: "actions",
        label: "",
        alwaysVisible: true,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => navigate(`/legal/templates/${row.id}`)}>
            Review Template
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div className="space-y-3">
      <PageHeader breadcrumb={["Legal", "Attorney Review"]} title="Attorney Review" subtitle="Templates pending legal approval" />
      <LegalModuleTabs />

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Review Queue</div>
        {query.isError ? (
          <ListErrorState
            title="Couldn't load attorney review queue"
            status={0}
            message={(query.error as Error)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            // Settled-only empty (LIST-EMPTY-1 invariant): see LegalPoliciesPage for the same pattern.
            loading={query.isPending || (query.isFetching && rows.length === 0)}
            storageKey="legal-attorney-review"
            emptyText="No templates currently pending attorney review."
          />
        )}
      </div>
    </div>
  );
}
