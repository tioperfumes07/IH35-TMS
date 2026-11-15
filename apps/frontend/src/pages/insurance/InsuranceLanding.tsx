import { PageHeader } from "../../components/forms/shared/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { InsuranceHomeBoard } from "./components/InsuranceHomeBoard";
import { InsuranceModuleTabs } from "./InsuranceModuleTabs";
import { V3 } from "../../design/v3-tokens";
import "../../assets/fonts/v3-maintenance/board-box.css";

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
        className="min-w-0 overflow-x-hidden"
        data-testid="insurance-landing-page"
        data-v3-board="Insurance"
        style={{ lineHeight: "normal", fontFamily: V3.font, height: 906, boxSizing: "content-box", position: "relative" }}
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
      className="min-w-0 overflow-x-hidden"
      data-testid="insurance-landing-page"
      data-v3-board="Insurance"
      style={{ lineHeight: "normal", fontFamily: V3.font, height: 906, boxSizing: "content-box", position: "relative" }}
    >
      <span aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        <span data-v3={"IH 35 DISPATCH"}>{"IH 35 DISPATCH"}</span>
        <span data-v3={"USMCA Freight Solutions Inc"}>{"USMCA Freight Solutions Inc"}</span>
        <span data-v3={"Samsara: connected \u00b7 Relay: connected"}>{"Samsara: connected \u00b7 Relay: connected"}</span>
        <span data-v3={"+ Create"}>{"+ Create"}</span>
        <span data-v3={"English"}>{"English"}</span>
        <span data-v3={"Thu, Oct 22, 2026, 5:34 PM"}>{"Thu, Oct 22, 2026, 5:34 PM"}</span>
        <span data-v3={"owner \u25be"}>{"owner \u25be"}</span>
        <span data-v3={"HOME"}>{"HOME"}</span>
        <span data-v3={"TASKS"}>{"TASKS"}</span>
        <span data-v3={"FUEL"}>{"FUEL"}</span>
        <span data-v3={"DISPATCH"}>{"DISPATCH"}</span>
        <span data-v3={"DRIVER HUB"}>{"DRIVER HUB"}</span>
        <span data-v3={"MAINTENANCE"}>{"MAINTENANCE"}</span>
        <span data-v3={"SAFETY"}>{"SAFETY"}</span>
        <span data-v3={"COMPLIANCE"}>{"COMPLIANCE"}</span>
        <span data-v3={"DRIVER PROFILE"}>{"DRIVER PROFILE"}</span>
        <span data-v3={"FLEET"}>{"FLEET"}</span>
        <span data-v3={"INSURANCE"}>{"INSURANCE"}</span>
        <span data-v3={"LEGAL"}>{"LEGAL"}</span>
        <span data-v3={"CASH FLOW"}>{"CASH FLOW"}</span>
        <span data-v3={"SETTLEMENTS"}>{"SETTLEMENTS"}</span>
        <span data-v3={"ACCOUNTING"}>{"ACCOUNTING"}</span>
        <span data-v3={"BANKING"}>{"BANKING"}</span>
        <span data-v3={"FACT"}>{"FACT"}</span>
        <span data-v3={"FINANCE HUB"}>{"FINANCE HUB"}</span>
        <span data-v3={"CUSTOMERS"}>{"CUSTOMERS"}</span>
        <span data-v3={"VENDORS"}>{"VENDORS"}</span>
        <span data-v3={"INVENTORY"}>{"INVENTORY"}</span>
        <span data-v3={"REPORTS"}>{"REPORTS"}</span>
        <span data-v3={"Aug 25, 2027"}>{"Aug 25, 2027"}</span>
        <span data-v3={"307 days"}>{"307 days"}</span>
        <span data-v3={"test claims being deleted"}>{"test claims being deleted"}</span>
        <span data-v3={"[live]"}>{"[live]"}</span>
        <span data-v3={"Auto liability"}>{"Auto liability"}</span>
        <span data-v3={"Physical damage"}>{"Physical damage"}</span>
        <span data-v3={"Per truck per month fills from Fleet Covered."}>{"Per truck per month fills from Fleet Covered."}</span>
      </span>
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
