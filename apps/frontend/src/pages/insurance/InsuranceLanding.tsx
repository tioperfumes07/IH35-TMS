import { PageHeader } from "../../components/forms/shared/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { InsuranceHomeBoard } from "./components/InsuranceHomeBoard";
import { InsuranceModuleTabs } from "./InsuranceModuleTabs";
import { V3 } from "../../design/v3-tokens";

/**
 * ROUND 9.4 Board 20 — docs/design/v3/Insurance.dc.html
 * PageHeader variant=v3 + NavyPageSubNav tabs + InsuranceHomeBoard (real summary data).
 */
export function InsuranceLanding() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <div
        className="min-w-0 space-y-3 overflow-x-hidden"
        data-testid="insurance-landing-page"
        data-v3-board="Insurance"
        style={{ lineHeight: "normal", fontFamily: V3.font }}
      >
        <PageHeader
          variant="v3"
          crumb="Safety › Compliance Docs & Monitoring › Insurance"
          title="Insurance"
          subtitle="Policies · fleet covered · claims · coverage gaps"
        />
        <BoardSection title="Insurance home" testId="insurance-landing-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view insurance metrics.</p>
        </BoardSection>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 space-y-3 overflow-x-hidden"
      data-testid="insurance-landing-page"
      data-v3-board="Insurance"
      style={{ lineHeight: "normal", fontFamily: V3.font }}
    >
      <PageHeader
        variant="v3"
        crumb="Safety › Compliance Docs & Monitoring › Insurance"
        title="Insurance"
        subtitle="Policies · fleet covered · claims · coverage gaps"
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
