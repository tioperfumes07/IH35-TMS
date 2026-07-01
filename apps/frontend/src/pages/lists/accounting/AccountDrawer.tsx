import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import {
  createCatalogAccount,
  deactivateCatalogAccountById,
  updateCatalogAccount,
  type CatalogAccount,
} from "../../../api/catalog-accounts";
import { fetchAccountTypeCatalog, type AccountTypeCatalogEntry } from "../../../api/coa-list";
import { getCoaAccounts } from "../../../api/banking";
import { Button } from "../../../components/Button";
import { Combobox, type ComboboxOption } from "../../../components/Combobox";
import { MoneyInput } from "../../../components/forms/MoneyInput";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  account: CatalogAccount | null;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
};

const ACCOUNT_TYPES = [
  "Asset",
  "Liability",
  "Equity",
  "Income",
  "Expense",
  "CostOfGoodsSold",
  "OtherIncome",
  "OtherExpense",
] as const;

// catalogs.accounts.account_type is the 8-value COA group enum, but the account-type catalog
// (catalogs.account_types) is keyed by the 15 finer QBO types (codes BANK/AR/OCA/EXP/…). The Detail Type
// dropdown was always empty ("No detail types available") because the 8-enum never matched a 15-type
// code/name. Map each enum to its catalog code(s) so the dependent dropdown populates with the right
// detail types (Asset → Bank/AR/OtherCurrentAsset/FixedAsset/OtherAsset detail types, etc.).
const COA_ENUM_TO_CATALOG_CODES: Record<string, string[]> = {
  Asset: ["BANK", "AR", "OCA", "FA", "OA"],
  Liability: ["CC", "AP", "OCL", "LTL"],
  Equity: ["EQ"],
  Income: ["INC"],
  OtherIncome: ["OINC"],
  CostOfGoodsSold: ["COGS"],
  Expense: ["EXP"],
  OtherExpense: ["OEXP"],
};

// Preview-pane display mappings. All source values come straight from catalogs.account_types (seeded in
// Block 2, migration 202606080010): statement ∈ {BS, P&L}; normal_balance ∈ {Debit, Credit};
// default_action ∈ {view_register, run_report}; group_label ∈ {ASSET, LIABILITY, EQUITY, INCOME, EXPENSE}.
// We only humanize those catalog codes here — the classification (BS/P&L, Debit/Credit, Register/Report)
// is NOT hardcoded per account type; it is read from the fetched AccountTypeCatalogEntry.
const STATEMENT_LABELS: Record<string, string> = { BS: "Balance Sheet", "P&L": "Profit & Loss" };
const ACTION_LABELS: Record<string, string> = { view_register: "Account register", run_report: "Report" };
const GROUP_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

type FormState = {
  account_name: string;
  account_number: string;
  account_type: string;
  account_subtype: string;
  notes: string;
  opening_balance_cents: string;
  opening_balance_as_of: string;
  is_locked: boolean;
  is_subaccount: boolean;
  parent_account_id: string;
};

function emptyForm(): FormState {
  return {
    account_name: "",
    account_number: "",
    account_type: "Expense",
    account_subtype: "",
    notes: "",
    opening_balance_cents: "",
    opening_balance_as_of: "",
    is_locked: false,
    is_subaccount: false,
    parent_account_id: "",
  };
}

function formFromAccount(account: CatalogAccount): FormState {
  return {
    account_name: account.account_name,
    account_number: account.account_number ?? "",
    account_type: account.account_type,
    account_subtype: account.account_subtype ?? "",
    notes: account.notes ?? "",
    opening_balance_cents:
      account.opening_balance_cents !== null && account.opening_balance_cents !== undefined
        ? String(account.opening_balance_cents / 100)
        : "",
    opening_balance_as_of: account.opening_balance_as_of ?? "",
    is_locked: account.is_locked,
    is_subaccount: Boolean(account.parent_account_id),
    parent_account_id: account.parent_account_id ?? "",
  };
}

