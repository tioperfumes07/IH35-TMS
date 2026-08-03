import { SelectCombobox } from "../../shared/SelectCombobox";
import { MoneyInput } from "../MoneyInput";
import { ReferenceSelect } from "../../parity/ReferenceSelect";

export type CategoryLine = {
  id: string;
  expense_category_uuid?: string;
  /** catalogs.expense_categories.code — used to set bill category_kind/code (WAVE-H1). */
  expense_category_code?: string;
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
};

export type ItemSubRow = {
  id: string;
  line_type: "parts" | "labor";
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  part_uuid?: string;
  labor_rate_uuid?: string;
  part_location_codes?: string[];
};

export type ItemLine = {
  id: string;
  service_item_uuid?: string;
  description: string;
  location_label?: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  sub_rows?: ItemSubRow[];
};

export type CostContextOption = {
  id: string;
  label: string;
  code?: string;
};

type Props = {
  sectionA: { lines: CategoryLine[] };
  sectionB: { lines: ItemLine[] };
  expenseCategoryOptions?: CostContextOption[];
  itemOptions?: CostContextOption[];
  partOptions?: CostContextOption[];
  locationOptions?: CostContextOption[];
  onQuickCreateCategory?: (lineId: string) => void;
  onQuickCreateItem?: (lineId: string) => void;
  onQuickCreatePart?: (lineId: string, subId: string) => void;
  /** When set, Category uses ReferenceSelect with inline "+ Add new" (QBO) instead of external + Create. */
  operatingCompanyId?: string;
  /** WAVE-H1: bill mode uses expense_category (catalogs.expense_categories); expense/WO keep category (CoA). */
  categoryCreateKind?: "category" | "expense_category";
  onCategoryOptionCreated?: (lineId: string, opt: { id: string; label: string }) => void;
  partsLaborMode: "none" | "parts-only" | "parts-and-labor";
  onSectionAChange: (lines: CategoryLine[]) => void;
  onSectionBChange: (lines: ItemLine[]) => void;
  onOpenLocationMap?: (lineId: string, subId: string) => void;
  readOnly?: boolean;
  /** "wo" relabels the Section-A column headers to the render-v5 WO set (Type | Part # / Task | Qty/Hr |
   * Unit/Rate | Total). Default keeps Category | Description | Qty | Cost | Total — this box is SHARED
   * with the bill/expense forms, so the WO labels must not leak into them (FIX-4). */
  variant?: "default" | "wo";
};

function emptyCategoryLine(): CategoryLine {
  return {
    id: crypto.randomUUID(),
    expense_category_uuid: "",
    description: "",
    quantity: 1,
    unit_cost: 0,
    amount: 0,
  };
}

function emptyItemLine(): ItemLine {
  return {
    id: crypto.randomUUID(),
    service_item_uuid: "",
    description: "",
    location_label: "",
    quantity: 1,
    unit_cost: 0,
    amount: 0,
    sub_rows: [],
  };
}

