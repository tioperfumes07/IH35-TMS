/**
 * B1 Products & Services — QBO-parity catalog list + ParityDrawer create/edit.
 * Non-financial: this is a catalog/reference table (no GL posting, no accounting.* reads).
 * Follows A1 ParityTable grammar + A3 ParityDrawer sizing.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ProductCreateDrawer } from "./ProductCreateDrawer";

type ProductItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  type: "Service" | "Inventory" | "Non-inventory" | "Bundle";
  price: number | null;
  cost: number | null;
  qty_on_hand: number | null;
  reorder_point: number | null;
  is_active: boolean;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function fmtMoney(v: number | null) {
  if (v === null) return "—";
  return usd.format(v);
}

const COLUMNS: ParityColumn<ProductItem>[] = [
  { key: "name", label: "Name", sortable: true, alwaysVisible: true },
  {
    key: "description",
    label: "Sales description",
    render: (r) => <span className="text-gray-600">{r.description ?? "—"}</span>,
    defaultHidden: true,
  },
  {
    key: "qty_on_hand",
    label: "Qty on hand",
    render: (r) => <span>{r.qty_on_hand ?? "—"}</span>,
    className: "text-right",
  },
  { key: "category", label: "Category", render: (r) => <span>{r.category ?? "—"}</span> },
  { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku ?? "—"}</span> },
  {
    key: "type",
    label: "Type",
    render: (r) => (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">{r.type}</span>
    ),
  },
  {
    key: "price",
    label: "Price",
    className: "text-right",
    render: (r) => <span>{fmtMoney(r.price)}</span>,
  },
  {
    key: "cost",
    label: "Cost",
    className: "text-right",
    render: (r) => <span>{fmtMoney(r.cost)}</span>,
    defaultHidden: true,
  },
  {
    key: "reorder_point",
    label: "Reorder point",
    render: (r) => <span>{r.reorder_point ?? "—"}</span>,
    defaultHidden: true,
  },
  {
    key: "is_active",
    label: "Status",
    render: (r) =>
      r.is_active ? (
        <span className="text-emerald-700">Active</span>
      ) : (
        <span className="text-gray-400">Inactive</span>
      ),
  },
];

export function ProductsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProductItem | null>(null);

  const query = useQuery<ProductItem[]>({
    queryKey: ["products", selectedCompanyId ?? ""],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/v1/products?operating_company_id=${selectedCompanyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Products & Services"
        actions={
          <button
            type="button"
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            onClick={() => { setEditItem(null); setDrawerOpen(true); }}
          >
            + Create
          </button>
        }
      />
      <div className="flex-1 overflow-auto px-4 pb-4">
        <ParityTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          loading={query.isLoading}
          emptyText="No products or services yet"
          storageKey="products-list-v1"
          selectable
          onRowClick={(r) => { setEditItem(r); setDrawerOpen(true); }}
          batchActions={(selected) => (
            <span className="text-sm text-gray-600">{selected.length} selected</span>
          )}
          rowActions={(r) => (
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-900"
              onClick={(e) => { e.stopPropagation(); setEditItem(r); setDrawerOpen(true); }}
            >
              Edit
            </button>
          )}
        />
      </div>
      {selectedCompanyId ? (
        <ProductCreateDrawer
          isOpen={drawerOpen}
          onClose={() => { setDrawerOpen(false); setEditItem(null); }}
          operatingCompanyId={selectedCompanyId}
          editItem={editItem}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["products", selectedCompanyId] });
          }}
        />
      ) : null}
    </div>
  );
}
