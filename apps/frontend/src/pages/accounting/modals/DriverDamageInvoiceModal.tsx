import { createDriverDamageInvoice } from "../../../api/accounting";
import { InvoiceTypeModalBase } from "./InvoiceTypeModalBase";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
};

export function DriverDamageInvoiceModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <InvoiceTypeModalBase
      open={open}
      operatingCompanyId={operatingCompanyId}
      title="Create Driver Damage Invoice"
      billToEntityType="driver"
      onClose={onClose}
      onCreated={onCreated}
      createInvoice={(payload) => createDriverDamageInvoice(operatingCompanyId, payload)}
    />
  );
}
