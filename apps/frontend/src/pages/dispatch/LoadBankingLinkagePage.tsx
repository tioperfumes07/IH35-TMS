import { Link, useParams } from "react-router-dom";
import { LinkedBankTransactionsPanel } from "../../components/banking/LinkedBankTransactionsPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

/**
 * EntityLink kind="load" lands on `/dispatch/loads/:id`.
 * Law §9 reverse: show bank feed rows tagged to this load (by-linkage), with a CTA to the board.
 * Replaces the prior silent redirect that erased reverse drill-through.
 */
export function LoadBankingLinkagePage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!id) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-600">Missing load id.</p>
        <Link to="/dispatch?view=loads" className="text-sm text-slate-700 underline">
          Open Dispatch loads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="load-banking-linkage-page">
      <PageHeader
        title="Load · bank feed linkage"
        breadcrumb={["Dispatch", "Loads", id.slice(0, 8)]}
        actions={
          <Link
            to={`/dispatch?load_id=${encodeURIComponent(id)}`}
            className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            Open on Dispatch board
          </Link>
        }
      />
      <p className="text-xs text-gray-600">
        Reverse Law §9 for EntityLink <code className="text-[11px]">kind=&quot;load&quot;</code>. Persisted
        categorization tags only — draft Match/Categorize fields are not links.
      </p>
      {companyId ? (
        <LinkedBankTransactionsPanel companyId={companyId} linkage={{ kind: "load_id", id }} />
      ) : (
        <p className="text-sm text-gray-500">Select an operating company to load linked bank transactions.</p>
      )}
    </div>
  );
}
