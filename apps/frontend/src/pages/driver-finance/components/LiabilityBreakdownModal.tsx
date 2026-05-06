import { Modal } from "../../../components/Modal";

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

export function LiabilityBreakdownModal({ open, liabilities, onClose }: Props) {
  const total = liabilities.reduce((sum, item) => sum + item.balance, 0);
  const excludingPending = liabilities.reduce((sum, item) => sum + (item.pending_ack ? 0 : item.balance), 0);
  return (
    <Modal open={open} onClose={onClose} title="Liability Breakdown">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase text-gray-600">
          <tr><th>Type</th><th>Source</th><th>Original</th><th>Paid</th><th>Balance</th><th>Schedule</th></tr>
        </thead>
        <tbody>
          {liabilities.map((item) => (
            <tr key={item.id} className="border-t border-gray-100">
              <td className="py-1">{item.type}</td>
              <td>{item.source_description}</td>
              <td>${item.original.toFixed(2)}</td>
              <td>${item.paid.toFixed(2)}</td>
              <td>${item.balance.toFixed(2)}</td>
              <td>{item.schedule}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
        <div>TOTAL ACTIVE: <span className="font-semibold">${total.toFixed(2)}</span></div>
        <div>EXCLUDING PENDING ACK: <span className="font-semibold">${excludingPending.toFixed(2)}</span></div>
      </div>
      <div className="mt-2 text-[11px] text-gray-500">
        Settlement detail uses live recompute authority and excludes pending-ack liabilities from active debt display.
      </div>
    </Modal>
  );
}
