import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { listCustomers } from "../../../api/mdata";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/Combobox";
import { Modal } from "../../../components/Modal";
import { UploadZone } from "../../../components/UploadZone";
import { useToast } from "../../../components/Toast";
import { FieldError, fieldErrorClassname } from "../../../components/forms/FieldError";
import { FormErrorBanner } from "../../../components/forms/FormErrorBanner";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { SaveDropdown } from "../../../components/forms/SaveDropdown";
import { useFormValidation } from "../../../components/forms/useFormValidation";
import { useUnsavedChanges } from "../../../hooks/useUnsavedChanges";

const invoiceModalSchema = z.object({
  customer_id: z.string().min(1, "Customer is required").uuid("Customer is required"),
  issue_date: z.string(),
  due_date: z.string(),
  notes: z.string(),
});

export type InvoiceCreatedFollowUp = "detail" | "stay_open" | "view_list";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  title: string;
  billToEntityType: "customer" | "driver" | "vendor" | "other";
  onClose: () => void;
  onCreated: (invoiceId: string, followUp?: InvoiceCreatedFollowUp) => void;
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

export function InvoiceTypeModalBase({
  open,
  operatingCompanyId,
  title,
  billToEntityType,
  onClose,
  onCreated,
  createInvoice,
}: Props) {
  const { pushToast } = useToast();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const invoiceAttemptCloseRef = useRef<(() => void) | null>(null);
  const invoiceSaveModeRef = useRef<"default" | "add_another" | "view_list" | "pdf">("default");
  const [invoiceBaseline, setInvoiceBaseline] = useState<{
    customer_id: string;
    issue_date: string;
    due_date: string;
    notes: string;
  } | null>(null);

  const formSnapshot = useMemo(
    () => ({
      customer_id: customerId ?? "",
      issue_date: issueDate,
      due_date: dueDate,
      notes,
    }),
    [customerId, issueDate, dueDate, notes]
  );

  const { isDirty: invoiceIsDirty } = useUnsavedChanges(formSnapshot, invoiceBaseline ?? formSnapshot);

  const customersQuery = useQuery({
    queryKey: ["invoice-type-modal", "customers", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId }).then((res) => res.customers),
    enabled: open,
  });

  const resetInvoiceFormToNew = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    setCustomerId(null);
    setNotes("");
    setIssueDate(today);
    setDueDate("");
    setDraftAttachmentEntityId(crypto.randomUUID());
    setInvoiceBaseline({ customer_id: "", issue_date: today, due_date: "", notes: "" });
  }, []);

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
      });
      const mode = invoiceSaveModeRef.current;
      if (mode === "add_another") {
        onCreated(created.id, "stay_open");
        resetInvoiceFormToNew();
        resetInvoiceErrors();
        pushToast("Invoice created", "success");
        return;
      }
      if (mode === "view_list") {
        onCreated(created.id, "view_list");
        pushToast("Invoice created", "success");
        return;
      }
      if (mode === "pdf") {
        onCreated(created.id, "detail");
        pushToast("Invoice created. Use invoice detail or print for PDF.", "success");
        return;
      }
      onCreated(created.id, "detail");
      pushToast("Invoice created", "success");
    },
  });

  useEffect(() => {
    if (!open) {
      setInvoiceBaseline(null);
      return;
    }
    resetInvoiceFormToNew();
    resetInvoiceErrors();
  }, [open, resetInvoiceFormToNew, resetInvoiceErrors]);

  const runInvoiceSave = useCallback(
    (mode: "default" | "add_another" | "view_list" | "pdf") => {
      invoiceSaveModeRef.current = mode;
      void submitInvoiceCreate(formSnapshot);
    },
    [formSnapshot, submitInvoiceCreate]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      confirmDiscardOnClose
      isDirty={invoiceIsDirty}
      onRegisterAttemptClose={(fn) => {
        invoiceAttemptCloseRef.current = fn;
      }}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <FormErrorBanner message={invoiceApiError} />
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Customer</label>
            <Combobox
              dataField="customer_id"
              options={(customersQuery.data ?? []).map((row) => ({ value: row.id, label: row.name, sublabel: row.customer_code ?? undefined }))}
              value={customerId}
              onChange={(next) => {
                clearInvoiceFieldError("customer_id");
                setCustomerId(next);
              }}
              loading={customersQuery.isLoading}
              placeholder="Select customer"
              error={invoiceFieldErrors.customer_id}
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
          <Button type="button" variant="secondary" onClick={() => invoiceAttemptCloseRef.current?.()}>
            Cancel
          </Button>
          <SaveDropdown
            storageKey={`invoice-type-${billToEntityType}`}
            primaryLabel="Save"
            onSave={() => void runInvoiceSave("default")}
            onSaveAndClose={() => void runInvoiceSave("default")}
            onSaveAndAddAnother={() => void runInvoiceSave("add_another")}
            onSaveAndDownload={() => void runInvoiceSave("pdf")}
            onSaveAndViewList={() => void runInvoiceSave("view_list")}
          />
        </div>
      </form>
    </Modal>
  );
}
