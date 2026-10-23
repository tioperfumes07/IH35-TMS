import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalHomeBoard } from "./components/LegalHomeBoard";
import { LegalModuleTabs } from "./LegalModuleTabs";

/**
 * ROUND 443.267 — board-faithful Legal Landing mounts LegalHomeBoard.
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Legal.dc.html
 * Keeps PageHeader + LegalModuleTabs; body is board sections (not DrillKpiCard reskin).
 */
export function LegalLandingPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        Select an operating company to view legal metrics.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
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

      <LegalHomeBoard companyId={companyId} />
    </div>
  );
}
