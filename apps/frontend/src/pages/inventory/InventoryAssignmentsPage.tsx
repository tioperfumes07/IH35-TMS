import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";

export function InventoryAssignmentsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Assignments" />
      <InventoryModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Part Assignments</h3>
          <p className="mt-2 text-sm text-gray-500">
            Assign parts to trucks or drivers. Operational tracking (no GL posting).
          </p>
        </div>
      </div>
    </div>
  );
}
