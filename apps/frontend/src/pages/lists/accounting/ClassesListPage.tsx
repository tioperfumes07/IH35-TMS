import { useState } from "react";
import { bulkUpdateClasses, classesCatalogClient, type AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { useToast } from "../../../components/Toast";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

// Block 7 — bulk-edit bar for Classes: deactivate or re-parent the selected rows.
function ClassesBulkBar({
  selectedIds,
  rows,
  clearSelection,
  refetch,
}: {
  selectedIds: string[];
  rows: AccountingCatalogRow[];
  clearSelection: () => void;
  refetch: () => void;
}) {
  const { pushToast } = useToast();
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedSet = new Set(selectedIds);
  const parentOptions = rows.filter((r) => r.is_active && !selectedSet.has(r.id));

  async function run(op: "deactivate" | "reparent") {
    if (busy) return;
    if (op === "reparent" && !parentId) {
      pushToast("Pick a parent class to re-parent to", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await bulkUpdateClasses({ op, ids: selectedIds, parent_class_id: op === "reparent" ? parentId : undefined });
      pushToast(`${res.updated} class${res.updated === 1 ? "" : "es"} updated`, "success");
      clearSelection();
      refetch();
      setParentId("");
    } catch (e) {
      pushToast(String((e as Error).message || "Bulk update failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => run("deactivate")}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Deactivate selected
      </button>
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className="min-h-9 rounded border border-gray-300 px-2 text-xs"
        aria-label="Re-parent target class"
      >
        <option value="">Re-parent to…</option>
        {parentOptions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.display_name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !parentId}
        onClick={() => run("reparent")}
        className="rounded bg-[#16A34A] px-2 py-1 text-xs font-semibold text-white hover:bg-[#15803d] disabled:opacity-50"
      >
        Re-parent
      </button>
    </div>
  );
}

export function ClassesListPage() {
  return (
    <AccountingCatalogListPage
      client={classesCatalogClient}
      displayName="Classes"
      breadcrumbPath="Lists & Catalogs / Accounting / Classes"
      metadataSummary={(row) => row.description || "Class mapping"}
      enableBulkSelect
      bulkBar={(ctx) => <ClassesBulkBar {...ctx} />}
    />
  );
}
