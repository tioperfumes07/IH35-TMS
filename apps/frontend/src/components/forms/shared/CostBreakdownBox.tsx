export type CategoryLine = {
  id: string;
  expense_category_uuid?: string;
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

type Props = {
  sectionA: { lines: CategoryLine[] };
  sectionB: { lines: ItemLine[] };
  partsLaborMode: "none" | "parts-only" | "parts-and-labor";
  onSectionAChange: (lines: CategoryLine[]) => void;
  onSectionBChange: (lines: ItemLine[]) => void;
  onOpenLocationMap?: (lineId: string, subId: string) => void;
  readOnly?: boolean;
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
  partsLaborMode,
  onSectionAChange,
  onSectionBChange,
  onOpenLocationMap,
  readOnly = false,
}: Props) {
  const subtotalA = sectionA.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const subtotalB = sectionB.lines.reduce((sum, line) => {
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  return (
    <div className="cost-box overflow-hidden rounded border border-gray-300 bg-white">
      <div className="cost-box-header bg-[#1b2333] px-4 py-[9px] text-[11px] font-bold uppercase tracking-wide text-white">Cost Breakdown</div>
      <div className="cost-box-body">
        <div className="cost-sub border-b border-gray-200">
          <div className="cost-sub-header bg-gray-50 px-[14px] py-[7px] text-[10px] font-bold uppercase tracking-wide text-slate-700">
            Section A - Category lines
          </div>
          <div className="p-2">
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1 text-left">Category</th>
                    <th className="px-2 py-1 text-left">Description</th>
                    <th className="px-2 py-1 text-left">Qty</th>
                    <th className="px-2 py-1 text-left">Cost</th>
                    <th className="px-2 py-1 text-left">Total</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {sectionA.lines.map((line) => (
                    <tr key={line.id} className="border-t border-gray-100">
                      <td className="px-2 py-1">
                        <input
                          disabled={readOnly}
                          value={line.expense_category_uuid ?? ""}
                          placeholder="expense_category_uuid"
                          onChange={(event) =>
                            onSectionAChange(
                              sectionA.lines.map((entry) =>
                                entry.id === line.id ? { ...entry, expense_category_uuid: event.target.value } : entry
                              )
                            )
                          }
                          className="w-full rounded border border-gray-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          disabled={readOnly}
                          value={line.description}
                          onChange={(event) =>
                            onSectionAChange(sectionA.lines.map((entry) => (entry.id === line.id ? { ...entry, description: event.target.value } : entry)))
                          }
                          className="w-full rounded border border-gray-300 px-2 py-1"
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
                          className="w-20 rounded border border-gray-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          disabled={readOnly}
                          type="number"
                          min={0}
                          value={line.unit_cost}
                          onChange={(event) =>
                            onSectionAChange(
                              sectionA.lines.map((entry) => {
                                if (entry.id !== line.id) return entry;
                                const unitCost = Number(event.target.value || 0);
                                return { ...entry, unit_cost: unitCost, amount: unitCost * Number(entry.quantity || 0) };
                              })
                            )
                          }
                          className="w-24 rounded border border-gray-300 px-2 py-1"
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
                className="rounded border border-gray-300 px-2 py-1 text-xs"
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
              <div key={line.id} className="rounded border border-gray-200 bg-white p-2">
                <div className="grid gap-2 md:grid-cols-[1fr_1.2fr_1fr_110px_90px_95px_40px]">
                  <input
                    disabled={readOnly}
                    value={line.service_item_uuid ?? ""}
                    onChange={(event) =>
                      onSectionBChange(sectionB.lines.map((entry) => (entry.id === line.id ? { ...entry, service_item_uuid: event.target.value } : entry)))
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Product/Service"
                  />
                  <input
                    disabled={readOnly}
                    value={line.description}
                    onChange={(event) => onSectionBChange(sectionB.lines.map((entry) => (entry.id === line.id ? { ...entry, description: event.target.value } : entry)))}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Description"
                  />
                  <input
                    disabled={readOnly}
                    value={line.location_label ?? ""}
                    onChange={(event) =>
                      onSectionBChange(sectionB.lines.map((entry) => (entry.id === line.id ? { ...entry, location_label: event.target.value } : entry)))
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Location"
                  />
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
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Qty"
                  />
                  <input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={line.unit_cost}
                    onChange={(event) =>
                      onSectionBChange(
                        sectionB.lines.map((entry) => {
                          if (entry.id !== line.id) return entry;
                          const unitCost = Number(event.target.value || 0);
                          return { ...entry, unit_cost: unitCost, amount: Number(entry.quantity || 0) * unitCost };
                        })
                      )
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Cost"
                  />
                  <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold">${Number(line.amount || 0).toFixed(2)}</div>
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
                  <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
                    <div className="mb-1 text-[11px] font-semibold text-gray-600">Parts & Labor</div>
                    {(line.sub_rows ?? []).map((row) => (
                      <div key={row.id} className="mb-1 grid gap-1 md:grid-cols-[80px_1fr_160px_80px_100px_100px_30px]">
                        <div className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] uppercase">{row.line_type}</div>
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
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                          placeholder={row.line_type === "parts" ? "Part description" : "Labor description"}
                        />
                        {row.line_type === "parts" ? (
                          <button
                            disabled={readOnly}
                            type="button"
                            data-open-map
                            onClick={() => onOpenLocationMap?.(line.id, row.id)}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-left text-xs"
                          >
                            {row.part_location_codes?.join(", ") || "Select location(s)"}
                          </button>
                        ) : (
                          <div className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-xs text-gray-500">No location</div>
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
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <input
                          disabled={readOnly}
                          type="number"
                          min={0}
                          value={row.unit_cost}
                          onChange={(event) =>
                            onSectionBChange(
                              sectionB.lines.map((entry) =>
                                entry.id !== line.id
                                  ? entry
                                  : {
                                      ...entry,
                                      sub_rows: (entry.sub_rows ?? []).map((current) => {
                                        if (current.id !== row.id) return current;
                                        const unitCost = Number(event.target.value || 0);
                                        return { ...current, unit_cost: unitCost, amount: Number(current.quantity || 0) * unitCost };
                                      }),
                                    }
                              )
                            )
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <div className="rounded border border-gray-200 bg-white px-2 py-1 text-xs">${Number(row.amount || 0).toFixed(2)}</div>
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
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
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
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          + Create labor
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {sectionB.lines.length === 0 ? <div className="rounded border border-dashed border-gray-300 bg-white px-2 py-3 text-center text-xs text-gray-500">No Section B lines</div> : null}

            <div className="flex items-center justify-between">
              <button
                disabled={readOnly}
                type="button"
                onClick={() => onSectionBChange([...sectionB.lines, emptyItemLine()])}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
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
