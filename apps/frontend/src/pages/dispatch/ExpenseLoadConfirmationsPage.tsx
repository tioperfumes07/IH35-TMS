/**
 * 443.288-C — Dispatch queue: Expense load confirmations (dispatcher confirms/changes proposed loads).
 */
import { Link } from "react-router-dom";
import { DispatchSubnav } from "../../components/dispatch/DispatchSubnav";
import { ExpenseLoadConfirmationsBoard } from "../../components/expenses/ExpenseLoadConfirmationsBoard";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function ExpenseLoadConfirmationsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  return (
    <div data-testid="expense-load-confirmations-page" className="mx-auto max-w-6xl space-y-4 p-4">
      {companyId ? <DispatchSubnav operatingCompanyId={companyId} /> : null}
      <PageHeader
        title="Expense load confirmations"
        subtitle="Every expense-to-load assignment is proposed by the engine and confirmed by a dispatcher or closer. Empty means confirmed — never hidden."
        actions={
          <Link to="/dispatch/load-costs" className="rounded-sm border px-3 py-1.5 text-xs">
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
