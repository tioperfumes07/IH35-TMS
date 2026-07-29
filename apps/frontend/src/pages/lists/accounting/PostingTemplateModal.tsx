/**
 * ACCT-LINK-05 — Posting Templates create/edit (posting-engine consumers / blueprint 3.18.5.4).
 *
 * template_code must mirror PostingSourceType (+ fuel_event) so posting-engine.resolvePostingTemplateId
 * can stamp accounting.posting_batches.posting_template_id on the next batch insert.
 *
 * CoA picker uses listCatalogAccounts(postable_only) — getCoaAccounts omits is_postable on its row type.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import type { AccountingCatalogCreateBody, AccountingCatalogRow, AccountingCatalogUpdateBody } from "../../../api/catalogs-accounting";
import { classesCatalogClient } from "../../../api/catalogs-accounting";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import type { AccountingCatalogClient } from "./AccountingCatalogModal";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

/** Codes consumers stamp via source_template_code — must match resolvePostingTemplateId lookup. */
export const POSTING_TEMPLATE_SOURCE_CODES = [
  { value: "invoice", label: "invoice — A/R invoice post" },
  { value: "bill", label: "bill — A/P bill post" },
  { value: "customer_payment", label: "customer_payment — receive payment" },
  { value: "bill_payment", label: "bill_payment — bill payment" },
  { value: "cash_advance", label: "cash_advance — cash advance" },
  { value: "driver_advance", label: "driver_advance — driver advance" },
  { value: "expense", label: "expense — expense purchase" },
  { value: "bank_categorization", label: "bank_categorization — bank feed categorize" },
  { value: "driver_reimbursement", label: "driver_reimbursement — driver reimbursement" },
  { value: "transfer", label: "transfer — inter-account transfer" },
  { value: "fuel_event", label: "fuel_event — fuel expense poster" },
] as const;

type Props = {
  open: boolean;
  mode: "create" | "edit";
  row: AccountingCatalogRow | null;
  operatingCompanyId: string;
  client: AccountingCatalogClient;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  code: string;
  displayName: string;
  description: string;
  isActive: boolean;
  debitAccountId: string;
  creditAccountId: string;
  classId: string;
  defaultMemo: string;
};

function rowToForm(row: AccountingCatalogRow | null): FormState {
  const m = row?.metadata ?? {};
  return {
    code: row?.code ?? "",
    displayName: row?.display_name ?? "",
    description: row?.description ?? "",
    isActive: row?.is_active ?? true,
    debitAccountId: typeof m.debit_account_id === "string" ? m.debit_account_id : "",
    creditAccountId: typeof m.credit_account_id === "string" ? m.credit_account_id : "",
    classId: typeof m.default_class_id === "string" ? m.default_class_id : "",
    defaultMemo: typeof m.default_memo === "string" ? m.default_memo : "",
  };
}

export function PostingTemplateModal({ open, mode, row, operatingCompanyId, client, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(rowToForm(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-posting-templates", operatingCompanyId],
    // LST-F14: debit/credit posting targets — server-side postable_only=true (headers excluded).
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });
  const classesQuery = useQuery({
    queryKey: ["catalogs", "accounting", "classes", operatingCompanyId],
    queryFn: () => classesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true", limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const accountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? []).map((a) => ({
        value: a.id,
        label: `${a.account_number} · ${a.account_name}`,
      })),
    [accountsQuery.data]
  );

  useEffect(() => {
    if (!open) return;
    setForm(rowToForm(row));
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  const canSubmit =
    Boolean(form.code.trim()) &&
    Boolean(form.displayName.trim()) &&
    Boolean(form.debitAccountId) &&
    Boolean(form.creditAccountId) &&
    form.debitAccountId !== form.creditAccountId;

  function validate() {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next.code = "Template code is required.";
    if (!form.displayName.trim()) next.displayName = "Display name is required.";
    if (!form.debitAccountId) next.debitAccount = "Debit account is required.";
    if (!form.creditAccountId) next.creditAccount = "Credit account is required.";
    if (form.debitAccountId && form.creditAccountId && form.debitAccountId === form.creditAccountId) {
      next.creditAccount = "Debit and credit accounts must differ.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSaving(true);
    setSubmitError("");
    const metadata = {
      debit_account_id: form.debitAccountId,
      credit_account_id: form.creditAccountId,
      default_class_id: form.classId || null,
      default_memo: form.defaultMemo.trim() || null,
    };
    const body: AccountingCatalogCreateBody = {
      code: form.code.trim().toLowerCase(),
      display_name: form.displayName.trim(),
      description: form.description.trim() || undefined,
      is_active: form.isActive,
      metadata,
    };
    try {
      if (mode === "create") await client.create(operatingCompanyId, body);
      else if (row) {
        const patch: AccountingCatalogUpdateBody = {
          display_name: body.display_name,
          description: body.description,
          is_active: body.is_active,
          metadata,
        };
        await client.update(row.id, operatingCompanyId, patch);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to save posting template.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title={mode === "create" ? "New Posting Template" : "Edit Posting Template"}>
      <div className="space-y-3">
        <p className="text-xs text-slate-600">
          Template code must match a posting consumer (<code className="font-mono">invoice</code>, <code className="font-mono">bill</code>,{" "}
          <code className="font-mono">fuel_event</code>, etc.) so the next batch stamps <code className="font-mono">posting_template_id</code>.
        </p>

        <label className="block text-xs font-semibold text-gray-600">
          Template code
          <SelectCombobox
            value={form.code}
            disabled={mode === "edit"}
            onChange={(event) => setForm((v) => ({ ...v, code: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm disabled:bg-slate-100"
          >
            <option value="">Select source type…</option>
            {POSTING_TEMPLATE_SOURCE_CODES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
          {errors.code ? <div className="mt-1 text-[11px] text-red-700">{errors.code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display name
          <input
            data-testid="posting-template-name-input"
            value={form.displayName}
            onChange={(event) => setForm((v) => ({ ...v, displayName: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          {errors.displayName ? <div className="mt-1 text-[11px] text-red-700">{errors.displayName}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Description
          <input
            value={form.description}
            onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Debit account
          <div className="mt-1">
            <ReferenceSelect
              createKind="account"
              operatingCompanyId={operatingCompanyId}
              value={form.debitAccountId}
              onChange={(id) => setForm((v) => ({ ...v, debitAccountId: id ?? "" }))}
              options={accountOptions}
              placeholder="Select debit account…"
            />
          </div>
          {errors.debitAccount ? <div className="mt-1 text-[11px] text-red-700">{errors.debitAccount}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Credit account
          <div className="mt-1">
            <ReferenceSelect
              createKind="account"
              operatingCompanyId={operatingCompanyId}
              value={form.creditAccountId}
              onChange={(id) => setForm((v) => ({ ...v, creditAccountId: id ?? "" }))}
              options={accountOptions}
              placeholder="Select credit account…"
            />
          </div>
          {errors.creditAccount ? <div className="mt-1 text-[11px] text-red-700">{errors.creditAccount}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Default class (optional)
          <SelectCombobox
            value={form.classId}
            onChange={(event) => setForm((v) => ({ ...v, classId: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          >
            <option value="">None</option>
            {(classesQuery.data?.rows ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Default memo (optional)
          <input
            value={form.defaultMemo}
            onChange={(event) => setForm((v) => ({ ...v, defaultMemo: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((v) => ({ ...v, isActive: event.target.checked }))} />
          Active
        </label>

        {submitError ? <div className="text-xs text-red-700">{submitError}</div> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || saving}>
            {mode === "create" ? "+ Create" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
