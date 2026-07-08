import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { UploadZone } from "../../../components/UploadZone";
import { useToast } from "../../../components/Toast";
import { DatePicker } from "../../../components/forms/DatePicker";
import { FieldError, fieldErrorClassname } from "../../../components/forms/FieldError";
import { FormErrorBanner } from "../../../components/forms/FormErrorBanner";
import { useFormValidation } from "../../../components/forms/useFormValidation";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { ApiError } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";

type CreditLimitBlock = {
  exposure_cents: number;
  limit_cents: number;
  credit_limit_source: string | null;
  can_override: boolean;
};

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
    override_credit_limit?: boolean;
  }) => Promise<{ id: string }>;
};

export function InvoiceTypeModalBase({ open, operatingCompanyId, title, billToEntityType, onClose, onCreated, createInvoice }: Props) {
  const { pushToast } = useToast();
  const auth = useAuth();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQboId, setCustomerQboId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [creditLimitBlock, setCreditLimitBlock] = useState<CreditLimitBlock | null>(null);
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);
  const canOverrideCreditLimit = ["Owner", "Administrator", "Manager"].includes(auth.user?.role ?? "");

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
      try {
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
          override_credit_limit: overrideCreditLimit || undefined,
        });
        onCreated(created.id);
        pushToast("Invoice created", "success");
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          const data = err.data as { error?: string; exposure_cents?: number; limit_cents?: number; credit_limit_source?: string | null; can_override?: boolean };
          if (data?.error === "credit_limit_exceeded") {
            setCreditLimitBlock({
              exposure_cents: data.exposure_cents ?? 0,
              limit_cents: data.limit_cents ?? 0,
              credit_limit_source: data.credit_limit_source ?? null,
              can_override: data.can_override ?? false,
            });
            return;
          }
        }
        throw err;
      }
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
    setCreditLimitBlock(null);
    setOverrideCreditLimit(false);
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
            {/* QBO-parity: "Invoice date" per B8 §3 header set; shared DatePicker replaces the raw
                native date input — same "YYYY-MM-DD" value, no payload change. */}
            Invoice date
            <DatePicker
              data-testid="issue_date"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.issue_date), "mt-1 w-full")}
              value={issueDate}
              onChange={(next) => {
                clearInvoiceFieldError("issue_date");
                setIssueDate(next);
              }}
            />
            <FieldError id="issue_date" message={invoiceFieldErrors.issue_date} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Due date
            <DatePicker
              data-testid="due_date"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.due_date), "mt-1 w-full")}
              value={dueDate}
              onChange={(next) => {
                clearInvoiceFieldError("due_date");
                setDueDate(next);
              }}
            />
            <FieldError id="due_date" message={invoiceFieldErrors.due_date} />
          </label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">
            Notes
            <textarea
              data-field="notes"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.notes), "mt-1 min-h-24 w-full rounded-sm border px-2 py-1 text-sm")}
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
        {creditLimitBlock ? (
          <div className="rounded-sm border-2 border-slate-300 bg-slate-50 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-slate-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-slate-500" />
              Credit limit reached
            </p>
            <p className="mt-1 text-slate-600">
              Open exposure: ${((creditLimitBlock.exposure_cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} &mdash;{" "}
              Limit: ${((creditLimitBlock.limit_cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              {creditLimitBlock.credit_limit_source === "factor" ? " (Factor-set — FARO)" : ""}
            </p>
            {canOverrideCreditLimit ? (
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={overrideCreditLimit}
                  onChange={(e) => setOverrideCreditLimit(e.target.checked)}
                />
                <span className="text-slate-700">Override — I acknowledge this customer is over their credit limit</span>
              </label>
            ) : (
              <p className="mt-1 text-slate-500">Contact an Owner or Manager to override.</p>
            )}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={creditLimitBlock != null && (!canOverrideCreditLimit || !overrideCreditLimit)}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
