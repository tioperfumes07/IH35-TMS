import { createVendorChargebackInvoice } from "../../../api/accounting";
import { InvoiceTypeModalBase } from "./InvoiceTypeModalBase";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
};

export function VendorChargebackModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <InvoiceTypeModalBase
      open={open}
      operatingCompanyId={operatingCompanyId}
      title="Create Vendor Chargeback"
      billToEntityType="vendor"
      onClose={onClose}
      onCreated={onCreated}
      createInvoice={(payload) => createVendorChargebackInvoice(operatingCompanyId, payload)}
    />
  );
}
