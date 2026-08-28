import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { listMaintenanceParts, type MaintenancePartRow } from "../../api/maintenance";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { PartCreateDrawer } from "./PartCreateDrawer";
import { PartEditDrawer } from "./PartEditDrawer";
import { inventoryPartsStockQueryKey } from "./partsStockQueryKeys";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useSearchParams } from "react-router-dom";
import { partNeedsReorder } from "../maintenance/parts-low-stock";
import { displayPartInventoryCategory } from "./partInventoryCategories";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { Combobox } from "../../components/Combobox";

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
    render: (row) => {
      if (!row.vendor_id) {
        return <span className="text-gray-400">—</span>;
      }
      // LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL (FE half):
      // When the API join cannot resolve a same-opco vendor name (often deactivated
      // under active-only RLS), do not mount EntityLink — dead drill → Failed to load.
      // Historical human-name recovery remains CC-1 schema/RLS; this ratchets chrome.
      if (isUnresolvedEntityTombstone(row.vendor_label, row.vendor_id, "Vendor")) {
        return (
          <span className="text-gray-500" data-testid="inventory-parts-vendor-tombstone">
            {entityLabel(row.vendor_label, row.vendor_id, "Vendor")}
          </span>
        );
      }
      return (
        <EntityLink
          kind="vendor"
          id={row.vendor_id}
          label={String(row.vendor_label).trim()}
          data-testid="inventory-parts-vendor-link"
        />
      );
    },
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
export function mapMaintenancePartsToInventoryRows(rows: MaintenancePartRow[]): InventoryPartRow[] {
  return (rows ?? []).map((r) => {
    const qty = Number(r.qty_on_hand ?? 0);
    const reorderThreshold = Number(r.reorder_threshold ?? 0);
    const vendorId = r.vendor_id ?? null;
    const joinedName = typeof r.vendor_name === "string" ? r.vendor_name.trim() : "";
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
      // Prefer API same-opco join — never a capped FE vendor roster (CLS-SILENT-CAP).
      vendor_label: vendorId ? joinedName || null : null,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"" | "in_stock" | "reorder" | "out_of_stock" | "voided">("");
  const stagedFilters = useStagedListFilters({
    applied: { categoryFilter, stockFilter },
    empty: { categoryFilter: "", stockFilter: "" as const },
    onApply: (next) => {
      setCategoryFilter(next.categoryFilter);
      setStockFilter(next.stockFilter);
    },
  });

  const partsQuery = useQuery({
    queryKey: inventoryPartsStockQueryKey(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const data = await listMaintenanceParts(operatingCompanyId);
      return { rawParts: data.rows ?? [] };
    },
  });

  const rawParts = useMemo(() => partsQuery.data?.rawParts ?? [], [partsQuery.data?.rawParts]);
  useEffect(() => {
    const requestedPartId = searchParams.get("part_id");
    if (!requestedPartId || rawParts.length === 0) return;
    const requestedPart = rawParts.find((part) => part.id === requestedPartId);
    if (requestedPart) setEditingPart(requestedPart);
  }, [rawParts, searchParams]);
  const allRows = useMemo(() => mapMaintenancePartsToInventoryRows(rawParts), [rawParts]);
  const categoryOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.category).filter((value): value is string => Boolean(value)))].sort().map((value) => ({ value, label: displayPartInventoryCategory(value) })),
    [allRows],
  );
  const rows = useMemo(
    () =>
      allRows.filter((row) => {
        if (categoryFilter && row.category !== categoryFilter) return false;
        if (stockFilter === "voided") return Boolean(row.voided_at);
        if (row.voided_at) return !stockFilter;
        if (stockFilter === "reorder") return partNeedsReorder(row.on_hand_qty, row.reorder_threshold);
        if (stockFilter === "out_of_stock") return row.on_hand_qty <= 0;
        if (stockFilter === "in_stock") return row.on_hand_qty > 0 && !partNeedsReorder(row.on_hand_qty, row.reorder_threshold);
        return true;
      }),
    [allRows, categoryFilter, stockFilter],
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
      {partsQuery.isError ? (
        <ListErrorState
          title="Couldn't load parts inventory"
          {...formatQueryErrorDetail(partsQuery.error)}
          onRetry={() => void partsQuery.refetch()}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          loading={partsQuery.isLoading}
          emptyText="No parts found. Create your first part to get started."
          rowKey={(row: { id: string }) => row.id}
          filterBar={
            <CollapsedListFilters
              activeFilterCount={(categoryFilter ? 1 : 0) + (stockFilter ? 1 : 0)}
              onApply={stagedFilters.apply}
              onReset={stagedFilters.reset}
              onCancel={stagedFilters.cancel}
              applyDisabled={!stagedFilters.dirty}
              testIdPrefix="inventory-parts"
              dataAttributes={{ "data-inventory-parts-filter-toolbar": "collapsed" }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[11px] text-slate-600">
                  Category
                  <Combobox
                    value={stagedFilters.draft.categoryFilter || null}
                    onChange={(next) => stagedFilters.setDraft((current) => ({ ...current, categoryFilter: next ?? "" }))}
                    options={categoryOptions}
                    placeholder="All categories"
                    allowClear
                  />
                </label>
                <label className="text-[11px] text-slate-600">
                  Stock state
                  <Combobox
                    value={stagedFilters.draft.stockFilter || null}
                    onChange={(next) => stagedFilters.setDraft((current) => ({ ...current, stockFilter: (next ?? "") as typeof current.stockFilter }))}
                    options={[
                      { value: "in_stock", label: "In stock" },
                      { value: "reorder", label: "Needs reorder" },
                      { value: "out_of_stock", label: "Out of stock" },
                      { value: "voided", label: "Voided" },
                    ]}
                    placeholder="All stock states"
                    allowClear
                  />
                </label>
              </div>
            </CollapsedListFilters>
          }
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
      )}
      <PartCreateDrawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(id) => {
          const next = new URLSearchParams(searchParams);
          next.set("part_id", id);
          setSearchParams(next, { replace: true });
        }}
        operatingCompanyId={operatingCompanyId}
      />
      <PartEditDrawer
        part={editingPart}
        onClose={() => {
          setEditingPart(null);
          if (searchParams.has("part_id")) {
            const next = new URLSearchParams(searchParams);
            next.delete("part_id");
            setSearchParams(next, { replace: true });
          }
        }}
        operatingCompanyId={operatingCompanyId}
      />
    </div>
  );
}
