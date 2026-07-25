import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Button } from "../../../components/Button";
import { UploadZone } from "../../../components/UploadZone";
import { useToast } from "../../../components/Toast";
import { DatePicker } from "../../../components/forms/DatePicker";
import { FieldError, fieldErrorClassname } from "../../../components/forms/FieldError";
import { FormErrorBanner } from "../../../components/forms/FormErrorBanner";
import { useFormValidation } from "../../../components/forms/useFormValidation";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { Combobox } from "../../../components/Combobox";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { listCustomers } from "../../../api/mdata";
import { listLoads } from "../../../api/loads";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import { addInvoiceLine, patchInvoice } from "../../../api/accounting";
import { ApiError } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { companyToday } from "../../../lib/businessDate";

type CreditLimitBlock = {
  exposure_cents: number;
  limit_cents: number;
  credit_limit_source: string | null;
  can_override: boolean;
};

const INCOME_TYPES = ["Income", "OtherIncome"];
const CARRIER_DEFAULT_INCOME_NAME = "Sales of Service Income";
const LOAD_PICKER_LIMIT = 200;

const invoiceModalSchema = z
  .object({
    customer_id: z.string().min(1, "Customer is required").uuid("Customer is required"),
    issue_date: z.string(),
    due_date: z.string(),
    notes: z.string(),
    income_account_id: z.string(),
    line_description: z.string(),
    line_amount_cents: z.number().int().min(0),
    load_id: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.line_amount_cents > 0) {
      if (!value.income_account_id.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Income account is required when line amount is set", path: ["income_account_id"] });
      }
      if (!value.line_description.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Line description is required when line amount is set", path: ["line_description"] });
      }
    }
    if (value.load_id.trim() && value.line_amount_cents > 0 && !value.line_description.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Line description is required for load-linked revenue", path: ["line_description"] });
    }
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
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [referenceCustomerId, setReferenceCustomerId] = useState<string | null>(null);
  const [loadId, setLoadId] = useState<string | null>(null);
  const [incomeAccountId, setIncomeAccountId] = useState<string | null>(null);
  const [lineDescription, setLineDescription] = useState("");
  const [lineAmountCents, setLineAmountCents] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(companyToday());
  const [dueDate, setDueDate] = useState("");
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [creditLimitBlock, setCreditLimitBlock] = useState<CreditLimitBlock | null>(null);
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);
  const canOverrideCreditLimit = ["Owner", "Administrator", "Manager"].includes(auth.user?.role ?? "");

  const customersQuery = useQuery({
    queryKey: ["invoice-type-modal", "customers", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: Boolean(operatingCompanyId) && open,
    staleTime: 60_000,
  });

  const loadsQuery = useQuery({
    queryKey: ["invoice-type-modal", "loads", operatingCompanyId, customerId],
    queryFn: () =>
      listLoads({
        operating_company_id: operatingCompanyId ? [operatingCompanyId] : undefined,
        customer_id: customerId ?? undefined,
        limit: LOAD_PICKER_LIMIT,
        sort: "-pickup_date",
      }),
    enabled: Boolean(operatingCompanyId) && open,
    staleTime: 60_000,
  });

  const accountsQuery = useQuery({
    queryKey: ["invoice-type-modal", "income-accounts", operatingCompanyId],
    // listCatalogAccounts (not getCoaAccounts): its row shape carries is_postable, which the
    // income filter below needs. getCoaAccounts' CoaAccountPickerRow omits it.
    // LST-F14: income account posting picker — server-side is_postable=true.
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: Boolean(operatingCompanyId) && open,
    staleTime: 60_000,
  });

  const customerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? [])
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [customersQuery.data?.customers]
  );
  const customersById = useMemo(
    () => new Map((customersQuery.data?.customers ?? []).map((c) => [c.id, c])),
    [customersQuery.data?.customers]
  );

  const incomeAccountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? [])
        // is_postable + deactivated_at are REQUIRED. The backend's assertExplicitIncomeAccount
        // enforces is_postable = true, so offering a non-postable Income HEADER account here hands
        // the user a choice guaranteed to 422 — and because the invoice row is created BEFORE the
        // line is added, that failure orphans a draft invoice with no lines and no load link.
        .filter((a) => a.is_postable && !a.deactivated_at && a.account_type && INCOME_TYPES.includes(a.account_type))
        .map((a) => ({
          value: a.id,
          label: a.account_name,
          type: a.account_type ?? undefined,
        })),
    [accountsQuery.data?.accounts]
  );

  const loadOptions = useMemo(
    () =>
      (loadsQuery.data?.loads ?? []).map((load) => ({
        value: load.id,
        label: load.load_number ? `${load.load_number}${load.customer_name ? ` · ${load.customer_name}` : ""}` : load.id,
      })),
    [loadsQuery.data?.loads]
  );

  const loadsById = useMemo(
    () => new Map((loadsQuery.data?.loads ?? []).map((load) => [load.id, load])),
    [loadsQuery.data?.loads]
  );

  const formSnapshot = useMemo(
    () => ({
      customer_id: customerId ?? "",
      issue_date: issueDate,
      due_date: dueDate,
      notes,
      income_account_id: incomeAccountId ?? "",
      line_description: lineDescription,
      line_amount_cents: lineAmountCents ?? 0,
      load_id: loadId ?? "",
    }),
    [customerId, issueDate, dueDate, notes, incomeAccountId, lineDescription, lineAmountCents, loadId]
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
          attachment_draft_id: draftAttachmentEntityId,
          override_credit_limit: overrideCreditLimit || undefined,
        });

        const loadKey = parsed.load_id.trim() || null;
        if (loadKey) {
          await patchInvoice(created.id, operatingCompanyId, { source_load_id: loadKey });
        }

        if (parsed.line_amount_cents > 0) {
          await addInvoiceLine(created.id, operatingCompanyId, {
            line_type: loadKey ? "linehaul" : "other",
            description: parsed.line_description.trim(),
            quantity: 1,
            unit_amount_cents: parsed.line_amount_cents,
            source_load_id: loadKey ?? undefined,
            account_id: parsed.income_account_id.trim() || undefined,
          });
        }

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
    setReferenceCustomerId(null);
    setLoadId(null);
    setIncomeAccountId(null);
    setLineDescription("");
    setLineAmountCents(null);
    setNotes("");
    setIssueDate(companyToday());
    setDueDate("");
    setCreditLimitBlock(null);
    setOverrideCreditLimit(false);
    resetInvoiceErrors();
    setDraftAttachmentEntityId(crypto.randomUUID());
  }, [open, resetInvoiceErrors]);

  // Customer default income account (Option-B suggestion — editable, never silent).
  useEffect(() => {
    if (!open || !customerId || incomeAccountId) return;
    const customer = customersById.get(customerId);
    const defaultId = customer?.default_income_account_id;
    if (defaultId && incomeAccountOptions.some((opt) => opt.value === defaultId)) {
      setIncomeAccountId(defaultId);
    }
  }, [open, customerId, incomeAccountId, customersById, incomeAccountOptions]);

  // Carrier default when no customer default is set.
  useEffect(() => {
    if (!open || incomeAccountId) return;
    const accounts = accountsQuery.data?.accounts ?? [];
    const dflt = accounts.find(
      (a) => a.account_name === CARRIER_DEFAULT_INCOME_NAME && a.is_postable && !a.deactivated_at && a.account_type && INCOME_TYPES.includes(a.account_type)
    );
    if (dflt) setIncomeAccountId((prev) => prev ?? dflt.id);
  }, [open, incomeAccountId, accountsQuery.data?.accounts]);

  return (
    <ParityDrawer open={open} onClose={onClose} title={title} size="wide">
      <form
        className="space-y-3"
        data-invoice-create-form="true"
        onSubmit={(event) => {
          event.preventDefault();
          void submitInvoiceCreate(formSnapshot);
        }}
      >
        <FormErrorBanner message={invoiceApiError} />
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Customer *</label>
            <ReferenceSelect
              value={customerId}
              onChange={(next) => {
                clearInvoiceFieldError("customer_id");
                setCustomerId(next);
                setLoadId(null);
                setIncomeAccountId(null);
                const record = next ? customersById.get(next) : undefined;
                if (next && record) {
                  setNotes((prev) => {
                    if (prev.trim()) return prev;
                    const parts: string[] = [`Bill-to: ${record.name}`];
                    if (record.email) parts.push(`Email: ${record.email}`);
                    if (record.phone) parts.push(`Phone: ${record.phone}`);
                    return parts.join("\n");
                  });
                }
              }}
              options={customerOptions}
              createKind="customer"
              operatingCompanyId={operatingCompanyId}
              placeholder="Search customers…"
              onOptionCreated={(opt) => {
                void queryClient.invalidateQueries({ queryKey: ["invoice-type-modal", "customers"] });
                clearInvoiceFieldError("customer_id");
                setCustomerId(opt.value);
              }}
            />
            <FieldError id="customer_id" message={invoiceFieldErrors.customer_id} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Load (optional)</label>
            <Combobox
              options={loadOptions}
              value={loadId}
              onChange={(next) => {
                clearInvoiceFieldError("load_id");
                setLoadId(next);
                if (!next) return;
                const load = loadsById.get(next);
                if (load?.customer_id && load.customer_id !== customerId) {
                  setCustomerId(load.customer_id);
                  clearInvoiceFieldError("customer_id");
                }
                if (load?.load_number && !lineDescription.trim()) {
                  setLineDescription(`Linehaul · Load ${load.load_number}`);
                }
                const rateCents = Number(load?.rate_total_cents ?? 0);
                if (rateCents > 0 && (lineAmountCents == null || lineAmountCents === 0)) {
                  setLineAmountCents(rateCents);
                }
              }}
              placeholder={customerId ? "Link load (optional)…" : "Select customer first…"}
              loading={loadsQuery.isLoading}
              disabled={!operatingCompanyId}
              allowClear
            />
            <FieldError id="load_id" message={invoiceFieldErrors.load_id} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Customer reference (appends to Notes)</label>
            <ReferenceSelect
              value={referenceCustomerId}
              onChange={(next) => {
                if (!next) return;
                const record = customersById.get(next);
                const line = `Customer reference: ${record?.name ?? "Unknown"}`;
                setNotes((prev) => (prev ? `${prev}\n${line}` : line));
                setReferenceCustomerId(null);
              }}
              options={customerOptions}
              createKind="customer"
              operatingCompanyId={operatingCompanyId}
              placeholder="Search customers to add a reference…"
              onOptionCreated={(opt) => {
                void queryClient.invalidateQueries({ queryKey: ["invoice-type-modal", "customers"] });
                const line = `Customer reference: ${opt.label}`;
                setNotes((prev) => (prev ? `${prev}\n${line}` : line));
              }}
            />
          </div>
          <label className="text-xs font-semibold text-slate-600">
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
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">
              Income account *
              <span className="ml-1 font-normal text-slate-400">(required when line amount is set)</span>
            </label>
            <ReferenceSelect
              value={incomeAccountId}
              onChange={(next) => {
                clearInvoiceFieldError("income_account_id");
                setIncomeAccountId(next);
              }}
              options={incomeAccountOptions}
              createKind="account"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select income account…"
              disabled={!operatingCompanyId || accountsQuery.isLoading}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["invoice-type-modal", "income-accounts", operatingCompanyId] });
              }}
            />
            <FieldError id="income_account_id" message={invoiceFieldErrors.income_account_id} />
          </div>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">
            Line description
            <input
              data-field="line_description"
              className={fieldErrorClassname(Boolean(invoiceFieldErrors.line_description), "mt-1 h-9 w-full rounded-sm border px-2 text-sm")}
              value={lineDescription}
              placeholder="e.g. Linehaul · Load L-12047"
              onChange={(event) => {
                clearInvoiceFieldError("line_description");
                setLineDescription(event.target.value);
              }}
            />
            <FieldError id="line_description" message={invoiceFieldErrors.line_description} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Line amount (USD)
            <MoneyInput
              valueCents={lineAmountCents}
              onChangeCents={(cents) => {
                clearInvoiceFieldError("line_amount_cents");
                setLineAmountCents(cents);
              }}
              ariaLabel="Line amount (USD)"
              className="mt-1 w-full"
            />
            <FieldError id="line_amount_cents" message={invoiceFieldErrors.line_amount_cents} />
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
    </ParityDrawer>
  );
}
