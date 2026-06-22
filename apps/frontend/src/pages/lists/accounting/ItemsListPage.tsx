/**
 * ITEM1 — Products & Services list with two-sided GL item editor.
 * Uses ItemEditorModal instead of the generic metadata field modal.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsCatalogClient } from "../../../api/catalogs-accounting";
import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { Button } from "../../../components/Button";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ItemEditorModal } from "./ItemEditorModal";

function itemSummary(row: AccountingCatalogRow): string {
  const m = row.metadata;
  const type = String(m.item_type ?? "Service");
  const sell = m.sell_enabled !== false ? "Sell" : null;
  const buy = m.buy_enabled ? "Buy" : null;
  const sides = [sell, buy].filter(Boolean).join(" + ");
  return `${type}${sides ? " · " + sides : ""}`;
}

export function ItemsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<AccountingCatalogRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "accounting", "items", companyId, search],
    queryFn: () => itemsCatalogClient.list({ operating_company_id: companyId, search: search || undefined, is_active: "all", limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];

  function openCreate() {
    setModalMode("create");
    setSelectedRow(null);
    setModalOpen(true);
  }

  function openEdit(row: AccountingCatalogRow) {
    setModalMode("edit");
    setSelectedRow(row);
    setModalOpen(true);
  }

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Accounting", "Items"]}
        title="Products & Services"
        countBadge={query.data?.total}
        actions={
          <Button onClick={openCreate} data-testid="items-create-btn">
            + Create
          </Button>
        }
      />

      <div className="flex gap-2">
        <input
          className="h-9 rounded border border-gray-300 px-2 text-sm"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search items"
        />
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type / Sides</th>
              <th className="px-3 py-2">Income account</th>
              <th className="px-3 py-2">Expense account</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-400">No items found.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">{row.display_name}</td>
                <td className="px-3 py-2 text-gray-600">{itemSummary(row)}</td>
                <td className="px-3 py-2 text-gray-500">{String(row.metadata.income_account ?? "—")}</td>
                <td className="px-3 py-2 text-gray-500">{String(row.metadata.expense_account ?? "—")}</td>
                <td className="px-3 py-2">
                  <span className={row.is_active
                    ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
                    : "rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-slate-700 hover:underline"
                    onClick={() => openEdit(row)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ItemEditorModal
        open={modalOpen}
        mode={modalMode}
        row={selectedRow}
        operatingCompanyId={companyId}
        client={itemsCatalogClient}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ["catalogs", "accounting", "items"] });
          setModalOpen(false);
        }}
      />
    </div>
  );
}
