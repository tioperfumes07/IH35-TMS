import type { Customer } from "../../api/mdata";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  customer: Customer | null;
  openBalanceCents?: number;
  overdueCents?: number;
  onClose: () => void;
};

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function CustomerDrillModal({ open, customer, openBalanceCents = 0, overdueCents = 0, onClose }: Props) {
  if (!open || !customer) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Customer · ${customer.name}`} modalKind="customer_drill" sizePreset="md">
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">
          {customer.customer_code || "Customer"} · {customer.customer_type ?? "Type not set"}
        </p>
        <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-gray-600">Email</dt>
            <dd>{customer.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-600">Phone</dt>
            <dd>{customer.phone ?? "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs font-semibold text-gray-600">Billing address</dt>
            <dd>{customer.billing_address ?? "—"}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-gray-600">Open balance</p>
            <p className="text-lg font-semibold text-gray-900">{fmtMoney(openBalanceCents)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600">Overdue payment</p>
            <p className="text-lg font-semibold text-red-700">{fmtMoney(overdueCents)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">FMCSA: {customer.fmcsa_authority_status_at_verification ?? "Not verified"}</p>
      </div>
    </Modal>
  );
}
