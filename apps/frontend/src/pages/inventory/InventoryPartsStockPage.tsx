import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
import { listMaintenanceParts, type MaintenancePartRow } from "../../api/maintenance";
import { listVendors } from "../../api/mdata";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { PartCreateDrawer } from "./PartCreateDrawer";
import { PartEditDrawer } from "./PartEditDrawer";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { partNeedsReorder } from "../maintenance/parts-low-stock";
import { displayPartInventoryCategory } from "./partInventoryCategories";

// ParityColumn only honors key/label/render/className/sortable — the earlier align/format/badge keys
// were silently ignored (columns is a variable, so no excess-property check), so unit-cost formatting
// and the status badge never rendered. Use render (formatting/badge) + className (right-align) instead.
const columns: ParityColumn<InventoryPartRow>[] = [
  { key: "name", label: "Part Name", sortable: true },
  { key: "sku", label: "SKU", sortable: true },
  // INV-CAT-01: category is persisted; legacy blanks render honest N/A (not an empty cell).
  {
    key: "category",
    label: "Category",
    sortable: true,
    render: (row) => {
      const label = displayPartInventoryCategory(row.category);
      if (label === "N/A") {
        return <span className="text-gray-400">N/A</span>;
      }
      return label;
    },
  },
  { key: "on_hand_qty", label: "On Hand Qty", className: "text-right", sortable: true },
  {
    key: "reorder_threshold",
    label: "Reorder Threshold",
    className: "text-right",
    sortable: true,
    render: (row) => row.reorder_threshold,
  },
  {
    key: "low_stock",
    label: "Low Stock",
    render: (row) =>
      row.voided_at ? (
        <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">—</span>
      ) : partNeedsReorder(row.on_hand_qty, row.reorder_threshold) ? (
        <span className="rounded-sm bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">REORDER</span>
      ) : (
        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">OK</span>
      ),
  },
  {
    key: "unit_cost",
    label: "Unit Cost",
    className: "text-right",
    render: (row) => (row.unit_cost ? `$${Number(row.unit_cost).toFixed(2)}` : "—"),
  },
  { key: "location", label: "Location/Bin" },
  {
    key: "vendor_id",
    label: "Vendor",
    render: (row) =>
      row.vendor_id ? (
        <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_label, row.vendor_id, "Vendor")} />
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
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
export type InventoryPartRow = {
  id: string;
  name: string | null;
  sku: string | null;
  category: string | null;
  notes: string | null;
  on_hand_qty: number;
  reorder_threshold: number;
  unit_cost: number | null;
  location: string | null;
  vendor_id: string | null;
  vendor_label: string | null;
  status: string;
  voided_at: string | null;
};
export function mapMaintenancePartsToInventoryRows(
  rows: MaintenancePartRow[],
  vendorNameById: Map<string, string> = new Map(),
): InventoryPartRow[] {
  return (rows ?? []).map((r) => {
    const qty = Number(r.qty_on_hand ?? 0);
    const reorderThreshold = Number(r.reorder_threshold ?? 0);
    const vendorId = r.vendor_id ?? null;
    return {
      id: r.id,
      name: r.name,
      sku: r.part_number,
      // INV-1: category + notes now round-trip from the persisted columns.
      category: r.category ?? null,
      notes: r.notes ?? null,
      on_hand_qty: qty,
      reorder_threshold: reorderThreshold,
      unit_cost: r.unit_cost,
      location: r.location,
      vendor_id: vendorId,
      vendor_label: vendorId ? vendorNameById.get(vendorId) ?? null : null,
      status: r.voided_at ? "Voided" : qty <= 0 ? "Out of stock" : "In stock",
      voided_at: r.voided_at,
    };
  });
}

export function InventoryPartsStockPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<MaintenancePartRow | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", operatingCompanyId, "inventory-parts-stock"],
    queryFn: () =>
      listVendors({
        operating_company_id: operatingCompanyId,
        status: "active",
        limit: 1000,
      }),
    enabled: Boolean(operatingCompanyId),
  });
  const vendorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vendorsQuery.data?.vendors ?? []) {
      map.set(v.id, v.name);
    }
    return map;
  }, [vendorsQuery.data?.vendors]);

  const partsQuery = useQuery({
    queryKey: ["inventory", "parts", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const data = await listMaintenanceParts(operatingCompanyId);
      return { rawParts: data.rows ?? [] };
    },
  });

  const rawParts = partsQuery.data?.rawParts ?? [];
  const rows = useMemo(
    () => mapMaintenancePartsToInventoryRows(rawParts, vendorNameById),
    [rawParts, vendorNameById],
  );

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
        rowActions={(row) => (
          <button
            type="button"
            className="text-slate-600 underline text-xs"
            onClick={() => {
              const raw = rawParts.find((p) => p.id === row.id) ?? null;
              setEditingPart(raw);
            }}
          >
            Edit
          </button>
        )}
      />
      <PartCreateDrawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        operatingCompanyId={operatingCompanyId}
      />
      <PartEditDrawer
        part={editingPart}
        onClose={() => setEditingPart(null)}
        operatingCompanyId={operatingCompanyId}
      />
    </div>
  );
}
