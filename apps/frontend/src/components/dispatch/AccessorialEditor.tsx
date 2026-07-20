import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { additionalChargesCatalogClient } from "../../api/catalogs-dispatch";
import { SelectCombobox } from "../shared/SelectCombobox";
import { MoneyInput } from "../forms/MoneyInput";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
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
  /** W7 — per-stop extra rates (stops[].extra_rates) rolled into the displayed Accessorial subtotal. */
  extraSubtotalCents?: number;
};

function updateRow(rows: AccessorialRow[], id: string, patch: Partial<AccessorialRow>): AccessorialRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function AccessorialEditor({ operatingCompanyId, rows, onRowsChange, onDetentionSeed, extraSubtotalCents = 0 }: Props) {
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

  const accessorialSubtotal = sumAccessorialCents(rows) + Math.max(0, extraSubtotalCents);

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

  const columns = useMemo((): Array<ParityColumn<AccessorialRow>> => {
    return [
      {
        key: "code",
        label: "Code",
        sortable: true,
        render: (row) => (
          <SelectCombobox
            value={row.code}
            onChange={(event) => handleCodeChange(row.id, event.target.value)}
            className="h-7 w-full min-w-28 text-xs"
          >
            <option value="">{catalogQuery.isLoading ? "Loading codes…" : "Select code"}</option>
            {catalogOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        ),
      },
      {
        key: "description",
        label: "Description",
        sortable: true,
        render: (row) => (
          <input
            type="text"
            value={row.description}
            onChange={(event) => onRowsChange(updateRow(rows, row.id, { description: event.target.value }))}
            className="h-7 w-full rounded-sm border border-gray-300 px-2 text-xs"
          />
        ),
      },
      {
        key: "amount_cents",
        label: "Amount ($)",
        sortable: true,
        cellClass: "text-right",
        render: (row) => (
          <MoneyInput
            valueCents={row.amount_cents}
            onChangeCents={(c) => onRowsChange(updateRow(rows, row.id, { amount_cents: Math.max(0, c ?? 0) }))}
            className="ml-auto w-24"
            ariaLabel="Accessorial amount"
          />
        ),
      },
      {
        key: "taxable",
        label: "Taxable",
        sortable: true,
        cellClass: "text-center",
        render: (row) => (
          <input
            type="checkbox"
            checked={row.taxable}
            onChange={(event) => onRowsChange(updateRow(rows, row.id, { taxable: event.target.checked }))}
          />
        ),
      },
    ];
  }, [catalogOptions, catalogQuery.isLoading, onRowsChange, rows]);

  const catalogErr = catalogQuery.error as { status?: number; message?: string } | null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-[10.5px] font-semibold text-[#1f2a44] hover:underline" onClick={handleCreateCharge}>
          + Create charge
        </button>
        <span className="text-[10px] text-gray-400">·</span>
        {(["detention", "layover", "lumper"] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            className="text-[10.5px] font-semibold capitalize text-[#1f2a44] hover:underline"
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

      {catalogQuery.isError ? (
        <ListErrorState
          title="Couldn't load accessorial codes"
          status={typeof catalogErr?.status === "number" ? catalogErr.status : 0}
          message={catalogErr?.message}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : null}

      <ParityTable
        storageKey="dispatch-accessorial-editor"
        tableTestId="accessorial-editor-table"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyText="No accessorial charges yet. Use + Create charge or quick seeds (detention · layover · lumper)."
        initialPageSize={50}
        pageSizeOptions={[25, 50, 100]}
        rowActions={(row) => (
          <button type="button" className="text-[10px] text-red-700 hover:underline" onClick={() => handleRemove(row.id)}>
            Remove
          </button>
        )}
      />
    </div>
  );
}
