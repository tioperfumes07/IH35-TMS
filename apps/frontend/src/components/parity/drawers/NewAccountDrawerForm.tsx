/**
 * BK7 — New Account drawer form (two-column + cascade + lock flag).
 *
 * LEFT: Account name, Account number (optional — never invent slugs), Account type
 *   (QBO catalog codes BANK/EXP/… statement-grouped), Detail type cascaded from that
 *   ONE catalog code (not all Asset/Expense subtypes merged), sub-account toggle →
 *   parent selector, description, lock flag.
 * RIGHT: Live BS/P&L preview from the fetched account-type catalog.
 *
 * GATE: Account create commit was FINANCIAL/GATED until owner GO 2026-07-22
 *   ("flip flags on all companies"). Save now commits to catalogs.accounts
 *   (TMS parallel books — no QBO write-back).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { createCatalogAccount } from "../../../api/catalog-accounts";
import { getCoaAccounts } from "../../../api/banking";
import {
  CATALOG_CODE_TO_COA_ENUM,
  detailTypesForCatalogCode,
  fetchAccountTypeCatalog,
  type AccountTypeCatalogEntry,
  type CoaAccountType,
} from "../../../api/coa-list";
import { formatAccountDisplayLabel } from "../../../lib/show-account-numbers";
import { formatReferenceTypeLabel } from "../referenceOptionLabels";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";

const ACCOUNT_CREATE_GATED = false; // Owner GO 2026-07-22 — all companies

type FormState = {
  name: string;
  accountNumber: string;
  /** QBO Account Type catalog code (BANK, EXP, …). */
  catalogTypeCode: string;
  /** Stored 8-value enum on catalogs.accounts.account_type. */
  accountType: CoaAccountType | "";
  detailType: string;
  isSubaccount: boolean;
  parentAccount: string;
  description: string;
  lockAccount: boolean;
};

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewAccountDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    accountNumber: "",
    catalogTypeCode: "",
    accountType: "",
    detailType: "",
    isSubaccount: false,
    parentAccount: "",
    description: "",
    lockAccount: false,
  });

  const typeCatalogQuery = useQuery({
    queryKey: ["account-type-catalog", operatingCompanyId],
    queryFn: () => fetchAccountTypeCatalog(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(operatingCompanyId),
  });

  const detailOptions = useMemo(
    () => detailTypesForCatalogCode(typeCatalogQuery.data, form.catalogTypeCode),
    [typeCatalogQuery.data, form.catalogTypeCode],
  );

  const accountTypePickerGroups = useMemo(() => {
    const data = typeCatalogQuery.data ?? [];
    const bs = data.filter((e) => e.statement === "BS").sort((a, b) => a.sortOrder - b.sortOrder);
    const pl = data.filter((e) => e.statement === "P&L").sort((a, b) => a.sortOrder - b.sortOrder);
    return [
      { label: "Balance Sheet", entries: bs },
      { label: "Profit & Loss", entries: pl },
    ];
  }, [typeCatalogQuery.data]);

  // Parent-account roster for the sub-account picker — entity-scoped (catalogs.accounts is per-entity
  // under FORCE-RLS), fetched only while the sub-account toggle is on.
  const parentAccountsQuery = useQuery({
    queryKey: ["coa-accounts-parent-picker", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(operatingCompanyId) && form.isSubaccount,
  });

  // Also load accounts when suggesting next number (create path).
  const allAccountsQuery = useQuery({
    queryKey: ["coa-accounts-for-number-suggest", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(operatingCompanyId),
  });

  const parentOptions = useMemo(
    () =>
      (parentAccountsQuery.data?.accounts ?? [])
        .filter((a) => !a.deactivated_at)
        .filter((a) => !form.accountType || a.account_type === form.accountType),
    [parentAccountsQuery.data, form.accountType],
  );

  const suggestedAccountNumber = useMemo(() => {
    const rows = allAccountsQuery.data?.accounts ?? [];
    const nums = rows
      .map((a) => String(a.account_number ?? "").trim())
      .filter((n) => /^\d+$/.test(n))
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return "";
    return String(Math.max(...nums) + 1);
  }, [allAccountsQuery.data]);

  const previewEntry = useMemo<AccountTypeCatalogEntry | null>(() => {
    const data = typeCatalogQuery.data;
    if (!data || !form.catalogTypeCode) return null;
    return data.find((e) => e.code === form.catalogTypeCode) ?? null;
  }, [typeCatalogQuery.data, form.catalogTypeCode]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "catalogTypeCode" ? { detailType: "", parentAccount: "" } : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ACCOUNT_CREATE_GATED) {
      pushToast("Account create is awaiting approval. Contact Jorge to enable.", "error");
      return;
    }
    if (!form.name.trim()) {
      pushToast("Account name is required.", "error");
      return;
    }
    if (!form.catalogTypeCode || !form.accountType) {
      pushToast("Account type is required.", "error");
      return;
    }
    setSaving(true);
    try {
      // Canonical POST /api/v1/catalogs/accounts — account_number is optional/nullable.
      // Never invent slug+timestamp junk via the accounting-factory code column.
      const res = await createCatalogAccount({
        account_name: form.name.trim(),
        account_type: form.accountType,
        account_number: form.accountNumber.trim() || null,
        account_subtype: form.detailType.trim() || undefined,
        notes: form.description.trim() || undefined,
        parent_account_id:
          form.isSubaccount && form.parentAccount ? form.parentAccount : undefined,
        is_locked: form.lockAccount,
        operating_company_id: operatingCompanyId || undefined,
      });
      onCreated({ id: String(res.id), label: form.name.trim() });
      pushToast("Account created", "success");
      onClose();
    } catch (err) {
      pushToast(String((err as Error).message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="h-full">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account name *</span>
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Checking"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Account number <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              placeholder={suggestedAccountNumber ? `e.g. ${suggestedAccountNumber}` : "e.g. 1000"}
              data-testid="inline-account-number-input"
            />
            {!form.accountNumber.trim() && suggestedAccountNumber ? (
              <button
                type="button"
                className="mt-1 text-[11px] font-semibold text-slate-700 hover:underline"
                onClick={() => set("accountNumber", suggestedAccountNumber)}
              >
                Use next number {suggestedAccountNumber}
              </button>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account type *</span>
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              value={form.catalogTypeCode}
              disabled={typeCatalogQuery.isLoading}
              onChange={(e) => {
                const code = e.target.value;
                const enumType = (CATALOG_CODE_TO_COA_ENUM[code] ?? "") as CoaAccountType | "";
                setForm((prev) => ({
                  ...prev,
                  catalogTypeCode: code,
                  accountType: enumType,
                  detailType: "",
                  parentAccount: "",
                }));
              }}
              data-testid="inline-account-type-select"
            >
              <option value="">Select a type…</option>
              {accountTypePickerGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.entries.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.accountType}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="block">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-700">Detail type</span>
              <Link
                to="/lists/accounting/detail-types"
                className="text-[11px] font-semibold text-slate-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                + Create detail type
              </Link>
            </div>
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              value={form.detailType}
              disabled={!form.catalogTypeCode || detailOptions.length === 0}
              onChange={(e) => set("detailType", e.target.value)}
              aria-label="Detail type"
              data-testid="inline-detail-type-select"
            >
              <option value="">
                {!form.catalogTypeCode
                  ? "Select account type first…"
                  : detailOptions.length === 0
                    ? "No detail types available"
                    : "Select a detail type…"}
              </option>
              {detailOptions.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isSubaccount}
              onChange={(e) => set("isSubaccount", e.target.checked)}
              className="h-4 w-4 rounded-sm border-gray-300"
            />
            Is sub-account
          </label>

          {form.isSubaccount ? (
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Parent account</span>
              <select
                className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
                value={form.parentAccount}
                onChange={(e) => set("parentAccount", e.target.value)}
              >
                <option value="">Select parent…</option>
                {parentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatAccountDisplayLabel(a)}
                    {a.account_type ? ` · ${formatReferenceTypeLabel(a.account_type)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Description</span>
            <textarea
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.lockAccount}
              onChange={(e) => set("lockAccount", e.target.checked)}
              className="h-4 w-4 rounded-sm border-gray-300"
            />
            <Lock className="h-3.5 w-3.5 text-gray-500" aria-hidden />
            Lock account
          </label>
        </div>

        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</div>
          {previewEntry ? (
            <div className="space-y-1.5 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">{form.name.trim() || "Untitled account"}</div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Type</span>
                <span className="text-right">
                  {previewEntry.accountType}
                  {form.detailType ? ` › ${form.detailType}` : ""}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Statement</span>
                <span>{previewEntry.statement === "BS" ? "Balance Sheet" : "Profit & Loss"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Normal balance</span>
                <span>{previewEntry.normalBalance}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select an account type to preview statement placement.</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162033] disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}
