import { createCustomerAdjustmentInvoice } from "../../../api/accounting";
import { InvoiceTypeModalBase } from "./InvoiceTypeModalBase";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
};

export function CustomerAdjustmentModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <InvoiceTypeModalBase
      open={open}
      operatingCompanyId={operatingCompanyId}
      title="Create Customer Adjustment"
      billToEntityType="customer"
      onClose={onClose}
      onCreated={onCreated}
      createInvoice={(payload) => createCustomerAdjustmentInvoice(operatingCompanyId, payload)}
    />
  );
}
