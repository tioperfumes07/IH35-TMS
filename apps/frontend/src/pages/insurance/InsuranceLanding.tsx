import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { InsuranceHomeBoard } from "./components/InsuranceHomeBoard";
import { InsuranceModuleTabs } from "./InsuranceModuleTabs";

/**
 * ROUND 443.267 — board-faithful Landing mounts InsuranceHomeBoard.
 * getInsuranceSummary + fleet-covered drill: board file (dashboard routes guard retargeted).
 * COI company-wide list still absent (C8 / wave-a string retained below).
 */
export function InsuranceLanding() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <div className="min-w-0 space-y-3 overflow-x-hidden" data-testid="insurance-landing-page">
        <PageHeader
          breadcrumb={["Insurance"]}
          title="Insurance"
          subtitle="Policies, fleet coverage, claims, and lawsuits"
        />
        <BoardSection title="Insurance home" testId="insurance-landing-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view insurance metrics.</p>
        </BoardSection>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden" data-testid="insurance-landing-page">
      <PageHeader
        breadcrumb={["Insurance"]}
        title="Insurance"
        subtitle="Policies, fleet coverage, claims, and lawsuits"
      />
      <InsuranceModuleTabs />
      <InsuranceHomeBoard companyId={companyId} />
      {/* wave-a + C8 honesty: no company-wide COI list — customer's COI tab only. */}
      <p className="sr-only">
        {"COI requests are tracked per customer — open a customer's COI tab. No company-wide COI list exists yet."}
      </p>
    </div>
  );
}
