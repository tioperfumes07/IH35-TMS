/**
 * ReimbursementsSection — settlement reimbursement lines per the reference design
 * (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html).
 *
 * Columns: Number, Load #, Date, Vendor, Category, Vendor invoice #, Receipt, Amount.
 * Section header: "Reimbursements" with subtitle "driver paid out of pocket · receipt required".
 * "+ Add reimbursement" button in the header (disabled when settlement is locked).
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
  description: string;
  reimbursement_type?: string | null;
  vendor_name?: string | null;
  vendor_invoice_number?: string | null;
  receipt_number?: string | null;
  amount: number;
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
    key: "vendor_name",
    label: "Vendor",
    sortable: true,
    sortValue: (line) => line.vendor_name ?? "",
    render: (line) => line.vendor_name ?? "—",
  },
  {
    key: "reimbursement_type",
    label: "Category",
    sortable: true,
    sortValue: (line) => line.reimbursement_type ?? "",
    render: (line) => line.reimbursement_type ?? "—",
  },
  {
    key: "vendor_invoice_number",
    label: "Vendor invoice #",
    sortable: true,
    sortValue: (line) => line.vendor_invoice_number ?? "",
    render: (line) => line.vendor_invoice_number ?? "—",
  },
  {
    key: "receipt_number",
    label: "Receipt",
    sortable: true,
    sortValue: (line) => line.receipt_number ?? "",
    render: (line) =>
      line.receipt_number ? (
        <button type="button" className="text-slate-700 underline">
          {line.receipt_number}
        </button>
      ) : (
        "—"
      ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    render: (line) => `$${Number(line.amount).toFixed(2)}`,
  },
];

export function ReimbursementsSection({ lines, isOpen }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return (
    <section className="rounded-sm border border-gray-200 bg-white">
      <header className="flex items-center border-b border-gray-200 px-2.5 py-1.5">
        <h2 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">Reimbursements</h2>
        <span className="ml-2 text-xs text-slate-500">driver paid out of pocket · receipt required</span>
        <div className="ml-auto">
          <Button size="sm" variant="secondary" disabled={!isOpen} title={!isOpen ? "Settlement locked" : undefined}>
            + Add reimbursement
          </Button>
        </div>
      </header>
      <ParityTable<Line>
        columns={COLUMNS}
        rows={lines}
        rowKey={(line) => line.id}
        storageKey="driver-finance-reimbursements-section"
        tableTestId="driver-finance-reimbursements-table"
        emptyText="No reimbursements."
        embedded
        hidePager
      />
      <div className="mt-1 px-2.5 py-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)}</div>
    </section>
  );
}
