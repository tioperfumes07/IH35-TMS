import { createManualInvoice } from "../../../api/accounting";
import { InvoiceTypeModalBase } from "./InvoiceTypeModalBase";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
};

export function ManualInvoiceModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <InvoiceTypeModalBase
      open={open}
      operatingCompanyId={operatingCompanyId}
      title="Create Manual Invoice"
      billToEntityType="other"
      onClose={onClose}
      onCreated={onCreated}
      createInvoice={(payload) => createManualInvoice(operatingCompanyId, payload)}
    />
  );
}
