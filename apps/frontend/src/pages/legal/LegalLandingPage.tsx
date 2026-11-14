import { useNavigate , useLocation} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LegalHomeBoard } from "./components/LegalHomeBoard";
import { LegalModuleTabs } from "./LegalModuleTabs";

/**
 * ROUND 443.267 — board-faithful Legal Landing mounts LegalHomeBoard.
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Legal.dc.html
 * Keeps PageHeader + LegalModuleTabs; body is board sections (not DrillKpiCard reskin).
 */
export function LegalLandingPage() {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const moneyHref = (target: string) => withReturnContext(target, originHref);
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <BoardSection title="Legal" testId="legal-landing-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view legal metrics.</p>
      </BoardSection>
    );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden">
      <PageHeader
        breadcrumb={["Legal", "Contracts"]}
        title="Legal"
        subtitle="Contracts and compliance workflows"
        actions={
          <Button onClick={() => navigate(moneyHref("/legal/contracts?openSend=1"))}>
            + Create Contract
          </Button>
        }
      />

      <LegalModuleTabs />

      <LegalHomeBoard companyId={companyId} />
    </div>
  );
}
