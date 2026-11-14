import {Link, useParams, useLocation, useSearchParams} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { useQuery } from "@tanstack/react-query";
import { InfoPopover } from "../../components/shared/InfoPopover";
import { LinkedBankTransactionsPanel } from "../../components/banking/LinkedBankTransactionsPanel";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { entityLabel } from "../../lib/entity-label";
import { resolveBackHref } from "../../lib/returnContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
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
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const dispHref = (target: string) => withReturnContext(target, originHref);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board13/14 — Dispatch drills attach ?ret=; Back must restore origin.
  const dispatchBackHref = resolveBackHref({ searchParams, pathname, fallback: "/dispatch" });
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
        <p className="text-xs text-gray-600">Missing load id.</p>
        <Link to={dispHref("/dispatch?view=loads")} className="text-xs text-[#1F2A44] underline">
          Open Dispatch loads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="load-banking-linkage-page">
      <PageHeader backHref={dispatchBackHref}
        title="Load · bank feed linkage"
        breadcrumb={["Dispatch", "Loads", entityLabel(loadNumber, id, "Load"), "Banking"]}
        actions={
          <>
          <InfoPopover label="About this page" align="right">
            Reverse Law §9 for this load. Persisted categorization tags only — draft Match/Categorize fields are not
            links. EntityLink <code className="text-xs">kind=&quot;load&quot;</code> opens the board at{" "}
            <code className="text-xs">/dispatch/loads/:id</code>; this page is the bank-feed reverse surface only.
          </InfoPopover>
          <EntityLinkOrTombstone
            kind="load"
            id={id}
            name={loadNumber}
            noun="Load"
            className="rounded-sm border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#0F1219] hover:bg-[#F7F8FA]"
          />
          </>
        }
      />
      {/* BANK-F7176: distinguish a failed canonical-label read from an honest historical tombstone. */}
      {loadQuery.isError ? (
        <ListErrorBanner
          message="Could not load the canonical load label. Bank links are still available below."
          onRetry={() => void loadQuery.refetch()}
        />
      ) : null}
      {companyId ? (
        <LinkedBankTransactionsPanel companyId={companyId} linkage={{ kind: "load_id", id }} />
      ) : (
        <BoardSection title="Linked bank transactions" testId="load-banking-linkage-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to load linked bank transactions.</p>
        </BoardSection>
      )}
    </div>
  );
}
