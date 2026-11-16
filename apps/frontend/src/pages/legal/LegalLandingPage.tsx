import { useNavigate , useLocation} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { PageHeader } from "../../components/forms/shared/PageHeader";
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
    // docs/design/v3/Legal.dc.html — the board root, so the board box model + live reader reach it.
    <div className="min-w-0 overflow-x-hidden" data-v3-board="Legal" style={{ lineHeight: "normal", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Legal.dc.html header: crumb "Legal › Contracts", ← Back · Legal 700 18px · subtitle, navy "+ Create Contract". */}
      <PageHeader
        variant="v3"
        crumb="Legal › Contracts"
        title="Legal"
        subtitle="Contracts and compliance workflows"
        actions={
          <button
            type="button"
            data-testid="legal-create-contract"
            onClick={() => navigate(moneyHref("/legal/contracts?openSend=1"))}
            style={{ height: 28, boxSizing: "content-box", padding: "0 12px", display: "inline-flex", alignItems: "center", borderRadius: 6, border: "none", background: "#13233F", color: "#fff", font: "600 12px Inter, ui-sans-serif, system-ui, sans-serif", cursor: "pointer", lineHeight: "normal" }}
          >
            + Create Contract
          </button>
        }
      />

      <LegalModuleTabs />

      <LegalHomeBoard companyId={companyId} />
    </div>
  );
}
