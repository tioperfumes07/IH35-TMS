import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { resolveBackHref } from "../../lib/returnContext";
import { legalTemplatesApi, type LegalTemplateSummary } from "../../api/legal-templates";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { BoardSection } from "../../components/v3/BoardSection";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalModuleTabs } from "./LegalModuleTabs";

export function LegalPoliciesPage() {
  const navigate = useNavigate();
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const moneyHref = (target: string) => withReturnContext(target, originHref);
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board21 — honor ?ret= from Legal Home (fallback /legal).
  const policiesBackHref = resolveBackHref({ searchParams, pathname, fallback: "/legal" });
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
      {
        key: "display_name_en",
        label: "Template",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="legal_template"
            id={row.id}
            label={entityLabel(row.display_name_en, row.id, "Template")}
            data-testid={`legal-policies-template-${row.id}`}
          />
        ),
      },
      { key: "template_code", label: "Code", sortable: true, render: (row) => row.template_code },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      {
        key: "actions",
        label: "",
        alwaysVisible: true,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => navigate(moneyHref(`/legal/templates/${row.id}`))}>
            Open
          </Button>
        ),
      },
    ],
    [navigate],
  );

  if (!operatingCompanyId) {
    return (
      <BoardSection title="Legal Policies" testId="legal-policies-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
      </BoardSection>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader backHref={policiesBackHref} breadcrumb={["Legal", "Policies"]} title="Legal Policies" subtitle="Policy acknowledgments and governance" />
      <LegalModuleTabs />
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        {query.isError ? (
          <ListErrorState
            title="Couldn't load policy templates"
            status={0}
            message={(query.error as Error)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable appearance="board"
            title="Policy templates"
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
