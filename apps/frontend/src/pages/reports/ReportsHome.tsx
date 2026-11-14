/**
 * FINAL-3 row 40 — Reports Home: rebuilt to v3 board, no layered sections.
 * v3 spec: docs/design/v3/Reports.dc.html
 * All content (sidebar, category panel, management rows Rule 07, automation, saved) is inside ReportsHomeBoard.
 */
import { useNavigate , useLocation} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { ReportsHomeBoard } from "./components/ReportsHomeBoard";

export function ReportsHomePage() {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const moneyHref = (target: string) => withReturnContext(target, originHref);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {/* R1 — title before navy Reports navigation. */}
      <PageHeader
        title="Reports"
        subtitle="Choose a domain category, then open a report to run"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate(moneyHref("/reports/custom"))}>+ Custom report</Button>
            <Button variant="secondary" onClick={() => navigate(moneyHref("/reports/scheduled"))}>Schedule</Button>
          </div>
        }
      />
      <ReportsSubNav />
      {companyId ? (
        <ReportsHomeBoard companyId={companyId} />
      ) : (
        <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#4B5563]">
          Select an operating company to view reports.
        </div>
      )}
    </div>
  );
}