export function CostBreakdownBox({
  sectionA,
  sectionB,
  expenseCategoryOptions = [],
  itemOptions = [],
  partOptions = [],
  locationOptions = [],
  onQuickCreateCategory,
  onQuickCreateItem,
  onQuickCreatePart,
  operatingCompanyId,
  categoryCreateKind = "category",
  onCategoryOptionCreated,
  partsLaborMode,
  onSectionAChange,
  onSectionBChange,
  onOpenLocationMap,
  readOnly = false,
  variant = "default",
}: Props) {
  // FIX-4: WO mode uses the render-v5 §C column labels; default keeps the bill/expense labels unchanged.
  const col =
    variant === "wo"
      ? { category: "Type", description: "Part # / Task", qty: "Qty/Hr", cost: "Unit/Rate", total: "Total" }
      : { category: "Category", description: "Description", qty: "Qty", cost: "Cost", total: "Total" };
  const subtotalA = sectionA.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const subtotalB = sectionB.lines.reduce((sum, line) => {
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  return (
    <div className="cost-box overflow-hidden rounded-sm border border-gray-300 bg-white">
      <div className="cost-box-header bg-[#1b2333] px-4 py-[9px] text-[11px] font-bold uppercase tracking-wide text-white">Cost Breakdown</div>
      <div className="cost-box-body">
        <div className="cost-sub border-b border-gray-200">
          <div className="cost-sub-header bg-gray-50 px-[14px] py-[7px] text-[10px] font-bold uppercase tracking-wide text-slate-700">
            Section A - Category lines
          </div>
          <div className="p-2">
            <div className="overflow-x-auto bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">{col.category}</th>
                    <th className="px-2 py-1 text-left">
                      {col.description}
                      {variant === "wo" ? <span className="ml-0.5 text-red-600" aria-hidden="true">*</span> : null}
                    </th>
                    <th className="px-2 py-1 text-left">{col.qty}</th>
                    <th className="px-2 py-1 text-left">{col.cost}</th>
                    <th className="px-2 py-1 text-left">{col.total}</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {sectionA.lines.map((line) => (
                    <tr key={line.id} className="border-t border-gray-100">
                      <td className="px-2 py-1">
                        {operatingCompanyId && !readOnly ? (
                          <ReferenceSelect
                            value={line.expense_category_uuid ?? null}
                            onChange={(next) => {
                              const match = expenseCategoryOptions.find((o) => o.id === next);
                              onSectionAChange(
                                sectionA.lines.map((entry) =>
                                  entry.id === line.id
                                    ? {
                                        ...entry,
                                        expense_category_uuid: next ?? undefined,
                                        expense_category_code: match?.code,
                                      }
                                    : entry
                                )
                              );
                            }}
                            options={expenseCategoryOptions.map((option) => ({
                              value: option.id,
                              label: option.label,
                            }))}
                            createKind={categoryCreateKind}
                            operatingCompanyId={operatingCompanyId}
                            placeholder="Select category…"
                            addNewLabel="+ Add new category"
                            onOptionCreated={(opt) => {
                              onSectionAChange(
                                sectionA.lines.map((entry) =>
                                  entry.id === line.id
                                    ? {
                                        ...entry,
                                        expense_category_uuid: opt.value,
                                        // Inline create returns id+label; code lands after catalog refetch.
                                        expense_category_code: undefined,
                                      }
                                    : entry
                                )
                              );
                              onCategoryOptionCreated?.(line.id, { id: opt.value, label: opt.label });
                              // LST-PICKER-03: the external "+ Create" button that used to call this is
                              // gone, but the callback is part of the component's contract and callers
                              // still pass it — so it now fires on INLINE create instead of being
                              // silently dropped. Removing the prop would have broken those callers.
                              onQuickCreateCategory?.(line.id);
                            }}
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <SelectCombobox
                              disabled={readOnly}
                              value={line.expense_category_uuid ?? ""}
                              onChange={(event) =>
                                onSectionAChange(
                                  sectionA.lines.map((entry) =>
                                    entry.id === line.id ? { ...entry, expense_category_uuid: event.target.value } : entry
                                  )
                                )
                              }
                              className="w-full rounded-sm border border-gray-300 px-2 py-1"
                            >
                              <option value="">Select category...</option>
                              {expenseCategoryOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </SelectCombobox>
                            {/* LST-PICKER-03: no external "+ Create" here either. This branch renders only
                                when operatingCompanyId is absent, and a catalog row cannot be created
                                without an operating company to scope it to — so the honest UI is no create
                                control at all, rather than a button that sits outside the picker and would
                                have nowhere to write. With an operating company the ReferenceSelect above
                                provides inline create as the first row inside the dropdown. */}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          disabled={readOnly}
                          required={variant === "wo"}
                          aria-required={variant === "wo" ? true : undefined}
                          aria-label={variant === "wo" ? "Part # / Task" : "Description"}
                          data-testid={variant === "wo" ? "wo-section-a-part-task" : undefined}
                          placeholder={variant === "wo" ? "Part # / Task (required)" : undefined}
                          value={line.description}
                          onChange={(event) =>
                            onSectionAChange(sectionA.lines.map((entry) => (entry.id === line.id ? { ...entry, description: event.target.value } : entry)))
                          }
                          className={`w-full rounded-sm border px-2 py-1 ${
                            variant === "wo" && !String(line.description ?? "").trim()
                              ? "border-red-400"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          disabled={readOnly}
                          type="number"
                          min={0}
                          value={line.quantity}
                          onChange={(event) =>
                            onSectionAChange(
                              sectionA.lines.map((entry) => {
                                if (entry.id !== line.id) return entry;
                                const quantity = Number(event.target.value || 0);
                                return { ...entry, quantity, amount: quantity * Number(entry.unit_cost || 0) };
                              })
                            )
                          }
                          className="w-20 rounded-sm border border-gray-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-1">
                        {/* M-1 dollars-mode: QBO display ($ + .00), unit_cost stays a DOLLAR number — payload byte-for-byte unchanged. */}
                        <MoneyInput
                          disabled={readOnly}
                          valueDollars={line.unit_cost}
                          onChangeDollars={(d) =>
                            onSectionAChange(
                              sectionA.lines.map((entry) => {
                                if (entry.id !== line.id) return entry;
                                const unitCost = d ?? 0;
                                return { ...entry, unit_cost: unitCost, amount: unitCost * Number(entry.quantity || 0) };
                              })
                            )
                          }
                          className="w-24"
                          ariaLabel={col.cost}
                        />
                      </td>
                      <td className="px-2 py-1">${Number(line.amount || 0).toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          disabled={readOnly}
                          type="button"
                          onClick={() => onSectionAChange(sectionA.lines.filter((entry) => entry.id !== line.id))}
                          className="text-red-600"
                        >
                          x
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sectionA.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-2 text-center text-gray-500">
                        No Section A lines
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                disabled={readOnly}
                type="button"
                onClick={() => onSectionAChange([...sectionA.lines, emptyCategoryLine()])}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
                + Create category line
              </button>
              <span className="text-xs font-semibold">Subtotal A: ${subtotalA.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="cost-sub">
          <div className="cost-sub-header bg-gray-50 px-[14px] py-[7px] text-[10px] font-bold uppercase tracking-wide text-slate-700">
            Section B - Item lines (service items / parts / labor)
          </div>
          <div className="space-y-2 p-2">
            {sectionB.lines.map((line) => (
              <div key={line.id} className="border-b border-gray-100 bg-white p-2 last:border-b-0">
                <div className="grid gap-2 md:grid-cols-[1fr_1.2fr_1fr_110px_90px_95px_40px]">
                  {/* LST-PICKER-03: this was a bare SelectCombobox with a separate "+ Create" BUTTON
                      sitting beside it. The picker law (VERIFY-2) requires the create affordance to be
                      the first row INSIDE the dropdown, not a control next to it — an external button
                      is a second place to look, it is missed on a dense line-item grid, and it drops
                      the operator out of the row they were filling. Section A of this very box already
                      used ReferenceSelect; Section B was simply never migrated. Same component, same
                      contract, and the created item is selected onto THIS line. */}
                  <div className="flex items-center gap-1">
                    {operatingCompanyId && !readOnly ? (
                      <ReferenceSelect
                        value={line.service_item_uuid ?? null}
                        onChange={(next) =>
                          onSectionBChange(
                            sectionB.lines.map((entry) =>
                              entry.id === line.id ? { ...entry, service_item_uuid: next ?? undefined } : entry
                            )
                          )
                        }
                        options={itemOptions.map((option) => ({ value: option.id, label: option.label }))}
                        createKind="item"
                        operatingCompanyId={operatingCompanyId}
                        placeholder="Select product/service…"
                        addNewLabel="+ Add new item"
                        onOptionCreated={(opt) => {
                          onSectionBChange(
                            sectionB.lines.map((entry) =>
                              entry.id === line.id ? { ...entry, service_item_uuid: opt.value } : entry
                            )
                          );
                          onQuickCreateItem?.(line.id);
                        }}
                      />
                    ) : (
                      <SelectCombobox
                        disabled={readOnly}
                        value={line.service_item_uuid ?? ""}
                        onChange={(event) =>
                          onSectionBChange(sectionB.lines.map((entry) => (entry.id === line.id ? { ...entry, service_item_uuid: event.target.value } : entry)))
                        }
                        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="">Select product/service...</option>
                        {itemOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </SelectCombobox>
                    )}
                  </div>
                  <input
                    disabled={readOnly}
                    value={line.description}
                    onChange={(event) => onSectionBChange(sectionB.lines.map((entry) => (entry.id === line.id ? { ...entry, description: event.target.value } : entry)))}
                    className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Description"
                  />
                  <SelectCombobox
                    disabled={readOnly}
                    value={line.location_label ?? ""}
                    onChange={(event) =>
                      onSectionBChange(sectionB.lines.map((entry) => (entry.id === line.id ? { ...entry, location_label: event.target.value } : entry)))
                    }
                    className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">Select location...</option>
                    {locationOptions.map((option) => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </SelectCombobox>
                  <input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={line.quantity}
                    onChange={(event) =>
                      onSectionBChange(
                        sectionB.lines.map((entry) => {
                          if (entry.id !== line.id) return entry;
                          const quantity = Number(event.target.value || 0);
                          return { ...entry, quantity, amount: quantity * Number(entry.unit_cost || 0) };
                        })
                      )
                    }
                    className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Qty"
                  />
                  {/* M-1 dollars-mode: QBO display ($ + .00), unit_cost stays a DOLLAR number — payload byte-for-byte unchanged. */}
                  <MoneyInput
                    disabled={readOnly}
                    valueDollars={line.unit_cost}
                    onChangeDollars={(d) =>
                      onSectionBChange(
                        sectionB.lines.map((entry) => {
                          if (entry.id !== line.id) return entry;
                          const unitCost = d ?? 0;
                          return { ...entry, unit_cost: unitCost, amount: Number(entry.quantity || 0) * unitCost };
                        })
                      )
                    }
                    className="text-xs"
                    ariaLabel={`${col.cost} (item)`}
                  />
                  <div className="px-2 py-1 text-xs font-semibold tabular-nums text-gray-900">${Number(line.amount || 0).toFixed(2)}</div>
                  <button
                    disabled={readOnly}
                    type="button"
                    onClick={() => onSectionBChange(sectionB.lines.filter((entry) => entry.id !== line.id))}
                    className="text-red-600"
                  >
                    x
                  </button>
                </div>

                {partsLaborMode !== "none" ? (
                  <div className="mt-2 bg-gray-50 p-2">
                    <div className="mb-1 text-[11px] font-semibold text-gray-600">Parts & Labor</div>
                      {(line.sub_rows ?? []).map((row) => (
                        <div key={row.id} className="mb-1 grid gap-1 border-t border-gray-100 pt-2 md:grid-cols-[80px_1fr_160px_80px_100px_100px_30px]">
                          <div className="px-2 py-1 text-[11px] uppercase text-slate-600">{row.line_type}</div>
                        {row.line_type === "parts" ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              {/* LST-PICKER-01 (guard 1878): was createKind="item" with "+ Add new part"
                                  label — wrote catalogs.items instead of maintenance.parts_inventory.
                                  createKind=part → QuickCreateEntityModal part form → parts inventory. */}
                              {operatingCompanyId && !readOnly ? (
                                <ReferenceSelect
                                  value={row.part_uuid ?? null}
                                  onChange={(next) =>
                                    onSectionBChange(
                                      sectionB.lines.map((entry) =>
                                        entry.id !== line.id
                                          ? entry
                                          : {
                                              ...entry,
                                              sub_rows: (entry.sub_rows ?? []).map((current) =>
                                                current.id === row.id
                                                  ? {
                                                      ...current,
                                                      part_uuid: next ?? undefined,
                                                      description:
                                                        partOptions.find((part) => part.id === next)?.label ??
                                                        current.description,
                                                    }
                                                  : current
                                              ),
                                            }
                                      )
                                    )
                                  }
                                  options={partOptions.map((option) => ({ value: option.id, label: option.label }))}
                                  createKind="part"
                                  operatingCompanyId={operatingCompanyId}
                                  placeholder="Select part…"
                                  addNewLabel="+ Add new part"
                                  onOptionCreated={(opt) => {
                                    onSectionBChange(
                                      sectionB.lines.map((entry) =>
                                        entry.id !== line.id
                                          ? entry
                                          : {
                                              ...entry,
                                              sub_rows: (entry.sub_rows ?? []).map((current) =>
                                                current.id === row.id
                                                  ? { ...current, part_uuid: opt.value, description: opt.label }
                                                  : current
                                              ),
                                            }
                                      )
                                    );
                                    onQuickCreatePart?.(line.id, row.id);
                                  }}
                                />
                              ) : (
                                <SelectCombobox
                                  disabled={readOnly}
                                  value={row.part_uuid ?? ""}
                                  onChange={(event) =>
                                    onSectionBChange(
                                      sectionB.lines.map((entry) =>
                                        entry.id !== line.id
                                          ? entry
                                          : {
                                              ...entry,
                                              sub_rows: (entry.sub_rows ?? []).map((current) =>
                                                current.id === row.id
                                                  ? {
                                                      ...current,
                                                      part_uuid: event.target.value || undefined,
                                                      description:
                                                        partOptions.find((part) => part.id === event.target.value)?.label ??
                                                        current.description,
                                                    }
                                                  : current
                                              ),
                                            }
                                      )
                                    )
                                  }
                                  className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                                >
                                  <option value="">Select part...</option>
                                  {partOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </SelectCombobox>
                              )}
                            </div>
                            <input
                              disabled={readOnly}
                              value={row.description}
                              onChange={(event) =>
                                onSectionBChange(
                                  sectionB.lines.map((entry) =>
                                    entry.id !== line.id
                                      ? entry
                                      : {
                                          ...entry,
                                          sub_rows: (entry.sub_rows ?? []).map((current) =>
                                            current.id === row.id ? { ...current, description: event.target.value } : current
                                          ),
                                        }
                                  )
                                )
                              }
                              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                              placeholder="Part description"
                            />
                          </div>
                        ) : (
                          <input
                            disabled={readOnly}
                            value={row.description}
                            onChange={(event) =>
                              onSectionBChange(
                                sectionB.lines.map((entry) =>
                                  entry.id !== line.id
                                    ? entry
                                    : {
                                        ...entry,
                                        sub_rows: (entry.sub_rows ?? []).map((current) =>
                                          current.id === row.id ? { ...current, description: event.target.value } : current
                                        ),
                                      }
                                )
                              )
                            }
                            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                            placeholder="Labor description"
                          />
                        )}
                        {row.line_type === "parts" ? (
                          <button
                            disabled={readOnly}
                            type="button"
                            data-open-map
                            onClick={() => onOpenLocationMap?.(line.id, row.id)}
                            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-left text-xs"
                          >
                            {row.part_location_codes?.join(", ") || "Select location(s)"}
                          </button>
                        ) : (
                          <div className="px-2 py-1 text-xs text-gray-500">No location</div>
                        )}
                        <input
                          disabled={readOnly}
                          type="number"
                          min={0}
                          value={row.quantity}
                          onChange={(event) =>
                            onSectionBChange(
                              sectionB.lines.map((entry) =>
                                entry.id !== line.id
                                  ? entry
                                  : {
                                      ...entry,
                                      sub_rows: (entry.sub_rows ?? []).map((current) => {
                                        if (current.id !== row.id) return current;
                                        const quantity = Number(event.target.value || 0);
                                        return { ...current, quantity, amount: quantity * Number(current.unit_cost || 0) };
                                      }),
                                    }
                              )
                            )
                          }
                          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                        />
                        {/* M-1 dollars-mode (sub-row): QBO display, unit_cost stays a DOLLAR number — payload unchanged. */}
                        <MoneyInput
                          disabled={readOnly}
                          valueDollars={row.unit_cost}
                          onChangeDollars={(d) =>
                            onSectionBChange(
                              sectionB.lines.map((entry) =>
                                entry.id !== line.id
                                  ? entry
                                  : {
                                      ...entry,
                                      sub_rows: (entry.sub_rows ?? []).map((current) => {
                                        if (current.id !== row.id) return current;
                                        const unitCost = d ?? 0;
                                        return { ...current, unit_cost: unitCost, amount: Number(current.quantity || 0) * unitCost };
                                      }),
                                    }
                              )
                            )
                          }
                          className="text-xs"
                          ariaLabel="Sub-row cost"
                        />
                          <div className="px-2 py-1 text-xs tabular-nums text-gray-900">${Number(row.amount || 0).toFixed(2)}</div>
                        <button
                          disabled={readOnly}
                          type="button"
                          onClick={() =>
                            onSectionBChange(
                              sectionB.lines.map((entry) =>
                                entry.id !== line.id
                                  ? entry
                                  : { ...entry, sub_rows: (entry.sub_rows ?? []).filter((current) => current.id !== row.id) }
                              )
                            )
                          }
                          className="text-red-600"
                        >
                          x
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-1">
                      <button
                        disabled={readOnly}
                        type="button"
                        onClick={() =>
                          onSectionBChange(
                            sectionB.lines.map((entry) =>
                              entry.id !== line.id
                                ? entry
                                : {
                                    ...entry,
                                    sub_rows: [
                                      ...(entry.sub_rows ?? []),
                                      {
                                        id: crypto.randomUUID(),
                                        line_type: "parts",
                                        description: "",
                                        quantity: 1,
                                        unit_cost: 0,
                                        amount: 0,
                                        part_location_codes: [],
                                      },
                                    ],
                                  }
                            )
                          )
                        }
                        className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      >
                        + Create part
                      </button>
                      {partsLaborMode === "parts-and-labor" ? (
                        <button
                          disabled={readOnly}
                          type="button"
                          onClick={() =>
                            onSectionBChange(
                              sectionB.lines.map((entry) =>
                                entry.id !== line.id
                                  ? entry
                                  : {
                                      ...entry,
                                      sub_rows: [
                                        ...(entry.sub_rows ?? []),
                                        { id: crypto.randomUUID(), line_type: "labor", description: "", quantity: 1, unit_cost: 0, amount: 0 },
                                      ],
                                    }
                              )
                            )
                          }
                          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                        >
                          + Create labor
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {sectionB.lines.length === 0 ? <div className="px-2 py-3 text-center text-xs text-gray-500">No Section B lines</div> : null}

            <div className="flex items-center justify-between">
              <button
                disabled={readOnly}
                type="button"
                onClick={() => onSectionBChange([...sectionB.lines, emptyItemLine()])}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
                + Create item line
              </button>
              <span className="text-xs font-semibold">Subtotal B: ${subtotalB.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
