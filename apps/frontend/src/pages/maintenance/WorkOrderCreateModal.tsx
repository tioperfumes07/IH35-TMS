// @ModalNoX — inline WO cost panel embedded in CreateWorkOrderModal, not an overlay dialog
/**
 * AUDIT-FIX-8 — WO create cost breakdown with live accounting category/item lookups.
 * LST-PICKER-01 (guard 1894): bare SelectCombobox → ReferenceSelect createKind=account|item
 * so operators get first-row +Create without leaving WO intake for Lists.
 */
import { useMemo, useState } from "react";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
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
        value: String(row.id),
        label: `${row.name}`.trim(),
        type: row.account_type ?? undefined,
      })),
    [categoriesQuery.data]
  );
  const itemOptions = useMemo(
    () =>
      (itemsQuery.data ?? []).map((row) => ({
        value: String(row.id),
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
    <div className="space-y-4 rounded-sm border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">WHERE &amp; HOW — DRIVES THE ACCOUNTING AUTO-POST</div>

      <div className="flex gap-2">
        <button type="button" className="rounded-sm border px-3 py-1 text-xs" onClick={addCategoryLine}>
          + Category line (Section A)
        </button>
        <button type="button" className="rounded-sm border px-3 py-1 text-xs" onClick={addItemLine}>
          + Item line (Section B)
        </button>
      </div>

      {activeLine?.section === "A" ? (
        <div className="space-y-2" data-testid="wo-create-category-picker">
          <label className="text-xs font-medium text-slate-600">Category (expense CoA)</label>
          {/*
            LST-PICKER-01 (1894): /accounting/categories returns catalogs.accounts (expense) —
            createKind=account (not createKind=category which writes qbo_categories).
          */}
          <ReferenceSelect
            value={activeLine.category_id ?? null}
            onChange={(next) => patchLine(activeLine.id, { category_id: next ?? undefined })}
            options={categoryOptions}
            createKind="account"
            operatingCompanyId={operatingCompanyId}
            placeholder={categoriesQuery.isLoading ? "Loading accounts…" : "Select category…"}
            loading={categoriesQuery.isLoading}
            onSearch={(q) => {
              setCategorySearch(q);
              setCategoryFetchActive(true);
            }}
            onOptionCreated={(opt) => {
              patchLine(activeLine.id, { category_id: opt.value });
              void categoriesQuery.refetch();
            }}
          />
        </div>
      ) : null}

      {activeLine?.section === "B" ? (
        <div className="space-y-2" data-testid="wo-create-item-picker">
          <label className="text-xs font-medium text-slate-600">Service item</label>
          <ReferenceSelect
            value={activeLine.item_id ?? null}
            onChange={(next) => patchLine(activeLine.id, { item_id: next ?? undefined })}
            options={itemOptions}
            createKind="item"
            operatingCompanyId={operatingCompanyId}
            placeholder={itemsQuery.isLoading ? "Loading items…" : "Select item…"}
            loading={itemsQuery.isLoading}
            addNewLabel="+ Add new item"
            onSearch={(q) => {
              setItemSearch(q);
              setItemFetchActive(true);
            }}
            onOptionCreated={(opt) => {
              patchLine(activeLine.id, { item_id: opt.value });
              void itemsQuery.refetch();
            }}
          />
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
