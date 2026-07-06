import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { PartsInventoryTable } from "../maintenance/components/PartsInventoryTable";
import { listPartsInventory } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function InventoryPurchasesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const inventoryQuery = useQuery({
    queryKey: ["maintenance", "parts-inventory", companyId],
    queryFn: () => listPartsInventory(companyId),
    enabled: Boolean(companyId),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Purchase History" backHref="/inventory" breadcrumb={["Inventory", "Purchase History"]} />
      <InventoryModuleTabs />
      {inventoryQuery.isLoading ? (
        <div className="rounded-sm border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading purchase history...
        </div>
      ) : (
        <PartsInventoryTable companyId={companyId} rows={inventoryQuery.data ?? []} />
      )}
    </div>
  );
}
