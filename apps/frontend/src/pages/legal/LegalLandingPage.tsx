import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { legalContractsApi } from "../../api/legal-contracts";
import { legalTemplatesApi } from "../../api/legal-templates";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalModuleTabs } from "./LegalModuleTabs";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

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
        title="Legal"
        subtitle="Contracts and compliance workflows"
        actions={
          <Button onClick={() => navigate("/legal/contracts?openSend=1")}>
            + Create Contract
          </Button>
        }
      />

      <LegalModuleTabs activeTabId="contracts" />

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Templates" value={metrics.activeTemplates} />
        <StatCard label="Pending Signatures" value={metrics.pendingSignatures} />
        <StatCard label="Recently Signed (30d)" value={metrics.recentlySigned} />
        <StatCard label="Expiring Contracts (60d)" value={metrics.expiringContracts} />
      </div>

      <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
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
