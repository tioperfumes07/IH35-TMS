import { useMemo, useState } from "react";
import { PartLocationMapDialog } from "./PartLocationMapDialog";

export type TwoSectionMode = "wo" | "bill" | "expense";

export type TwoSectionSubRow = {
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

export type TwoSectionLine = {
  id: string;
  section: "A" | "B";
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  expense_category_uuid?: string;
  service_item_uuid?: string;
  sub_rows?: TwoSectionSubRow[];
};

type Props = {
  mode: TwoSectionMode;
  initialLines?: TwoSectionLine[];
  onChange: (lines: TwoSectionLine[]) => void;
  unitUuid?: string;
  readOnly?: boolean;
};

function newLineA(): TwoSectionLine {
  return {
    id: crypto.randomUUID(),
    section: "A",
    description: "",
    quantity: 1,
    unit_cost: 0,
    amount: 0,
    expense_category_uuid: "",
  };
}

function newLineB(): TwoSectionLine {
  return {
    id: crypto.randomUUID(),
    section: "B",
    description: "",
    quantity: 1,
    unit_cost: 0,
    amount: 0,
    service_item_uuid: "",
    sub_rows: [],
  };
}

export function TwoSectionLineEditor({ initialLines = [], onChange, readOnly = false }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>(initialLines);
  const [locationTarget, setLocationTarget] = useState<{ lineId: string; subId: string } | null>(null);

  const updateLines = (next: TwoSectionLine[]) => {
    setLines(next);
    onChange(next);
  };

  const sectionA = useMemo(() => lines.filter((line) => line.section === "A"), [lines]);
  const sectionB = useMemo(() => lines.filter((line) => line.section === "B"), [lines]);

  const subtotalA = sectionA.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const subtotalB = sectionB.reduce((sum, line) => {
    const sub = (line.sub_rows ?? []).reduce((acc, row) => acc + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), sub);
  }, 0);

  const setLine = (lineId: string, patch: Partial<TwoSectionLine>) => {
    updateLines(lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const addSectionA = () => updateLines([...lines, newLineA()]);
  const addSectionB = () => updateLines([...lines, newLineB()]);
  const removeLine = (lineId: string) => updateLines(lines.filter((line) => line.id !== lineId));

  const addSubRow = (lineId: string, type: "parts" | "labor") => {
    updateLines(
      lines.map((line) =>
        line.id !== lineId
          ? line
          : {
              ...line,
              sub_rows: [
                ...(line.sub_rows ?? []),
                {
                  id: crypto.randomUUID(),
                  line_type: type,
                  description: "",
                  quantity: 1,
                  unit_cost: 0,
                  amount: 0,
                  part_location_codes: [],
                },
              ],
            }
      )
    );
  };

  const setSubRow = (lineId: string, subId: string, patch: Partial<TwoSectionSubRow>) => {
    updateLines(
      lines.map((line) =>
        line.id !== lineId
          ? line
          : {
              ...line,
              sub_rows: (line.sub_rows ?? []).map((row) => (row.id === subId ? { ...row, ...patch } : row)),
            }
      )
    );
  };

  const removeSubRow = (lineId: string, subId: string) => {
    updateLines(
      lines.map((line) =>
        line.id !== lineId ? line : { ...line, sub_rows: (line.sub_rows ?? []).filter((row) => row.id !== subId) }
      )
    );
  };

  const selectedLocationCodes =
    locationTarget == null
      ? []
      : lines
          .find((line) => line.id === locationTarget.lineId)
          ?.sub_rows?.find((row) => row.id === locationTarget.subId)?.part_location_codes ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-xs font-semibold text-yellow-900">
        Section A - Category lines (OPTIONAL)
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Category</th>
              <th className="px-2 py-1 text-left">Description</th>
              <th className="px-2 py-1 text-left">Qty</th>
              <th className="px-2 py-1 text-left">Amount</th>
              <th className="px-2 py-1 text-left">Total</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {sectionA.map((line) => (
              <tr key={line.id} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <input
                    disabled={readOnly}
                    value={line.expense_category_uuid ?? ""}
                    onChange={(event) => setLine(line.id, { expense_category_uuid: event.target.value })}
                    className="w-full rounded border border-gray-300 px-2 py-1"
                    placeholder="expense_category_uuid"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    disabled={readOnly}
                    value={line.description}
                    onChange={(event) => setLine(line.id, { description: event.target.value })}
                    className="w-full rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={line.quantity}
                    onChange={(event) => {
                      const q = Number(event.target.value || 0);
                      setLine(line.id, { quantity: q, amount: q * Number(line.unit_cost || 0) });
                    }}
                    className="w-20 rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={line.unit_cost}
                    onChange={(event) => {
                      const unitCost = Number(event.target.value || 0);
                      setLine(line.id, { unit_cost: unitCost, amount: unitCost * Number(line.quantity || 0) });
                    }}
                    className="w-24 rounded border border-gray-300 px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">${Number(line.amount || 0).toFixed(2)}</td>
                <td className="px-2 py-1 text-right">
                  <button disabled={readOnly} onClick={() => removeLine(line.id)} className="text-red-600" type="button">
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {sectionA.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-2 text-center text-gray-500">
                  No Section A lines
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <button disabled={readOnly} type="button" onClick={addSectionA} className="rounded border border-gray-300 px-2 py-1 text-xs">
        + Add category line
      </button>
      <div className="text-right text-xs font-semibold">Subtotal A: ${subtotalA.toFixed(2)}</div>

      <div className="rounded border border-green-300 bg-green-50 p-2 text-xs font-semibold text-green-900">
        Section B - Item / Parts / Labor (OPTIONAL)
      </div>
      <div className="space-y-2">
        {sectionB.map((line) => (
          <div key={line.id} className="rounded border border-gray-200 bg-white p-2">
            <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_90px_120px_120px_40px]">
              <input
                disabled={readOnly}
                value={line.service_item_uuid ?? ""}
                onChange={(event) => setLine(line.id, { service_item_uuid: event.target.value })}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                placeholder="service_item_uuid"
              />
              <input
                disabled={readOnly}
                value={line.description}
                onChange={(event) => setLine(line.id, { description: event.target.value })}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                placeholder="Description"
              />
              <input
                disabled={readOnly}
                type="number"
                min={0}
                value={line.quantity}
                onChange={(event) => {
                  const q = Number(event.target.value || 0);
                  setLine(line.id, { quantity: q, amount: q * Number(line.unit_cost || 0) });
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                disabled={readOnly}
                type="number"
                min={0}
                value={line.unit_cost}
                onChange={(event) => {
                  const unitCost = Number(event.target.value || 0);
                  setLine(line.id, { unit_cost: unitCost, amount: unitCost * Number(line.quantity || 0) });
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold">
                ${Number(line.amount || 0).toFixed(2)}
              </div>
              <button disabled={readOnly} onClick={() => removeLine(line.id)} className="text-red-600" type="button">
                ×
              </button>
            </div>

            <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
              <div className="mb-1 text-[11px] font-semibold text-gray-600">Parts & Labor</div>
              {(line.sub_rows ?? []).map((row) => (
                <div key={row.id} className="mb-1 grid gap-1 md:grid-cols-[80px_1fr_150px_80px_100px_100px_30px]">
                  <div className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] uppercase">{row.line_type}</div>
                  <input
                    disabled={readOnly}
                    value={row.description}
                    onChange={(event) => setSubRow(line.id, row.id, { description: event.target.value })}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    placeholder={row.line_type === "parts" ? "Part description" : "Labor description"}
                  />
                  {row.line_type === "parts" ? (
                    <button
                      disabled={readOnly}
                      type="button"
                      onClick={() => setLocationTarget({ lineId: line.id, subId: row.id })}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-left text-xs"
                    >
                      📍 {row.part_location_codes?.join(", ") || "Select location(s)"}
                    </button>
                  ) : (
                    <div className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-xs text-gray-500">No location</div>
                  )}
                  <input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={row.quantity}
                    onChange={(event) => {
                      const quantity = Number(event.target.value || 0);
                      setSubRow(line.id, row.id, { quantity, amount: quantity * Number(row.unit_cost || 0) });
                    }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                  <input
                    disabled={readOnly}
                    type="number"
                    min={0}
                    value={row.unit_cost}
                    onChange={(event) => {
                      const unitCost = Number(event.target.value || 0);
                      setSubRow(line.id, row.id, { unit_cost: unitCost, amount: Number(row.quantity || 0) * unitCost });
                    }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                  <div className="rounded border border-gray-200 bg-white px-2 py-1 text-xs">${Number(row.amount || 0).toFixed(2)}</div>
                  <button disabled={readOnly} onClick={() => removeSubRow(line.id, row.id)} className="text-red-600" type="button">
                    ×
                  </button>
                </div>
              ))}
              <div className="flex gap-1">
                <button disabled={readOnly} type="button" onClick={() => addSubRow(line.id, "parts")} className="rounded border border-gray-300 px-2 py-1 text-xs">
                  + Add part
                </button>
                <button disabled={readOnly} type="button" onClick={() => addSubRow(line.id, "labor")} className="rounded border border-gray-300 px-2 py-1 text-xs">
                  + Add labor
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button disabled={readOnly} type="button" onClick={addSectionB} className="rounded border border-gray-300 px-2 py-1 text-xs">
        + Add item line
      </button>
      <div className="text-right text-xs font-semibold">Subtotal B: ${subtotalB.toFixed(2)}</div>

      <PartLocationMapDialog
        open={Boolean(locationTarget)}
        selectedCodes={selectedLocationCodes}
        onClose={() => setLocationTarget(null)}
        onApply={(codes) => {
          if (locationTarget) setSubRow(locationTarget.lineId, locationTarget.subId, { part_location_codes: codes });
          setLocationTarget(null);
        }}
      />
    </div>
  );
}
