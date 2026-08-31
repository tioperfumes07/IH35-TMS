import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { legalTemplatesApi, type LegalTemplateSummary } from "../../api/legal-templates";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalModuleTabs } from "./LegalModuleTabs";

export function LegalPoliciesPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["legal", "policies", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () =>
      legalTemplatesApi.list({
        operating_company_id: operatingCompanyId,
        search: "policy",
      }),
  });

  const rows = query.data?.templates ?? [];

  const columns = useMemo<ParityColumn<LegalTemplateSummary>[]>(
    () => [
      { key: "display_name_en", label: "Template", sortable: true, render: (row) => row.display_name_en },
      { key: "template_code", label: "Code", sortable: true, render: (row) => row.template_code },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      {
        key: "actions",
        label: "",
        alwaysVisible: true,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => navigate(`/legal/templates/${row.id}`)}>
            Open
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div className="space-y-3">
      <PageHeader breadcrumb={["Legal", "Policies"]} title="Legal Policies" subtitle="Policy acknowledgments and governance" />
      <LegalModuleTabs />
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Policy Templates</div>
        {query.isError ? (
          <ListErrorState
            title="Couldn't load policy templates"
            status={0}
            message={(query.error as Error)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            // Settled-only empty (LIST-EMPTY-1 invariant): loading stays true while pending OR while a
            // refetch is in flight with zero current rows, so emptyText never flashes mid-fetch.
            loading={query.isPending || (query.isFetching && rows.length === 0)}
            storageKey="legal-policies"
            emptyText="No policy templates found. Create one from Templates."
          />
        )}
      </div>
    </div>
  );
}
