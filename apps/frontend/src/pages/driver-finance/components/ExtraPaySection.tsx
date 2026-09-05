/**
 * ExtraPaySection — settlement additional pay lines per the reference design
 * (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html).
 *
 * Columns: Number, Load #, Date, Type, Description, Amount, Status.
 * Section header: "Additional pay" with subtitle "extra delivery / drop · layover · detention".
 * "+ Add additional pay" button in the header (disabled when settlement is locked).
 */
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { Button } from "../../../components/Button";
import { mmmDd } from "../../../lib/formatDate";

type Line = {
  id: string;
  load_id?: string | null;
  load_number?: string | null;
  line_date?: string | null;
  code: string;
  description: string;
  amount: number;
  approval_status?: string | null;
};

type Props = { lines: Line[]; isOpen?: boolean };

const COLUMNS: Array<ParityColumn<Line>> = [
  {
    key: "id",
    label: "Number",
    render: (line) => line.id ?? "—",
  },
  {
    key: "load_id",
    label: "Load #",
    render: (line) =>
      line.load_id ? (
        <EntityLink kind="load" id={line.load_id} label={entityLabel(line.load_number, line.load_id, "Load")} />
      ) : (
        "—"
      ),
  },
  {
    key: "line_date",
    label: "Date",
    sortable: true,
    sortValue: (line) => line.line_date ?? "",
    render: (line) => {
      const d = mmmDd(line.line_date);
      return d || "—";
    },
  },
  {
    key: "code",
    label: "Type",
    sortable: true,
    render: (line) => line.code || "—",
  },
  { key: "description", label: "Description" },
  {
    key: "amount",
    label: "Amount",
    render: (line) => <>${Number(line.amount).toFixed(2)}</>,
  },
  {
    key: "approval_status",
    label: "Status",
    sortable: true,
    sortValue: (line) => line.approval_status ?? "",
    render: (line) => line.approval_status ?? "—",
  },
];

export function ExtraPaySection({ lines, isOpen }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return (
    <section className="rounded-sm border border-gray-200 bg-white">
      <header className="flex items-center border-b border-gray-200 px-2.5 py-1.5">
        <h2 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">Additional pay</h2>
        <span className="ml-2 text-xs text-slate-500">extra delivery / drop · layover · detention</span>
        <div className="ml-auto">
          <Button size="sm" variant="secondary" disabled={!isOpen} title={!isOpen ? "Settlement locked" : undefined}>
            + Add additional pay
          </Button>
        </div>
      </header>
      <ParityTable
        columns={COLUMNS}
        rows={lines}
        rowKey={(line) => line.id}
        storageKey="driver-finance-extra-pay-section"
        tableTestId="extra-pay-section-table"
        emptyText="No additional pay."
        embedded
        hidePager
      />
      <div className="mt-1 px-2.5 py-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
