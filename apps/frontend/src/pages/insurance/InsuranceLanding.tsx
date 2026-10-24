import { PageHeader } from "../../components/layout/PageHeader";
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
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        Select an operating company to view insurance metrics.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <PageHeader
        breadcrumb={["Insurance", "Landing"]}
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
