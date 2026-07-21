import { Modal } from "../../../components/Modal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Liability = {
  id: string;
  type: string;
  source_description: string;
  original: number;
  paid: number;
  balance: number;
  schedule: string;
  pending_ack?: boolean;
};

type Props = {
  open: boolean;
  liabilities: Liability[];
  onClose: () => void;
};

// Display-only migration to shared ParityTable grammar — amounts render exactly as before
// (`$` + toFixed(2)); totals footer + pending-ack note preserved 1:1 outside the table.
const COLUMNS: Array<ParityColumn<Liability>> = [
  { key: "type", label: "Type", sortable: true },
  { key: "source_description", label: "Source", sortable: true },
  {
    key: "original",
    label: "Original",
    sortable: true,
    render: (item) => `$${item.original.toFixed(2)}`,
  },
  {
    key: "paid",
    label: "Paid",
    sortable: true,
    render: (item) => `$${item.paid.toFixed(2)}`,
  },
  {
    key: "balance",
    label: "Balance",
    sortable: true,
    render: (item) => `$${item.balance.toFixed(2)}`,
  },
  { key: "schedule", label: "Schedule", sortable: true },
];

export function LiabilityBreakdownModal({ open, liabilities, onClose }: Props) {
  const total = liabilities.reduce((sum, item) => sum + item.balance, 0);
  const excludingPending = liabilities.reduce((sum, item) => sum + (item.pending_ack ? 0 : item.balance), 0);
  return (
    <Modal open={open} onClose={onClose} title="Liability Breakdown">
      <ParityTable<Liability>
        columns={COLUMNS}
        rows={liabilities}
        rowKey={(item) => item.id}
        storageKey="driver-finance-liability-breakdown"
        tableTestId="driver-finance-liability-breakdown-table"
        emptyText="No liabilities."
      />
      <div className="mt-2 rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs">
        <div>TOTAL ACTIVE: <span className="font-semibold">${total.toFixed(2)}</span></div>
        <div>EXCLUDING PENDING ACK: <span className="font-semibold">${excludingPending.toFixed(2)}</span></div>
      </div>
      <div className="mt-2 text-[11px] text-gray-500">
        Settlement detail uses live recompute authority and excludes pending-ack liabilities from active debt display.
      </div>
    </Modal>
  );
}
