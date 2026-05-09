import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getListsInventory, getListsQboSyncHealth, getListsRecentActivity, postForceListsQboSync } from "../../api/listsHub";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AllCatalogsMap } from "./components/AllCatalogsMap";
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
    if (domain === "maintenance") {
      const maintenanceRouteMap: Record<string, string> = {
        "failure-codes": "/lists/maintenance/failure-codes",
        maintenance_failure_codes: "/lists/maintenance/failure-codes",
        "labor-codes": "/lists/maintenance/labor-codes",
        maintenance_labor_codes: "/lists/maintenance/labor-codes",
        parts: "/lists/maintenance/parts",
        maintenance_parts: "/lists/maintenance/parts",
        "priority-levels": "/lists/maintenance/priority-levels",
        maintenance_priority_levels: "/lists/maintenance/priority-levels",
        "service-tasks": "/lists/maintenance/service-tasks",
        maintenance_service_tasks: "/lists/maintenance/service-tasks",
        "shop-locations": "/lists/maintenance/shop-locations",
        maintenance_shop_locations: "/lists/maintenance/shop-locations",
        vendors: "/lists/maintenance/vendors",
        maintenance_vendors: "/lists/maintenance/vendors",
        "work-order-statuses": "/lists/maintenance/work-order-statuses",
        work_order_statuses: "/lists/maintenance/work-order-statuses",
      };
      const maintenancePath = maintenanceRouteMap[catalogKey];
      if (maintenancePath) {
        navigate(maintenancePath);
        return;
      }
    }
    if (domain === "fuel") {
      const fuelRouteMap: Record<string, string> = {
        "card-types": "/lists/fuel/card-types",
        fuel_card_types: "/lists/fuel/card-types",
        "exception-types": "/lists/fuel/exception-types",
        fuel_exception_types: "/lists/fuel/exception-types",
        "station-brands": "/lists/fuel/station-brands",
        fuel_station_brands: "/lists/fuel/station-brands",
        "stop-reason-codes": "/lists/fuel/stop-reason-codes",
        fuel_stop_reason_codes: "/lists/fuel/stop-reason-codes",
        "mpg-bands": "/lists/fuel/mpg-bands",
        mpg_bands: "/lists/fuel/mpg-bands",
        "expensive-states": "/lists/fuel/expensive-states",
        expensive_states: "/lists/fuel/expensive-states",
        "tax-jurisdictions": "/lists/fuel/tax-jurisdictions",
        fuel_tax_jurisdictions: "/lists/fuel/tax-jurisdictions",
      };
      const fuelPath = fuelRouteMap[catalogKey];
      if (fuelPath) {
        navigate(fuelPath);
        return;
      }
    }
    if (domain === "accounting") {
      const accountingRouteMap: Record<string, string> = {
        "chart-of-accounts": "/lists/accounting/chart-of-accounts",
        chart_of_accounts: "/lists/accounting/chart-of-accounts",
        classes: "/lists/accounting/classes",
        "payment-terms": "/lists/accounting/payment-terms",
        payment_terms: "/lists/accounting/payment-terms",
        "posting-templates": "/lists/accounting/posting-templates",
        posting_templates: "/lists/accounting/posting-templates",
        "journal-entry-types": "/lists/accounting/journal-entry-types",
        journal_entry_types: "/lists/accounting/journal-entry-types",
        "qbo-categories": "/lists/accounting/qbo-categories",
        qbo_categories: "/lists/accounting/qbo-categories",
        items: "/lists/accounting/items",
        "account-role-bindings": "/lists/accounting/account-role-bindings",
        account_role_bindings: "/lists/accounting/account-role-bindings",
      };
      const accountingPath = accountingRouteMap[catalogKey];
      if (accountingPath) {
        navigate(accountingPath);
        return;
      }
    }
    if (domain === "fleet") {
      const fleetRouteMap: Record<string, string> = {
        "tractor-statuses": "/lists/fleet/tractor-statuses",
        tractor_statuses: "/lists/fleet/tractor-statuses",
        "trailer-statuses": "/lists/fleet/trailer-statuses",
        trailer_statuses: "/lists/fleet/trailer-statuses",
        "condition-codes": "/lists/fleet/condition-codes",
        asset_condition_codes: "/lists/fleet/condition-codes",
        "equipment-types": "/lists/fleet/equipment-types",
        equipment_types: "/lists/fleet/equipment-types",
        "tire-positions": "/lists/fleet/tire-positions",
        tire_positions: "/lists/fleet/tire-positions",
        "ownership-types": "/lists/fleet/ownership-types",
        unit_ownership_types: "/lists/fleet/ownership-types",
      };
      const fleetPath = fleetRouteMap[catalogKey];
      if (fleetPath) {
        navigate(fleetPath);
        return;
      }
    }
    navigate(`/lists/${domain}/${catalogKey}`);
  }

  const activity = activityQuery.data?.activity ?? [];
  const health = qboHealthQuery.data?.health ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Lists & Catalogs" subtitle="Catalog inventory hub + QBO bidirectional sync health" />
      {inventoryQuery.isError || activityQuery.isError || qboHealthQuery.isError ? (
        <ListErrorBanner
          onRetry={() => {
            void Promise.all([inventoryQuery.refetch(), activityQuery.refetch(), qboHealthQuery.refetch()]);
          }}
        />
      ) : null}

      {inventoryQuery.isLoading ? <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading lists inventory...</div> : null}
      <AllCatalogsMap onCatalogClick={openCatalog} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentActivityCard rows={activity} />
        <QboSyncHealthCard rows={health} onForceSync={() => forceSyncMutation.mutate()} syncing={forceSyncMutation.isPending} />
      </div>
    </div>
  );
}

