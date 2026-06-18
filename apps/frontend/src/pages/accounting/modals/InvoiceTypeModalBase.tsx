import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { UploadZone } from "../../../components/UploadZone";
import { useToast } from "../../../components/Toast";
import { FieldError, fieldErrorClassname } from "../../../components/forms/FieldError";
import { FormErrorBanner } from "../../../components/forms/FormErrorBanner";
import { useFormValidation } from "../../../components/forms/useFormValidation";
import { QboCombobox } from "../../../components/forms/QboCombobox";

const invoiceModalSchema = z.object({
  customer_id: z.string().min(1, "Customer is required").uuid("Customer is required"),
  issue_date: z.string(),
  due_date: z.string(),
  notes: z.string(),
});

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
    attachment_draft_id?: string;
  }) => Promise<{ id: string }>;
};

export function InvoiceTypeModalBase({ open, operatingCompanyId, title, billToEntityType, onClose, onCreated, createInvoice }: Props) {
  const { pushToast } = useToast();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQboId, setCustomerQboId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());

  const formSnapshot = useMemo(
    () => ({
      customer_id: customerId ?? "",
      issue_date: issueDate,
      due_date: dueDate,
      notes,
    }),
    [customerId, issueDate, dueDate, notes]
  );

  const {
    fieldErrors: invoiceFieldErrors,
    apiError: invoiceApiError,
    submit: submitInvoiceCreate,
    clearFieldError: clearInvoiceFieldError,
    resetErrors: resetInvoiceErrors,
  } = useFormValidation({
    schema: invoiceModalSchema,
    onSubmit: async (parsed) => {
      const created = await createInvoice({
        customer_id: parsed.customer_id,
        bill_to_entity_type: billToEntityType,
        bill_to_entity_id: parsed.customer_id,
        issue_date: parsed.issue_date || undefined,
        due_date: parsed.due_date || undefined,
        internal_notes: parsed.notes || undefined,
        customer_notes: parsed.notes || undefined,
        // Option B: send the UploadZone draft id so the invoice route re-keys the rate-con/BOL onto the
        // new invoice (otherwise it orphans).
        attachment_draft_id: draftAttachmentEntityId,
      });
      onCreated(created.id);
      pushToast("Invoice created", "success");
    },
  });

  useEffect(() => {
    if (!open) return;
    setCustomerId(null);
    setCustomerQboId(null);
    setCustomerName("");
    setNotes("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    resetInvoiceErrors();
    setDraftAttachmentEntityId(crypto.randomUUID());
  }, [open, resetInvoiceErrors]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submitInvoiceCreate(formSnapshot);
        }}
      >
        <FormErrorBanner message={invoiceApiError} />
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Customer *</label>
            <QboCombobox
              entityType="customer"
              operatingCompanyId={operatingCompanyId}
              value={customerQboId}
              displayValue={customerName}
              allowFreeText={false}
              placeholder="Select QBO customer (type to search)…"
              onChange={(qboId, name) => {
                clearInvoiceFieldError("customer_id");
                if (qboId) {
                  setCustomerQboId(qboId);
                  setCustomerName(name);
                  return;
                }
                setCustomerName(name);
              }}
              onPick={(row) => {
                clearInvoiceFieldError("customer_id");
                setCustomerId(row.id);
                setCustomerQboId(row.qbo_id);
                setCustomerName(row.display_name);
                setNotes((prev) => {
                  if (prev.trim()) return prev;
                  const parts: string[] = [`Bill-to: ${row.display_name}`];
                  if (row.company_name) parts.push(String(row.company_name));
                  if (row.primary_email) parts.push(`Email: ${row.primary_email}`);
                  if (row.primary_phone) parts.push(`Phone: ${row.primary_phone}`);
                  return parts.join("\n");
                });
              }}
            />
            <FieldError id="customer_id" message={invoiceFieldErrors.customer_id} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">QBO customer reference (appends to Notes)</label>
            <QboCombobox
              entityType="customer"
              operatingCompanyId={operatingCompanyId}
              value={null}
              displayValue=""
              allowFreeText={false}
              onChange={(qboId, displayName) => {
                if (!qboId) return;
                const line = `QBO customer: ${displayName} (${qboId})`;
                setNotes((prev) => (prev ? `${prev}\n${line}` : line));
              }}
            />
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Issue date
            <input
              data-field="issue_date"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.issue_date), "mt-1 h-9 w-full rounded border px-2 text-sm")}
              type="date"
              value={issueDate}
              aria-describedby={invoiceFieldErrors.issue_date ? "issue_date-error" : undefined}
              onChange={(event) => {
                clearInvoiceFieldError("issue_date");
                setIssueDate(event.target.value);
              }}
            />
            <FieldError id="issue_date" message={invoiceFieldErrors.issue_date} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Due date
            <input
              data-field="due_date"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.due_date), "mt-1 h-9 w-full rounded border px-2 text-sm")}
              type="date"
              value={dueDate}
              aria-describedby={invoiceFieldErrors.due_date ? "due_date-error" : undefined}
              onChange={(event) => {
                clearInvoiceFieldError("due_date");
                setDueDate(event.target.value);
              }}
            />
            <FieldError id="due_date" message={invoiceFieldErrors.due_date} />
          </label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">
            Notes
            <textarea
              data-field="notes"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.notes), "mt-1 min-h-24 w-full rounded border px-2 py-1 text-sm")}
              value={notes}
              aria-describedby={invoiceFieldErrors.notes ? "notes-error" : undefined}
              onChange={(event) => {
                clearInvoiceFieldError("notes");
                setNotes(event.target.value);
              }}
            />
            <FieldError id="notes" message={invoiceFieldErrors.notes} />
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
