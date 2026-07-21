import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Line = {
  id: string;
  date: string;
  description: string;
  receipt: string;
  amount: number;
};

type Props = { lines: Line[] };

const COLUMNS: Array<ParityColumn<Line>> = [
  { key: "date", label: "Date", sortable: true },
  { key: "description", label: "Description", sortable: true },
  {
    key: "receipt",
    label: "Receipt #",
    sortable: true,
    render: (line) => (
      <button type="button" className="text-slate-700 underline">
        {line.receipt}
      </button>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    render: (line) => `$${Number(line.amount).toFixed(2)}`,
  },
];

export function ReimbursementsSection({ lines }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return (
    <section className="rounded-sm border border-slate-300 bg-slate-100 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-700">C. Reimbursements</h3>
      <ParityTable<Line>
        columns={COLUMNS}
        rows={lines}
        rowKey={(line) => line.id}
        storageKey="driver-finance-reimbursements-section"
        tableTestId="driver-finance-reimbursements-table"
        emptyText="No reimbursements."
      />
      <div className="mt-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
