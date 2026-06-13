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
  { key: "on_hand_qty", label: "On Hand Qty", align: "right" as const },
  { key: "unit_cost", label: "Unit Cost", align: "right" as const, format: (v: number) => v ? `$${v.toFixed(2)}` : "—" },
  { key: "location", label: "Location/Bin" },
  { key: "status", label: "Status", badge: true },
];

// B1: the inventory "Parts & Stock" page reads the real maintenance.parts_inventory table via
// /api/v1/maintenance/parts (the only parts backend — there is no /api/v1/inventory/parts route).
// Map that endpoint's row shape onto the columns this page renders. Pure fn, unit-tested.
export type MaintenancePartRow = {
  id: string;
  part_number: string | null;
  name: string | null;
  unit_cost: number | null;
  qty_on_hand: number | null;
  location: string | null;
  voided_at: string | null;
};
export type InventoryPartRow = {
  id: string;
  name: string | null;
  sku: string | null;
  on_hand_qty: number;
  unit_cost: number | null;
  location: string | null;
  status: string;
};
export function mapMaintenancePartsToInventoryRows(rows: MaintenancePartRow[]): InventoryPartRow[] {
  return (rows ?? []).map((r) => {
    const qty = Number(r.qty_on_hand ?? 0);
    return {
      id: r.id,
      name: r.name,
      sku: r.part_number,
      on_hand_qty: qty,
      unit_cost: r.unit_cost,
      location: r.location,
      status: r.voided_at ? "Voided" : qty <= 0 ? "Out of stock" : "In stock",
    };
  });
}

export function InventoryPartsStockPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const partsQuery = useQuery({
    queryKey: ["inventory", "parts", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/maintenance/parts?operating_company_id=${operatingCompanyId}`);
      if (!res.ok) throw new Error("Failed to fetch parts");
      const data = (await res.json()) as { rows?: MaintenancePartRow[] };
      return { parts: mapMaintenancePartsToInventoryRows(data.rows ?? []) };
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
