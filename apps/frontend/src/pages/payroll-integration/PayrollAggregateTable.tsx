/**
 * CLOSURE-12 — PayrollAggregateTable: Person | Type | Class | Gross | Deductions | Net
 *
 * Display-only aggregate table (props in, no query/mutation). Migrated to the shared
 * ParityTable grammar; amount formatting, sign, and column order preserved 1:1.
 */
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import type { PayrollPerson } from "../../hooks/usePayrollAggregate";

function cents(n: number) {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const COLUMNS: Array<ParityColumn<PayrollPerson>> = [
  {
    key: "person_name",
    label: "Person",
    render: (p) => <span className="font-medium">{p.person_name}</span>,
  },
  {
    key: "pay_type",
    label: "Type",
    render: (p) => (
      <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${p.pay_type === "W2" ? "bg-slate-100 text-slate-700" : "bg-green-50 text-green-700"}`}>
        {p.pay_type}
      </span>
    ),
  },
  {
    key: "class",
    label: "Class",
    render: (p) => <span className="text-xs text-gray-600">{p.class}</span>,
  },
  {
    key: "gross_cents",
    label: "Gross",
    className: "text-right",
    render: (p) => <span className="tabular-nums">{cents(p.gross_cents)}</span>,
  },
  {
    key: "deductions_cents",
    label: "Deductions",
    className: "text-right",
    render: (p) => <span className="tabular-nums text-red-600">−{cents(p.deductions_cents)}</span>,
  },
  {
    key: "net_cents",
    label: "Net",
    className: "text-right",
    render: (p) => <span className="tabular-nums font-semibold">{cents(p.net_cents)}</span>,
  },
];

type Props = { persons: PayrollPerson[] };

export function PayrollAggregateTable({ persons }: Props) {
  return (
    <ParityTable
      columns={COLUMNS}
      rows={persons}
      rowKey={(p) => p.person_id}
      storageKey="payroll-aggregate"
      tableTestId="payroll-aggregate-table"
      emptyText="No payroll records for this period."
    />
  );
}
