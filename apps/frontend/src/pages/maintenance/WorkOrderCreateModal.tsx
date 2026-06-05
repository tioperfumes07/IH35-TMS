// @ModalNoX — inline WO cost panel embedded in CreateWorkOrderModal, not an overlay dialog
/**
 * AUDIT-FIX-8 — WO create cost breakdown with live accounting category/item lookups.
 * SelectCombobox surfaces feed query results from /api/v1/accounting/categories and items-for-wo.
 */
import { useMemo, useState } from "react";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useAccountingCategoriesQuery } from "../../hooks/useAccountingCategoriesQuery";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";

export type WorkOrderLineDraft = {
  id: string;
  section: "A" | "B";
  category_id?: string;
  item_id?: string;
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
};

type Props = {
  operatingCompanyId: string;
  onLinesChange?: (lines: WorkOrderLineDraft[]) => void;
};

export function WorkOrderCreateModal({ operatingCompanyId, onLinesChange }: Props) {
  const [categorySearch, setCategorySearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [lines, setLines] = useState<WorkOrderLineDraft[]>([]);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [categoryFetchActive, setCategoryFetchActive] = useState(false);
  const [itemFetchActive, setItemFetchActive] = useState(false);

  const categoriesQuery = useAccountingCategoriesQuery({
    operatingCompanyId,
    search: categorySearch,
    enabled: Boolean(operatingCompanyId) && categoryFetchActive,
  });
  const itemsQuery = useAccountingItemsQuery({
    operatingCompanyId,
    kind: "service",
    search: itemSearch,
    enabled: Boolean(operatingCompanyId) && itemFetchActive,
  });

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((row) => ({
        id: String(row.id),
        label: `${row.account_number ?? row.qbo_id ?? ""} · ${row.name}`.trim(),
      })),
    [categoriesQuery.data]
  );
  const itemOptions = useMemo(
    () =>
      (itemsQuery.data ?? []).map((row) => ({
        id: String(row.id),
        label: row.name,
      })),
    [itemsQuery.data]
  );

  const updateLines = (next: WorkOrderLineDraft[]) => {
    setLines(next);
    onLinesChange?.(next);
  };

  const addCategoryLine = () => {
    const id = crypto.randomUUID();
    setActiveLineId(id);
    setCategoryFetchActive(true);
    updateLines([
      ...lines,
      { id, section: "A", description: "", quantity: 1, unit_cost: 0, amount: 0 },
    ]);
  };

  const addItemLine = () => {
    const id = crypto.randomUUID();
    setActiveLineId(id);
    setItemFetchActive(true);
    updateLines([
      ...lines,
      { id, section: "B", description: "", quantity: 1, unit_cost: 0, amount: 0 },
    ]);
  };

  const patchLine = (lineId: string, patch: Partial<WorkOrderLineDraft>) => {
    updateLines(lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const activeLine = lines.find((line) => line.id === activeLineId) ?? null;

  return (
    <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">WHERE &amp; HOW — DRIVES THE ACCOUNTING AUTO-POST</div>

      <div className="flex gap-2">
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addCategoryLine}>
          + Category line (Section A)
        </button>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addItemLine}>
          + Item line (Section B)
        </button>
      </div>

      {activeLine?.section === "A" ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">Category (expense CoA)</label>
          <input
            type="search"
            className="mb-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="Filter accounts…"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            onFocus={() => setCategoryFetchActive(true)}
          />
          <SelectCombobox
            value={activeLine.category_id ?? ""}
            onChange={(event) => patchLine(activeLine.id, { category_id: event.target.value })}
            className="w-full rounded border px-2 py-1"
          >
            <option value="">{categoriesQuery.isLoading ? "Loading accounts…" : "Select category…"}</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
      ) : null}

      {activeLine?.section === "B" ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">Service item</label>
          <input
            type="search"
            className="mb-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="Filter items…"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onFocus={() => setItemFetchActive(true)}
          />
          <SelectCombobox
            value={activeLine.item_id ?? ""}
            onChange={(event) => patchLine(activeLine.id, { item_id: event.target.value })}
            className="w-full rounded border px-2 py-1"
          >
            <option value="">{itemsQuery.isLoading ? "Loading items…" : "Select item…"}</option>
            {itemOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
      ) : null}

      <ul className="space-y-1 text-xs text-slate-600">
        {lines.map((line) => (
          <li key={line.id}>
            {line.section === "A" ? "Category" : "Item"} line · category_id={line.category_id ?? "—"} · item_id=
            {line.item_id ?? "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default WorkOrderCreateModal;
