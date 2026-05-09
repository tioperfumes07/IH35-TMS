import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getListsInventory, getListsQboSyncHealth, getListsRecentActivity, postForceListsQboSync } from "../../api/listsHub";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AllCatalogsMap } from "./components/AllCatalogsMap";
import { DomainRibbon } from "./components/DomainRibbon";
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

  function openCatalog(domain: string, catalogKey: string) {
    if (catalogKey === "_create") {
      navigate(`/lists/${domain}`);
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
      };
      const dispatchPath = dispatchRouteMap[catalogKey];
      if (dispatchPath) {
        navigate(dispatchPath);
        return;
      }
    }
    if (domain === "driver") {
      const driverRouteMap: Record<string, string> = {
        "pay-rate-templates": "/lists/driver/pay-rate-templates",
        pay_rate_templates: "/lists/driver/pay-rate-templates",
        "deduction-types": "/lists/driver/deduction-types",
        driver_deduction_types: "/lists/driver/deduction-types",
        "pay-types": "/lists/driver/pay-types",
        driver_pay_types: "/lists/driver/pay-types",
        "escrow-types": "/lists/driver/escrow-types",
        escrow_types: "/lists/driver/escrow-types",
      };
      const driverPath = driverRouteMap[catalogKey];
      if (driverPath) {
        navigate(driverPath);
        return;
      }
    }
    navigate(`/lists/${domain}/${catalogKey}`);
  }

  const inventory = inventoryQuery.data?.inventory ?? [];
  const activity = activityQuery.data?.activity ?? [];
  const health = qboHealthQuery.data?.health ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Lists & Catalogs" subtitle="Catalog inventory hub + QBO bidirectional sync health" />

      {inventoryQuery.isLoading ? <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading lists inventory...</div> : null}
      {!inventoryQuery.isLoading ? <DomainRibbon inventory={inventory} onCatalogClick={openCatalog} /> : null}

      <AllCatalogsMap inventory={inventory} onCatalogClick={openCatalog} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentActivityCard rows={activity} />
        <QboSyncHealthCard rows={health} onForceSync={() => forceSyncMutation.mutate()} syncing={forceSyncMutation.isPending} />
      </div>
    </div>
  );
}

