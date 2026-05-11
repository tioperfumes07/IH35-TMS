import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCustomers } from "../../../api/mdata";
import { Combobox } from "../../../components/Combobox";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  title: string;
  billToEntityType: "customer" | "driver" | "vendor" | "other";
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
  createInvoice: (payload: {
    customer_id: string;
    bill_to_entity_type: "customer" | "driver" | "vendor" | "other";
    bill_to_entity_id?: string | null;
    issue_date?: string;
    due_date?: string;
    internal_notes?: string;
    customer_notes?: string;
  }) => Promise<{ id: string }>;
};

export function InvoiceTypeModalBase({ open, operatingCompanyId, title, billToEntityType, onClose, onCreated, createInvoice }: Props) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());

  const customersQuery = useQuery({
    queryKey: ["invoice-type-modal", "customers", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId }).then((res) => res.customers),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCustomerId(null);
    setNotes("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setError(null);
    setDraftAttachmentEntityId(crypto.randomUUID());
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!customerId) {
            setError("Customer is required.");
            return;
          }
          try {
            const created = await createInvoice({
              customer_id: customerId,
              bill_to_entity_type: billToEntityType,
              bill_to_entity_id: customerId,
              issue_date: issueDate || undefined,
              due_date: dueDate || undefined,
              internal_notes: notes || undefined,
              customer_notes: notes || undefined,
            });
            onCreated(created.id);
          } catch (submitError) {
            setError(String((submitError as Error).message ?? "Failed to create invoice"));
          }
        }}
      >
        {error ? <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div> : null}
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Customer</label>
            <Combobox
              options={(customersQuery.data ?? []).map((row) => ({ value: row.id, label: row.name, sublabel: row.customer_code ?? undefined }))}
              value={customerId}
              onChange={setCustomerId}
              loading={customersQuery.isLoading}
              placeholder="Select customer"
            />
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Issue date
            <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Due date
            <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">
            Notes
            <textarea className="mt-1 min-h-24 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="invoice"
          entityId={draftAttachmentEntityId}
          defaultCategory="vendor_invoice"
          title="Supporting Documents"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </Modal>
  );
}
