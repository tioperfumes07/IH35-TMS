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
    <section className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-900">Allocation preview</h3>
        <span className={`text-xs font-medium ${balanced ? "text-green-700" : "text-amber-700"}`}>
          {isLoading ? "Calculating…" : balanced ? "Penny-exact" : `Delta ${money(totalCents - allocated)}`}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-gray-500">
                  Select assets to preview allocation rows.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.asset_id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{row.unit_code}</td>
                  <td className="px-3 py-2 text-gray-700">{row.allocation_method.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.allocation_pct.toFixed(4)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(row.allocated_amount_cents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
