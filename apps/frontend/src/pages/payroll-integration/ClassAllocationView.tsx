/**
 * CLOSURE-12 — ClassAllocationView: bar chart of UNIT-DRIVER vs OFFICE vs OTHER.
 */
import type { PayrollClassAllocation } from "../../hooks/usePayrollAggregate";

function cents(n: number) {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CLASS_COLORS: Record<string, string> = {
  "UNIT-DRIVER": "bg-slate-1000",
  OFFICE: "bg-emerald-500",
  OTHER: "bg-gray-400",
};

type Props = { allocations: PayrollClassAllocation[]; totalCents: number };

export function ClassAllocationView({ allocations, totalCents }: Props) {
  if (allocations.length === 0 || totalCents === 0) {
    return <div className="text-sm text-gray-400">No allocation data.</div>;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Class Allocation</h4>
      <div className="flex h-4 w-full overflow-hidden rounded">
        {allocations.map((alloc) => (
          <div
            key={alloc.class}
            title={`${alloc.class}: ${cents(alloc.amount_cents)}`}
            className={`${CLASS_COLORS[alloc.class] ?? "bg-gray-400"}`}
            style={{ width: `${((alloc.amount_cents / totalCents) * 100).toFixed(1)}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {allocations.map((alloc) => (
          <div key={alloc.class} className="flex items-center gap-2 text-sm">
            <span className={`inline-block h-3 w-3 rounded-sm ${CLASS_COLORS[alloc.class] ?? "bg-gray-400"}`} />
            <span className="font-medium">{alloc.class}</span>
            <span className="tabular-nums text-gray-600">{cents(alloc.amount_cents)}</span>
            <span className="text-gray-400">({((alloc.amount_cents / totalCents) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
