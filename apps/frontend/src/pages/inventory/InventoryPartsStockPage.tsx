import { useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { PartCreateDrawer } from "./PartCreateDrawer";
import { useCompanyContext } from "../../contexts/CompanyContext";

// ParityColumn only honors key/label/render/className/sortable — the earlier align/format/badge keys
// were silently ignored (columns is a variable, so no excess-property check), so unit-cost formatting
// and the status badge never rendered. Use render (formatting/badge) + className (right-align) instead.
const columns: ParityColumn<InventoryPartRow>[] = [
  { key: "name", label: "Part Name", sortable: true },
  { key: "sku", label: "SKU", sortable: true },
  // INV-1: category is now a persisted column — surface it so the saved value is visible.
  { key: "category", label: "Category", sortable: true },
  { key: "on_hand_qty", label: "On Hand Qty", className: "text-right", sortable: true },
  {
    key: "unit_cost",
    label: "Unit Cost",
    className: "text-right",
    render: (row) => (row.unit_cost ? `$${Number(row.unit_cost).toFixed(2)}` : "—"),
  },
  { key: "location", label: "Location/Bin" },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
        {row.status}
      </span>
    ),
  },
];

// B1: the inventory "Parts & Stock" page reads the real maintenance.parts_inventory table via
// /api/v1/maintenance/parts (the only parts backend — there is no /api/v1/inventory/parts route).
// Map that endpoint's row shape onto the columns this page renders. Pure fn, unit-tested.
export type MaintenancePartRow = {
  id: string;
  part_number: string | null;
  name: string | null;
  category: string | null;
  notes: string | null;
  unit_cost: number | null;
  qty_on_hand: number | null;
  location: string | null;
  voided_at: string | null;
};
export type InventoryPartRow = {
  id: string;
  name: string | null;
  sku: string | null;
  category: string | null;
  notes: string | null;
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
      // INV-1: category + notes now round-trip from the persisted columns.
      category: r.category ?? null,
      notes: r.notes ?? null,
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
      const res = await fetch(resolveApiUrl(`/api/v1/maintenance/parts?operating_company_id=${operatingCompanyId}`));
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
        backHref="/"
        breadcrumb={["Inventory", "Parts & Stock"]}
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create part
          </Button>
        }
      />
      <InventoryModuleTabs />
      {/* ParityTable is already a self-contained card (own rounded/border/bg-white wrapper) — the extra
          wrapper div here produced a box-in-box double border. Render it directly. */}
      <ParityTable
        columns={columns}
        rows={rows}
        loading={partsQuery.isLoading}
        emptyText="No parts found. Create your first part to get started."
        rowKey={(row: { id: string }) => row.id}
      />
      <PartCreateDrawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        operatingCompanyId={operatingCompanyId}
      />
    </div>
  );
}
