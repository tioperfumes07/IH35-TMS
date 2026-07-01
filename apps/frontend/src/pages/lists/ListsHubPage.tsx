import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { getListsInventory, getListsQboSyncHealth, getListsRecentActivity, postForceListsQboSync } from "../../api/listsHub";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AllCatalogsMap, buildCatalogPath, listsDomainSectionId } from "./components/AllCatalogsMap";
import { DomainRibbon } from "./components/DomainRibbon";
import { ListsSubNav } from "./ListsSubNav";
import { QboSyncHealthCard } from "./components/QboSyncHealthCard";
import { RecentActivityCard } from "./components/RecentActivityCard";

// Pure scroll-position helpers (per pathname) so browser-back to the Lists hub restores where you
// were instead of snapping to the top of the mega-list. Storage-injected for unit testing.
export function listsScrollKey(pathname: string): string {
  return `lists-scroll:${pathname}`;
}
export function saveScrollPosition(storage: Pick<Storage, "setItem">, pathname: string, y: number): void {
  try {
    storage.setItem(listsScrollKey(pathname), String(Math.max(0, Math.round(y))));
  } catch {
    /* sessionStorage unavailable (private mode / SSR) — non-fatal */
  }
}
export function readScrollPosition(storage: Pick<Storage, "getItem">, pathname: string): number {
  try {
    const raw = storage.getItem(listsScrollKey(pathname));
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function ListsHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const inventoryQuery = useQuery({
    queryKey: ["lists-hub", "inventory", companyId],
    queryFn: () => getListsInventory(companyId),
    enabled: Boolean(companyId),
  });
  const activityQuery = useQuery({
    queryKey: ["lists-hub", "recent-activity", companyId],
    queryFn: () => getListsRecentActivity(companyId),
    enabled: Boolean(companyId),
  });
  const qboHealthQuery = useQuery({
    queryKey: ["lists-hub", "qbo-sync-health", companyId],
    queryFn: () => getListsQboSyncHealth(companyId),
    enabled: Boolean(companyId),
  });

  const forceSyncMutation = useMutation({
    mutationFn: () => postForceListsQboSync(companyId),
    onSuccess: () => pushToast("QBO full-sync trigger queued", "success"),
    onError: (error) => pushToast(String((error as Error).message || "Failed to start force sync"), "error"),
  });

  // On mount / navigation: deep-link ?domain=<key> wins and scrolls to that section; otherwise
  // restore the saved scroll offset for this pathname (browser-back friendliness).
  useEffect(() => {
    const domainParam = new URLSearchParams(location.search).get("domain");
    if (domainParam) {
      const el = document.getElementById(listsDomainSectionId(domainParam));
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
    }
    const y = readScrollPosition(window.sessionStorage, location.pathname);
    if (y > 0) window.scrollTo(0, y);
  }, [location.pathname, location.search]);

  // Persist scroll offset continuously + on unmount so it survives navigation away.
  useEffect(() => {
    const onScroll = () => saveScrollPosition(window.sessionStorage, location.pathname, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      saveScrollPosition(window.sessionStorage, location.pathname, window.scrollY);
      window.removeEventListener("scroll", onScroll);
    };
  }, [location.pathname]);

  function openCatalog(domain: string, catalogKey: string) {
    navigate(buildCatalogPath(domain, catalogKey));
  }

  function openDomainHub(domainKey: string) {
    navigate(`/lists/hub/${domainKey}`);
  }

  const inventory = inventoryQuery.data?.inventory ?? [];
  const activity = activityQuery.data?.activity ?? [];
  const health = qboHealthQuery.data?.health ?? [];

  return (
    <div className="space-y-4">
      <ListsSubNav />
      <PageHeader title="Lists & Catalogs" subtitle="Catalog inventory hub + QBO bidirectional sync health" />

      {inventoryQuery.isLoading ? <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading lists inventory...</div> : null}
      {!inventoryQuery.isLoading ? <DomainRibbon inventory={inventory} onCatalogClick={openCatalog} /> : null}

      <AllCatalogsMap onCatalogClick={openCatalog} onDomainClick={openDomainHub} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentActivityCard rows={activity} />
        <QboSyncHealthCard rows={health} onForceSync={() => forceSyncMutation.mutate()} syncing={forceSyncMutation.isPending} />
      </div>
    </div>
  );
}
