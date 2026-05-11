import { createDriverMiscInvoice } from "../../../api/accounting";
import { InvoiceTypeModalBase } from "./InvoiceTypeModalBase";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
};

export function DriverMiscInvoiceModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <InvoiceTypeModalBase
      open={open}
      operatingCompanyId={operatingCompanyId}
      title="Create Driver Misc Invoice"
      billToEntityType="driver"
      onClose={onClose}
      onCreated={onCreated}
      createInvoice={(payload) => createDriverMiscInvoice(operatingCompanyId, payload)}
    />
  );
}
