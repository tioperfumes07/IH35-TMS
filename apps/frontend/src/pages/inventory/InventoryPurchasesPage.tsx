import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";

export function InventoryPurchasesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Purchase History" />
      <InventoryModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Purchase History</h3>
          <p className="mt-2 text-sm text-gray-500">
            Track parts purchase history and vendor relationships.
          </p>
        </div>
      </div>
    </div>
  );
}
