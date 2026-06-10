import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable } from "../../components/parity/ParityTable";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { PartCreateDrawer } from "./PartCreateDrawer";
import { useCompanyContext } from "../../contexts/CompanyContext";

const columns = [
  { key: "name", label: "Part Name" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "on_hand_qty", label: "On Hand Qty", align: "right" as const },
  { key: "reorder_point", label: "Reorder Point", align: "right" as const },
  { key: "unit_cost", label: "Unit Cost", align: "right" as const, format: (v: number) => v ? `$${v.toFixed(2)}` : "—" },
  { key: "location", label: "Location/Bin" },
  { key: "assigned_to", label: "Assigned To" },
  { key: "status", label: "Status", badge: true },
];

export function InventoryPartsStockPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const partsQuery = useQuery({
    queryKey: ["inventory", "parts", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/parts?operating_company_id=${operatingCompanyId}`);
      if (!res.ok) throw new Error("Failed to fetch parts");
      return res.json();
    },
  });

  const rows = partsQuery.data?.parts ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Parts & Stock"
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create part
          </Button>
        }
      />
      <InventoryModuleTabs />
      <div className="rounded border border-gray-200 bg-white">
        <ParityTable
          columns={columns}
          rows={rows}
          loading={partsQuery.isLoading}
          emptyText="No parts found. Create your first part to get started."
          rowKey={(row: { id: string }) => row.id}
        />
      </div>
      <PartCreateDrawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        operatingCompanyId={operatingCompanyId}
      />
    </div>
  );
}
