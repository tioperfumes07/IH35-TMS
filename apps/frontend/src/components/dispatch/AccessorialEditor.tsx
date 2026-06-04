import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { additionalChargesCatalogClient } from "../../api/catalogs-dispatch";
import { SelectCombobox } from "../shared/SelectCombobox";
import {
  createEmptyAccessorialRow,
  seedAccessorialRow,
  sumAccessorialCents,
  type AccessorialRow,
  type AccessorialSeedPreset,
} from "./accessorial-editor-lib";

export type DetentionSeedPatch = {
  detention_expected_y_n: boolean;
  detention_expected_hours?: number;
  detention_bill_customer_per_hour_cents?: number;
};

type Props = {
  operatingCompanyId: string;
  rows: AccessorialRow[];
  onRowsChange: (rows: AccessorialRow[]) => void;
  onDetentionSeed?: (patch: DetentionSeedPatch) => void;
};

function updateRow(rows: AccessorialRow[], id: string, patch: Partial<AccessorialRow>): AccessorialRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function AccessorialEditor({ operatingCompanyId, rows, onRowsChange, onDetentionSeed }: Props) {
  const catalogQuery = useQuery({
    queryKey: ["book-load-additional-charges", operatingCompanyId],
    queryFn: () =>
      additionalChargesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const catalogOptions = useMemo(() => {
    const catalogRows = catalogQuery.data?.rows ?? [];
    if (catalogRows.length > 0) {
      return catalogRows.map((row) => ({
        value: row.code,
        label: row.display_name,
        description: row.description ?? row.display_name,
      }));
    }
    return [
      { value: "DETENTION", label: "Detention", description: "Detention charge" },
      { value: "LAYOVER", label: "Layover", description: "Layover charge" },
      { value: "LUMPER", label: "Lumper", description: "Lumper charge" },
      { value: "TONU", label: "TONU", description: "Truck ordered not used" },
      { value: "MISC", label: "Misc accessorial", description: "Misc accessorial" },
    ];
  }, [catalogQuery.data?.rows]);

  const accessorialSubtotal = sumAccessorialCents(rows);

  function appendRow(row: AccessorialRow) {
    onRowsChange([...rows, row]);
  }

  function handleCreateCharge() {
    appendRow(createEmptyAccessorialRow());
  }

  function handleSeed(preset: AccessorialSeedPreset) {
    const row = seedAccessorialRow(preset);
    appendRow(row);
    if (preset === "detention") {
      onDetentionSeed?.({ detention_expected_y_n: true });
    }
  }

  function handleCodeChange(id: string, code: string) {
    const option = catalogOptions.find((o) => o.value === code);
    onRowsChange(
      updateRow(rows, id, {
        code,
        description: option?.description ?? option?.label ?? "",
      })
    );
  }

  function handleRemove(id: string) {
    onRowsChange(rows.filter((row) => row.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-[10.5px] font-semibold text-[#16203a] hover:underline" onClick={handleCreateCharge}>
          + Create charge
        </button>
        <span className="text-[10px] text-gray-400">·</span>
        {(["detention", "layover", "lumper"] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            className="text-[10.5px] font-semibold capitalize text-[#16203a] hover:underline"
            onClick={() => handleSeed(preset)}
          >
            {preset}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-semibold text-gray-600">
          Accessorial subtotal{" "}
          <span className="font-mono text-gray-900">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(accessorialSubtotal / 100)}
          </span>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-[10px] text-gray-500">No accessorial charges yet. Use + Create charge or quick seeds (detention · layover · lumper).</p>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-[#f7f8fa] text-left text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-2 py-1">Code</th>
                <th className="px-2 py-1">Description</th>
                <th className="px-2 py-1 text-right">Amount (¢)</th>
                <th className="px-2 py-1 text-center">Taxable</th>
                <th className="px-2 py-1 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="px-2 py-1">
                    <SelectCombobox
                      value={row.code}
                      onChange={(event) => handleCodeChange(row.id, event.target.value)}
                      className="h-7 w-full min-w-[7rem] text-xs"
                    >
                      <option value="">{catalogQuery.isLoading ? "Loading codes…" : "Select code"}</option>
                      {catalogOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectCombobox>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(event) => onRowsChange(updateRow(rows, row.id, { description: event.target.value }))}
                      className="h-7 w-full rounded border border-gray-300 px-2 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.amount_cents}
                      onChange={(event) =>
                        onRowsChange(updateRow(rows, row.id, { amount_cents: Math.max(0, Number(event.target.value) || 0) }))
                      }
                      className="h-7 w-24 rounded border border-gray-300 px-2 text-right text-xs"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={row.taxable}
                      onChange={(event) => onRowsChange(updateRow(rows, row.id, { taxable: event.target.checked }))}
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button type="button" className="text-[10px] text-red-700 hover:underline" onClick={() => handleRemove(row.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
