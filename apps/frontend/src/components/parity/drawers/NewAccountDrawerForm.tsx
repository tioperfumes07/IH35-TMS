/**
 * BK7 — New Account drawer form (two-column + cascade + lock flag).
 *
 * LEFT: Account name, Account number, Account type (8-value COA enum, statement-grouped),
 *   Detail type (LIVE from catalogs.detail_types via account-type-catalog — no hardcoded arrays),
 *   sub-account toggle → parent selector, description, billable + lock flags.
 * RIGHT: Live BS/P&L preview from the fetched account-type catalog.
 *
 * GATE: Account create commit was FINANCIAL/GATED until owner GO 2026-07-22
 *   ("flip flags on all companies"). Save now commits to catalogs.accounts
 *   (TMS parallel books — no QBO write-back).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { chartOfAccountsCatalogClient } from "../../../api/catalogs-accounting";
import { getCoaAccounts } from "../../../api/banking";
import {
  ACCOUNT_TYPE_GROUPS,
  ACCOUNT_TYPES,
  COA_ENUM_TO_CATALOG_CODES,
  detailTypesForAccountType,
  fetchAccountTypeCatalog,
  type AccountTypeCatalogEntry,
  type CoaAccountType,
} from "../../../api/coa-list";
import { useToast } from "../../Toast";
import { ReferenceSelect } from "../ReferenceSelect";
import type { InlineCreateResult } from "../InlineCreateDrawer";
import { userFacingApiError } from "../../../lib/api-error-message";

const ACCOUNT_CREATE_GATED = false; // Owner GO 2026-07-22 — all companies

type FormState = {
  name: string;
  accountNumber: string;
  accountType: CoaAccountType | "";
  /** Detail type display name (cache). */
  detailType: string;
  detailTypeId: string;
  isSubaccount: boolean;
  parentAccount: string;
  description: string;
  billableExpenses: boolean;
  lockAccount: boolean;
};

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewAccountDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    accountNumber: "",
    accountType: "",
    detailType: "",
    detailTypeId: "",
    isSubaccount: false,
    parentAccount: "",
    description: "",
    billableExpenses: false,
    lockAccount: false,
  });

  const typeCatalogQuery = useQuery({
    queryKey: ["account-type-catalog", operatingCompanyId],
    queryFn: () => fetchAccountTypeCatalog(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(operatingCompanyId),
  });

  const detailOptions = useMemo(
    () => detailTypesForAccountType(typeCatalogQuery.data, form.accountType),
    [typeCatalogQuery.data, form.accountType],
  );

  // Parent-account roster for the sub-account picker — entity-scoped (catalogs.accounts is per-entity
  // under FORCE-RLS), fetched only while the sub-account toggle is on.
  const parentAccountsQuery = useQuery({
    queryKey: ["coa-accounts-parent-picker", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(operatingCompanyId) && form.isSubaccount,
  });

  const parentOptions = useMemo(
    () => (parentAccountsQuery.data?.accounts ?? []).filter((a) => !a.deactivated_at),
    [parentAccountsQuery.data],
  );

  const previewEntry = useMemo<AccountTypeCatalogEntry | null>(() => {
    const data = typeCatalogQuery.data;
    if (!data || !form.accountType) return null;
    const codes = new Set(COA_ENUM_TO_CATALOG_CODES[form.accountType] ?? []);
    const matches = data.filter(
      (e) => codes.has(e.code) || e.accountType === form.accountType || e.code === form.accountType,
    );
    if (matches.length === 0) return null;
    if (form.detailType) {
      const withDetail = matches.find((e) => e.detailTypes.some((dt) => dt.name === form.detailType));
      if (withDetail) return withDetail;
    }
    return matches[0];
  }, [typeCatalogQuery.data, form.accountType, form.detailType]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "accountType" ? { detailType: "", detailTypeId: "" } : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // INLINE-CREATE-NESTED-FORM: React events bubble through the REACT tree even across the
    // ParityDrawer portal, so without this the parent wizard form's onSubmit fires too.
    e.stopPropagation();
    if (ACCOUNT_CREATE_GATED) {
      pushToast("Account create is awaiting approval. Contact Jorge to enable.", "error");
      return;
    }
    if (!form.name.trim()) {
      pushToast("Account name is required.", "error");
      return;
    }
    if (!form.accountType) {
      pushToast("Account type is required.", "error");
      return;
    }
    if (!ACCOUNT_TYPES.includes(form.accountType)) {
      pushToast("Account type is invalid.", "error");
      return;
    }
    setSaving(true);
    try {
      // QB-STD-5: canonical catalogs.accounts (same table getCoaAccounts reads).
      const rawSlug = form.name.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "ACCT";
      const safeSlug = /^[A-Z]/.test(rawSlug) ? rawSlug : `E${rawSlug}`;
      const accountCode = form.accountNumber.trim() || `${safeSlug}${String(Date.now()).slice(-6)}`;
      // DATA-LOSS FIX: this form collects Description, Parent account and Lock account, and the
      // create body dropped all three — the row landed with notes NULL, parent_account_id NULL and
      // is_locked FALSE while the toast said "Account created". An operator who ticked "Lock
      // account" on a control account got a freely-postable account and no warning. The backend
      // has always accepted them (catalogs/accounting/index.ts: descriptionColumn "notes",
      // metadata parent_account_id + is_locked); only the client was lossy.
      const res = await chartOfAccountsCatalogClient.create(operatingCompanyId, {
        code: accountCode,
        display_name: form.name.trim(),
        description: form.description.trim() || undefined,
        metadata: {
          // COA-DETAIL-TYPE-VOCAB-MISMATCH (ACCT-F189) — SECOND caller of the same defect. The backend
          // resolves account_type against catalogs.account_types.code|name, but this posts the 8-value
          // QBO-style UI enum, of which only "Equity"/"Income" match by name — so picking any detail type
          // on the other six 400s with detail_type_account_type_mismatch. `previewEntry` already resolves
          // the exact catalog row, preferring the one that OWNS the chosen detail type, so its .code
          // disambiguates the one-to-many enums (Asset -> BANK|AR|OCA|FA|OA, Liability -> CC|AP|OCL|LTL)
          // that no flat enum->code map could. Same boundary translation as AccountDrawer.tsx.
          account_type: form.detailTypeId && previewEntry ? previewEntry.code : form.accountType,
          account_subtype: form.detailType || undefined,
          detail_type_id: form.detailTypeId || undefined,
          // Only send a parent when the sub-account toggle is on, so unticking it cannot leave a
          // stale parent behind. parent_account_id is a real FK (catalogs.accounts(id), 0010).
          parent_account_id: form.isSubaccount && form.parentAccount ? form.parentAccount : null,
          is_locked: form.lockAccount,
          is_billable_expense: form.billableExpenses,
        },
      });
      onCreated({ id: String(res.id), label: form.name.trim() });
      pushToast("Account created", "success");
      onClose();
    } catch (err) {
      pushToast(userFacingApiError(err, "Create failed"), "error");
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
              placeholder="e.g. BOA-CHECKING-1135"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account number</span>
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              placeholder="e.g. 1000"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account type *</span>
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              value={form.accountType}
              onChange={(e) => set("accountType", e.target.value as CoaAccountType | "")}
            >
              <option value="">Select a type…</option>
              {ACCOUNT_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>{t}</option>
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
              value={form.detailTypeId}
              disabled={!form.accountType || detailOptions.length === 0}
              onChange={(e) => {
                const id = e.target.value;
                const match = detailOptions.find((d) => d.id === id);
                setForm((prev) => ({
                  ...prev,
                  detailTypeId: id,
                  detailType: match?.name ?? "",
                }));
              }}
              aria-label="Detail type"
            >
              <option value="">
                {!form.accountType
                  ? "Select account type first…"
                  : detailOptions.length === 0
                    ? "No detail types available"
                    : "Select a detail type…"}
              </option>
              {detailOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
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

          {form.isSubaccount && (
            <div className="block" data-testid="new-account-parent-select">
              <span className="text-xs font-medium text-gray-700">Parent account</span>
              {/*
                LST-PICKER-01: parent_account_id is uuid FK → catalogs.accounts. Bare <select>
                could pick but not create; wire ReferenceSelect createKind=account (parity
                NewServiceDrawerForm income/expense).
              */}
              <div className="mt-1">
                <ReferenceSelect
                  value={form.parentAccount || null}
                  onChange={(v) => set("parentAccount", v ?? "")}
                  options={parentOptions.map((a) => ({
                    value: a.id,
                    label: a.account_number ? `${a.account_number} — ${a.account_name}` : a.account_name,
                  }))}
                  createKind="account"
                  operatingCompanyId={operatingCompanyId}
                  placeholder={
                    parentAccountsQuery.isPending
                      ? "Loading accounts…"
                      : parentOptions.length === 0
                        ? "No accounts available for this company"
                        : "Select a parent account…"
                  }
                  loading={parentAccountsQuery.isPending}
                  onOptionCreated={() => {
                    void queryClient.invalidateQueries({ queryKey: ["coa-accounts-parent-picker", operatingCompanyId] });
                  }}
                />
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Description</span>
            <textarea
              className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>

          {/*
            Now persisted: migration 202607750000 added catalogs.accounts.is_billable_expense, and
            the catalogs accounting factory maps it in selectMetadataSql + create/update. Previously
            this control had NO storage and was silently discarded on every save, so it was disabled
            and labelled rather than left lying.
          */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.billableExpenses}
              onChange={(e) => set("billableExpenses", e.target.checked)}
              className="h-4 w-4 rounded-sm border-gray-300"
            />
            Use for billable expenses
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

        <div className="rounded-sm border border-gray-200 bg-slate-50 p-3 text-sm text-gray-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Where this lands</p>
          {previewEntry ? (
            <div className="mt-2 space-y-1">
              <p className="font-medium text-gray-900">{form.accountType}</p>
              {form.detailType && (
                <p className="mt-0.5 text-gray-500">Detail type: {form.detailType}</p>
              )}
              <p className="text-gray-600">{previewEntry.statement}</p>
              <p className="text-xs text-gray-500">
                Normal balance: {previewEntry.normalBalance} · Default: {previewEntry.defaultAction}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-gray-500">Select an account type to preview statement placement.</p>
          )}
          {typeCatalogQuery.isError && (
            <p className="mt-2 text-xs text-red-700">Could not load detail-type catalog. Retry or open Lists → Detail Type.</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || ACCOUNT_CREATE_GATED}
          className="rounded-sm bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {ACCOUNT_CREATE_GATED ? "Awaiting approval — contact Jorge" : saving ? "Saving…" : "+ Create"}
        </button>
      </div>
    </form>
  );
}
