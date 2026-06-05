import { ManualInvoiceModal } from "./modals/ManualInvoiceModal";

type Props = {
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
};

export function InvoiceCreateBlankPage({ operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <div className="space-y-3" data-invoice-create-blank="true">
      <p className="text-sm text-gray-600">Create a blank invoice without linking to a load. You can edit all fields before saving.</p>
      <ManualInvoiceModal open operatingCompanyId={operatingCompanyId} onClose={onClose} onCreated={onCreated} />
    </div>
  );
}
