import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { legalContractsApi } from "../../api/legal-contracts";
import { legalTemplatesApi } from "../../api/legal-templates";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalModuleTabs } from "./LegalModuleTabs";

export function LegalLandingPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const templatesQuery = useQuery({
    queryKey: ["legal", "landing", "templates", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () =>
      legalTemplatesApi.list({
        operating_company_id: operatingCompanyId,
      }),
  });

  const contractsQuery = useQuery({
    queryKey: ["legal", "landing", "contracts", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () =>
      legalContractsApi.list({
        operating_company_id: operatingCompanyId,
      }),
  });

  const metrics = useMemo(() => {
    const templates = templatesQuery.data?.templates ?? [];
    const contracts = contractsQuery.data?.contracts ?? [];
    const now = Date.now();
    const recentSignedThreshold = now - 30 * 24 * 60 * 60 * 1000;
    const expiringSoonThreshold = now + 60 * 24 * 60 * 60 * 1000;
    // Contract token expiry defaults to 30 days; this card tracks "sent but not signed/voided" as actionable expiring queue.
    const expiringContracts = contracts.filter((row) => {
      if (!row.sent_at) return false;
      if (row.status === "signed_electronically" || row.status === "voided") return false;
      const sentAt = new Date(row.sent_at).getTime();
      const modeledExpiry = sentAt + 30 * 24 * 60 * 60 * 1000;
      return modeledExpiry <= expiringSoonThreshold;
    }).length;

    return {
      activeTemplates: templates.filter((row) => row.status === "active").length,
      pendingSignatures: contracts.filter((row) => row.status === "sent" || row.status === "viewed").length,
      recentlySigned: contracts.filter((row) => row.signed_at && new Date(row.signed_at).getTime() >= recentSignedThreshold).length,
      expiringContracts,
    };
  }, [contractsQuery.data?.contracts, templatesQuery.data?.templates]);

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Legal", "Contracts"]}
        title="Legal"
        subtitle="Contracts and compliance workflows"
        actions={
          <Button onClick={() => navigate("/legal/contracts?openSend=1")}>
            + Create Contract
          </Button>
        }
      />

      <LegalModuleTabs />

      {templatesQuery.isError || contractsQuery.isError ? (
        <ListErrorBanner
          message="Legal data could not be loaded."
          onRetry={() => { void templatesQuery.refetch(); void contractsQuery.refetch(); }}
        />
      ) : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {/* C8: every metric opens the list it was counted from. */}
        <DrillKpiCard size="md" label="Active Templates" value={metrics.activeTemplates} to="/legal/templates" />
        <DrillKpiCard size="md" label="Pending Signatures" value={metrics.pendingSignatures} to="/legal/contracts" />
        <DrillKpiCard size="md" label="Recently Signed (30d)" value={metrics.recentlySigned} to="/legal/contracts" />
        <DrillKpiCard size="md" label="Expiring Contracts (60d)" value={metrics.expiringContracts} to="/legal/contracts" />
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-gray-700">
        <div className="mb-2 font-semibold text-gray-900">Quick Actions</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate("/legal/contracts?openSend=1")}>
            Send Contract
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate("/legal/templates")}>
            Open Template Library
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate("/legal/attorney-review")}>
            Review Queue
          </Button>
        </div>
      </div>
    </div>
  );
}
