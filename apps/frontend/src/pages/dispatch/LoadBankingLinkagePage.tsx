import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LinkedBankTransactionsPanel } from "../../components/banking/LinkedBankTransactionsPanel";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { entityLabel } from "../../lib/entity-label";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getLoad } from "../../api/loads";

/**
 * Reverse Law §9 for a load — bank feed rows tagged to this load.
 * Mounted at `/dispatch/loads/:id/banking` only.
 * EntityLink kind="load" stays on the canonical `/dispatch/loads/:id` (the Dispatch board opens
 * the drawer from that PATH param since C5). Never hijack that target with this surface.
 * Never hijack the load-detail EntityLink target with this surface.
 */
export function LoadBankingLinkagePage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const loadQuery = useQuery({
    queryKey: ["load-banking-linkage-label", companyId, id],
    queryFn: () => getLoad(id as string, companyId),
    enabled: Boolean(id && companyId),
  });
  const loadNumber = loadQuery.data?.load_number ?? null;

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
        breadcrumb={["Dispatch", "Loads", entityLabel(loadNumber, id, "Load"), "Banking"]}
        actions={
          <EntityLinkOrTombstone
            kind="load"
            id={id}
            name={loadNumber}
            noun="Load"
            className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          />
        }
      />
      {/* BANK-F7176: distinguish a failed canonical-label read from an honest historical tombstone. */}
      {loadQuery.isError ? (
        <ListErrorBanner
          message="Could not load the canonical load label. Bank links are still available below."
          onRetry={() => void loadQuery.refetch()}
        />
      ) : null}
      <p className="text-xs text-gray-600">
        Reverse Law §9 for this load. Persisted categorization tags only — draft Match/Categorize fields are not
        links. EntityLink <code className="text-[11px]">kind=&quot;load&quot;</code> opens the board at{" "}
        <code className="text-[11px]">/dispatch/loads/:id</code>; this page is the bank-feed reverse surface only.
      </p>
      {companyId ? (
        <LinkedBankTransactionsPanel companyId={companyId} linkage={{ kind: "load_id", id }} />
      ) : (
        <p className="text-sm text-gray-500">Select an operating company to load linked bank transactions.</p>
      )}
    </div>
  );
}
