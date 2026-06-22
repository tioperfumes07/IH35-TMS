/**
 * CLOSURE-12 — PayrollAggregateTable: Person | Type | Class | Gross | Deductions | Net
 */
import type { PayrollPerson } from "../../hooks/usePayrollAggregate";

function cents(n: number) {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = { persons: PayrollPerson[] };

export function PayrollAggregateTable({ persons }: Props) {
  if (persons.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-gray-500">No payroll records for this period.</div>;
  }
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">Person</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Class</th>
            <th className="px-3 py-2 text-right">Gross</th>
            <th className="px-3 py-2 text-right">Deductions</th>
            <th className="px-3 py-2 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => (
            <tr key={p.person_id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 font-medium">{p.person_name}</td>
              <td className="px-3 py-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${p.pay_type === "W2" ? "bg-slate-100 text-slate-700" : "bg-green-50 text-green-700"}`}>
                  {p.pay_type}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-gray-600">{p.class}</td>
              <td className="px-3 py-2 text-right tabular-nums">{cents(p.gross_cents)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-600">−{cents(p.deductions_cents)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{cents(p.net_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
