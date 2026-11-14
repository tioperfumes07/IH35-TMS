import { resolveBackHref } from "../../lib/returnContext";
/**
 * 443.288-C — Dispatch queue: Expense load confirmations (dispatcher confirms/changes proposed loads).
 */
import {Link, useLocation, useSearchParams} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { DispatchSubnav } from "../../components/dispatch/DispatchSubnav";
import { ExpenseLoadConfirmationsBoard } from "../../components/expenses/ExpenseLoadConfirmationsBoard";
import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function ExpenseLoadConfirmationsPage() {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const dispHref = (target: string) => withReturnContext(target, originHref);
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board13/14 — Dispatch drills attach ?ret=; Back must restore origin.
  const dispatchBackHref = resolveBackHref({ searchParams, pathname, fallback: "/dispatch" });
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <BoardSection title="Expense load confirmations" testId="expense-load-confirmations-page-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
      </BoardSection>
    );
  }

  return (
    <div data-testid="expense-load-confirmations-page" className="mx-auto max-w-6xl space-y-4 p-4">
      <DispatchSubnav operatingCompanyId={companyId} />
      <PageHeader backHref={dispatchBackHref}
        title="Expense load confirmations"
        subtitle="Every expense-to-load assignment is proposed by the engine and confirmed by a dispatcher or closer. Empty means confirmed — never hidden."
        actions={
          <Link to={dispHref("/dispatch/load-costs")} className="rounded-sm border px-3 py-1.5 text-xs">
            Load costs
          </Link>
        }
      />
      <ExpenseLoadConfirmationsBoard
        operatingCompanyId={companyId}
        defaultStatus="proposed"
        testId="expense-load-confirmations-dispatch-board"
      />
    </div>
  );
}
