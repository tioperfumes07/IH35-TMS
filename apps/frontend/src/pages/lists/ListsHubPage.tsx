import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getListsInventory, getListsQboSyncHealth, getListsRecentActivity, postForceListsQboSync } from "../../api/listsHub";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AllCatalogsMap } from "./components/AllCatalogsMap";
import { DomainRibbon } from "./components/DomainRibbon";
import { ListsSubNav } from "./ListsSubNav";
import { QboSyncHealthCard } from "./components/QboSyncHealthCard";
import { RecentActivityCard } from "./components/RecentActivityCard";

export function ListsHubPage() {
  const navigate = useNavigate();
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

  function normalizeListsDomain(domain: string) {
    if (domain === "drivers") return "driver";
    return domain;
  }

  function openCatalog(domain: string, catalogKey: string) {
    const routeDomain = normalizeListsDomain(domain);
    if (catalogKey === "_create") {
      navigate(`/lists/${routeDomain}`);
      return;
    }
    if (domain === "dispatch") {
      const dispatchRouteMap: Record<string, string> = {
        "load-types": "/lists/dispatch/load-types",
        load_types: "/lists/dispatch/load-types",
        "detention-reasons": "/lists/dispatch/detention-reasons",
        detention_reasons: "/lists/dispatch/detention-reasons",
        "pickup-time-types": "/lists/dispatch/pickup-time-types",
        pickup_time_types: "/lists/dispatch/pickup-time-types",
        "additional-charges": "/lists/dispatch/additional-charges",
        additional_charges: "/lists/dispatch/additional-charges",
        "load-cancellation-reasons": "/lists/dispatch/load-cancellation-reasons",
        load_cancellation_reasons: "/lists/dispatch/load-cancellation-reasons",
      };
      const dispatchPath = dispatchRouteMap[catalogKey];
      if (dispatchPath) {
        navigate(dispatchPath);
        return;
      }
    }
    if (domain === "names_master") {
      navigate("/lists/names");
      return;
    }
    if (domain === "drivers") {
      const driversReferenceRouteMap: Record<string, string> = {
        "license-classes": "/lists/drivers/license-classes",
        endorsements: "/lists/drivers/endorsements",
        restrictions: "/lists/drivers/restrictions",
        "medical-card-status": "/lists/drivers/medical-card-status",
        "employment-status": "/lists/drivers/employment-status",
      };
      const driversReferencePath = driversReferenceRouteMap[catalogKey];
      if (driversReferencePath) {
        navigate(driversReferencePath);
        return;
      }
    }
    if (domain === "maintenance") {
      const maintenanceRouteMap: Record<string, string> = {
        "oem-parts-reference": "/lists/maintenance/oem-parts-reference",
      };
      const maintenancePath = maintenanceRouteMap[catalogKey];
      if (maintenancePath) {
        navigate(maintenancePath);
        return;
      }
    }
    navigate(`/lists/${routeDomain}/${catalogKey}`);
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

      <AllCatalogsMap onCatalogClick={openCatalog} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentActivityCard rows={activity} />
        <QboSyncHealthCard rows={health} onForceSync={() => forceSyncMutation.mutate()} syncing={forceSyncMutation.isPending} />
      </div>
    </div>
  );
}