function centsFromDollarString(dollarStr: string): number | null {
  const trimmed = dollarStr.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

function FieldLabel({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-gray-600">
      {label}
      {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      {children}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="mt-1 text-[11px] text-red-700">{msg}</div>;
}

export function AccountDrawer({ open, mode, account, operatingCompanyId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const typeCatalogQuery = useQuery({
    queryKey: ["account-type-catalog"],
    queryFn: fetchAccountTypeCatalog,
    staleTime: 5 * 60 * 1000,
  });

  const detailTypesForType = useMemo<AccountTypeCatalogEntry["detailTypes"]>(() => {
    if (!typeCatalogQuery.data || !form.account_type) return [];
    // Match by the catalog code(s) that the selected COA group enum maps to; also keep the legacy
    // direct match (accountType/code) so an exact 15-type value still works.
    const codes = new Set(COA_ENUM_TO_CATALOG_CODES[form.account_type] ?? []);
    const out: AccountTypeCatalogEntry["detailTypes"] = [];
    const seen = new Set<string>();
    for (const e of typeCatalogQuery.data) {
      if (!(codes.has(e.code) || e.accountType === form.account_type || e.code === form.account_type)) continue;
      for (const dt of e.detailTypes) {
        if (seen.has(dt.name)) continue;
        seen.add(dt.name);
        out.push(dt);
      }
    }
    return out;
  }, [typeCatalogQuery.data, form.account_type]);

  // Parent-account candidates for the subaccount picker. getCoaAccounts is entity-scoped server-side
  // (passes operating_company_id → af1 RLS), so this NEVER lists another entity's accounts. We further
  // filter to the SAME account_type as the one being created (an Expense subaccount only nests under an
  // Expense parent) and exclude self (edit mode) so an account cannot parent itself.
  const parentAccountsQuery = useQuery({
    queryKey: ["coa-accounts-for-parent", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
    staleTime: 60 * 1000,
  });

  const parentOptions = useMemo<ComboboxOption[]>(() => {
    const rows = parentAccountsQuery.data?.accounts ?? [];
    return rows
      .filter((a) => a.account_type === form.account_type)
      .filter((a) => !a.deactivated_at)
      .filter((a) => a.id !== account?.id)
      .map((a) => ({
        value: a.id,
        label: a.account_name,
        sublabel: a.account_number || undefined,
      }));
  }, [parentAccountsQuery.data, form.account_type, account?.id]);

  // Live preview metadata — sourced from the fetched account_types catalog, NOT hardcoded. Find the
  // catalog entry the selected COA group enum maps to; when a Detail Type is chosen, prefer the exact
  // entry that owns that detail type (e.g. Asset+Checking → the "Bank" entry → BS / Debit / Register).
  const previewEntry = useMemo<AccountTypeCatalogEntry | null>(() => {
    const data = typeCatalogQuery.data;
    if (!data || !form.account_type) return null;
    const codes = new Set(COA_ENUM_TO_CATALOG_CODES[form.account_type] ?? []);
    const matches = data.filter(
      (e) => codes.has(e.code) || e.accountType === form.account_type || e.code === form.account_type,
    );
    if (matches.length === 0) return null;
    if (form.account_subtype) {
      const withDetail = matches.find((e) => e.detailTypes.some((dt) => dt.name === form.account_subtype));
      if (withDetail) return withDetail;
    }
    return matches[0];
  }, [typeCatalogQuery.data, form.account_type, form.account_subtype]);

  useEffect(() => {
    if (!open) return;
    setForm(account ? formFromAccount(account) : emptyForm());
    setErrors({});
    setSubmitError("");
    setConfirmArchive(false);
  }, [open, account]);

  const isLocked = mode === "edit" && (account?.is_locked === true);
  const isArchived = mode === "edit" && Boolean(account?.deactivated_at);
  const readOnly = isLocked || isArchived;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.account_name.trim()) next.account_name = "Account Name is required.";
    if (!form.account_type) next.account_type = "Account Type is required.";
    if (form.opening_balance_cents.trim() && Number.isNaN(parseFloat(form.opening_balance_cents))) {
      next.opening_balance_cents = "Enter a valid dollar amount.";
    }
    if (form.is_subaccount && !form.parent_account_id.trim()) {
      next.parent_account_id = "Select a parent account.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (readOnly || !validate()) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      // parent_account_id (self-FK on catalogs.accounts, already persisted by the create/update routes).
      // The create schema types it .optional() (NOT .nullable()), so on CREATE an unset parent must be
      // omitted (undefined) — sending null would be a validation_error. On UPDATE the schema is nullable,
      // so we send null to CLEAR a parent (unchecking "Make this a subaccount" on an existing subaccount).
      const parentId = form.is_subaccount && form.parent_account_id.trim() ? form.parent_account_id : null;
      const body = {
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        account_number: form.account_number.trim() || null,
        // account_subtype + notes are .optional() (not .nullable()) on the create schema, so an empty value
        // must be omitted (undefined), NOT sent as null — sending null was the "validation_error" on save.
        account_subtype: form.account_subtype.trim() || undefined,
        notes: form.notes.trim() || undefined,
        opening_balance_cents: centsFromDollarString(form.opening_balance_cents),
        opening_balance_as_of: form.opening_balance_as_of.trim() || null,
        parent_account_id: mode === "create" ? (parentId ?? undefined) : parentId,
        is_locked: form.is_locked,
        operating_company_id: operatingCompanyId || undefined,
      };
      if (mode === "create") {
        await createCatalogAccount(body);
      } else if (account) {
        await updateCatalogAccount(account.id, body);
      }
      onSaved();
      onClose();
    } catch (err) {
      const data = (err as { data?: Record<string, unknown> }).data ?? {};
      const errCode = String(data.error ?? (err as Error).message ?? "save_failed");
      if (errCode === "account_is_locked") {
        setSubmitError("This account is locked and cannot be edited.");
      } else if (errCode === "catalog_account_conflict_account_number") {
        setErrors((prev) => ({ ...prev, account_number: "Account number already in use." }));
      } else {
        setSubmitError(`Failed to save account: ${errCode}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    if (!account || readOnly) return;
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    setIsSaving(true);
    setSubmitError("");
    try {
      await deactivateCatalogAccountById(account.id);
      onSaved();
      onClose();
    } catch (err) {
      const data = (err as { data?: Record<string, unknown> }).data ?? {};
      const errCode = String(data.error ?? (err as Error).message ?? "archive_failed");
      if (errCode === "account_is_locked") {
        setSubmitError("This account is locked and cannot be archived.");
      } else {
        setSubmitError(`Failed to archive account: ${errCode}`);
      }
    } finally {
      setIsSaving(false);
      setConfirmArchive(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        aria-hidden="true"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "New Account" : "Edit Account"}
        className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-gray-200 bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              {mode === "create" ? "New Account" : "Edit Account"}
            </h2>
            {isLocked ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                LOCKED
              </span>
            ) : null}
            {isArchived ? (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                ARCHIVED
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
            onClick={onClose}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLocked ? (
            <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This account is locked. It cannot be edited or archived. To unlock, contact an administrator.
            </div>
          ) : null}

          <div className="space-y-4">
            {/* Account Name */}
            <FieldLabel label="Account Name" required>
              <input
                type="text"
                value={form.account_name}
                disabled={readOnly}
                onChange={(e) => setField("account_name", e.target.value)}
                placeholder="e.g. Fuel & Tolls"
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <FieldError msg={errors.account_name} />
            </FieldLabel>

            {/* Account Number (optional) */}
            <FieldLabel label="Account Number">
              <span className="ml-1 font-normal text-gray-400">(optional)</span>
              <input
                type="text"
                value={form.account_number}
                disabled={readOnly}
                onChange={(e) => setField("account_number", e.target.value)}
                placeholder="e.g. 6000"
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <FieldError msg={errors.account_number} />
            </FieldLabel>

            {/* Account Type */}
            <FieldLabel label="Account Type" required>
              <select
                value={form.account_type}
                disabled={readOnly}
                onChange={(e) => {
                  setField("account_type", e.target.value);
                  setField("account_subtype", "");
                  // A parent must share the new account_type, so clear any stale same-type selection.
                  setField("parent_account_id", "");
                }}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">Select type…</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <FieldError msg={errors.account_type} />
            </FieldLabel>

            {/* Detail Type (cascaded) */}
            <FieldLabel label="Detail Type">
              <select
                value={form.account_subtype}
                disabled={readOnly || detailTypesForType.length === 0}
                onChange={(e) => setField("account_subtype", e.target.value)}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">
                  {detailTypesForType.length === 0 ? "No detail types available" : "Select detail type…"}
                </option>
                {detailTypesForType.map((dt) => (
                  <option key={dt.id} value={dt.name}>
                    {dt.name}
                  </option>
                ))}
              </select>
            </FieldLabel>

            {/* Make this a subaccount (§ additive) — reveals a same-type, per-entity parent picker. */}
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-3" data-testid="subaccount-section">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  data-testid="make-subaccount-checkbox"
                  checked={form.is_subaccount}
                  disabled={readOnly}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setField("is_subaccount", checked);
                    if (!checked) setField("parent_account_id", "");
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-slate-400 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-xs font-semibold text-gray-800">Make this a subaccount</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    Nest this account under a parent of the same account type (current entity only).
                  </div>
                </div>
              </label>

              {form.is_subaccount ? (
                <div className="mt-3" data-testid="parent-account-picker">
                  <div className="mb-1 text-xs font-semibold text-gray-600">
                    Parent account<span className="ml-0.5 text-red-500">*</span>
                  </div>
                  <Combobox
                    options={parentOptions}
                    value={form.parent_account_id || null}
                    onChange={(v) => setField("parent_account_id", v ?? "")}
                    placeholder={
                      parentOptions.length === 0 && !parentAccountsQuery.isLoading
                        ? `No other ${form.account_type} accounts to nest under`
                        : "Select parent account"
                    }
                    loading={parentAccountsQuery.isLoading}
                    disabled={readOnly}
                    allowClear
                    error={errors.parent_account_id}
                  />
                </div>
              ) : null}
            </div>

            {/* Live preview — sourced from catalogs.account_types (Block 2), never hardcoded. */}
            {previewEntry ? (
              <div
                className="rounded border border-slate-200 bg-slate-50 px-3 py-3"
                data-testid="account-preview-pane"
              >
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                </div>
                <div className="space-y-1.5 text-xs text-slate-700">
                  <div className="font-semibold text-slate-900" data-testid="preview-name">
                    {(form.account_number ? `${form.account_number} ` : "") +
                      (form.account_name.trim() || "Untitled account")}
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Classification</span>
                    <span className="text-right" data-testid="preview-classification">
                      {`${GROUP_LABELS[previewEntry.group] ?? previewEntry.group} › ${previewEntry.accountType} › ${
                        form.account_subtype || "—"
                      }`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Statement</span>
                    <span data-testid="preview-statement">
                      {STATEMENT_LABELS[previewEntry.statement] ?? previewEntry.statement}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Normal balance</span>
                    <span data-testid="preview-normal-balance">{previewEntry.normalBalance}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Opens as</span>
                    <span data-testid="preview-opens-as">
                      {ACTION_LABELS[previewEntry.defaultAction] ?? previewEntry.defaultAction}
                    </span>
                  </div>
                  <div className="pt-1 text-[11px] text-slate-500" data-testid="preview-description">
                    {`Lands under ${GROUP_LABELS[previewEntry.group] ?? previewEntry.group} on your ${
                      STATEMENT_LABELS[previewEntry.statement] ?? previewEntry.statement
                    }${form.is_subaccount ? ", nested as a subaccount." : "."}`}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Description / Notes */}
            <FieldLabel label="Description">
              <textarea
                value={form.notes}
                disabled={readOnly}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Optional notes about this account…"
                rows={3}
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </FieldLabel>

            {/* Opening Balance */}
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="Opening Balance ($)">
                {/* M-1: dollars-mode QBO money entry; bridged so centsFromDollarString (×100) is byte-for-byte. */}
                <MoneyInput
                  valueDollars={form.opening_balance_cents ? Number(form.opening_balance_cents) : null}
                  onChangeDollars={(d) => setField("opening_balance_cents", d == null ? "" : String(d))}
                  disabled={readOnly}
                  ariaLabel="Opening Balance ($)"
                  className="mt-1 w-full"
                />
                <FieldError msg={errors.opening_balance_cents} />
              </FieldLabel>

              <FieldLabel label="Balance As Of">
                {/* Box-in-box fix: DatePicker renders its own single bordered control (the trigger button).
                    Passing border/height on the wrapper produced a nested border. Match the Opening Balance
                    field (MoneyInput) exactly — wrapper is layout-only (mt-1 w-full); the control's own
                    border is the single box. */}
                <DatePicker
                  data-testid="balance-as-of-datepicker"
                  value={form.opening_balance_as_of}
                  disabled={readOnly}
                  onChange={(next) => setField("opening_balance_as_of", next)}
                  className="mt-1 w-full"
                />
              </FieldLabel>
            </div>

            {/* Is Locked toggle */}
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.is_locked}
                  disabled={readOnly}
                  onChange={(e) => setField("is_locked", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-slate-400 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-xs font-semibold text-gray-800">Lock Account</div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    Locked accounts cannot be edited or archived. This action cannot be undone through the UI.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-4">
          {submitError ? (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {submitError}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            {/* Archive button — only in edit mode, account not already locked/archived */}
            <div>
              {mode === "edit" && !readOnly ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleArchive()}
                  className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                    confirmArchive
                      ? "border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                  } disabled:opacity-50`}
                >
                  {confirmArchive ? "Confirm Archive?" : "Archive"}
                </button>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly ? (
                <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? "Saving…" : mode === "create" ? "Create" : "Save Changes"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
