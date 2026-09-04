import { ParityTable } from "../parity/ParityTable";
import type { AllocationPreviewRow } from "./types";

type Props = {
  rows: AllocationPreviewRow[];
  totalCents: number;
  isLoading?: boolean;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function AllocationPreviewTable({ rows, totalCents, isLoading }: Props) {
  const allocated = rows.reduce((sum, row) => sum + row.allocated_amount_cents, 0);
  const balanced = allocated === totalCents;

  return (
    <section className="rounded-sm border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-900">Allocation preview</h3>
        <span className={`text-xs font-medium ${balanced ? "text-green-700" : "text-amber-700"}`}>
          {isLoading ? "Calculating…" : balanced ? "Penny-exact" : `Delta ${money(totalCents - allocated)}`}
        </span>
      </div>
      {/* ACCT-F3584: embedded ParityTable owns Search+Range+gear inside the preview frame. */}
      <ParityTable<AllocationPreviewRow>
        embedded
        rows={rows}
        rowKey={(row) => row.asset_id}
        storageKey="allocation-preview-rows"
        exportFilename="allocation-preview"
        tableTestId="allocation-preview-table"
        emptyText="Select assets to preview allocation rows."
        columns={[
          {
            key: "unit",
            label: "Unit",
            cellClass: "font-medium text-gray-900",
            render: (row) => row.unit_code,
          },
          {
            key: "method",
            label: "Method",
            cellClass: "text-gray-700",
            render: (row) => row.allocation_method.replaceAll("_", " "),
          },
          {
            key: "pct",
            label: "%",
            className: "text-right",
            cellClass: "text-right font-mono",
            render: (row) => row.allocation_pct.toFixed(4),
          },
          {
            key: "amount",
            label: "Amount",
            className: "text-right",
            cellClass: "text-right font-mono",
            render: (row) => money(row.allocated_amount_cents),
          },
        ]}
      />
    </section>
  );
}
