/**
 * BK7 — New Service (Product/Service item) drawer form — two-sided GL mapping.
 * SELL side: income account (defaults to Service income, not Product income — carrier fix).
 * BUY side: expense account + preferred vendor.
 * QB-STD-5: writes to catalogs.items (canonical) so the created item survives reload.
 * Previously used createQboItem → mdata.qbo_items (mirror), invisible after refresh.
 * FIX-03: the Income/Expense ACCOUNT pickers are now POPULATED from catalogs.accounts
 * (getCoaAccounts, the same source the categorize row + ItemEditorModal use) and the chosen
 * account ids PERSIST onto catalogs.items.default_income_account_id / default_expense_account_id
 * (metadata keys the /catalogs/accounting/items backend maps straight to columns). Previously the
 * account was a free-text box that was DROPPED at create — the item saved with no GL mapping.
 * LST-PICKER-01 (guard 1872): nested InlineCreateDrawer path now uses ReferenceSelect
 * createKind=account (same as ItemEditorModal) — bare Combobox had no "+ Add new account".
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsCatalogClient } from "../../../api/catalogs-accounting";
import { getCoaAccounts } from "../../../api/banking";
import { MoneyInput } from "../../forms/MoneyInput";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";
import { ReferenceSelect } from "../ReferenceSelect";
import type { ReferenceOption } from "../ReferenceSelect";

// FIX-03: mirror ItemEditorModal's account-type filters + carrier default so the two Product/Service
// creators behave identically (QBO parity: an item's income account is a referenced record, not text).
const INCOME_TYPES = ["Income", "OtherIncome"];
const EXPENSE_TYPES = ["Expense", "CostOfGoodsSold", "OtherExpense"];
const CARRIER_DEFAULT_INCOME_NAME = "Sales of Service Income";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

const ITEM_TYPES = [
  { value: "Service", label: "Service" },
  { value: "NonInventory", label: "Non-inventory" },
  { value: "Inventory", label: "Inventory" },
] as const;

type FormState = {
  name: string;
  itemType: string;
  sku: string;
  category: string;
  sellEnabled: boolean;
  sellDescription: string;
  sellPrice: number | null;
  incomeAccountId: string | null;
  buyEnabled: boolean;
  buyDescription: string;
  buyCost: number | null;
  preferredVendor: string;
  expenseAccountId: string | null;
};

export function NewServiceDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    itemType: "Service",
    sku: "",
    category: "",
    sellEnabled: true,
    sellDescription: "",
    sellPrice: null,
    incomeAccountId: null,
    buyEnabled: false,
    buyDescription: "",
    buyCost: null,
    preferredVendor: "",
    expenseAccountId: null,
  });

  // FIX-03: populate the Income/Expense pickers from catalogs.accounts (same source as the categorize
  // row + ItemEditorModal). getCoaAccounts is entity-scoped server-side (passes operating_company_id).
  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: !!operatingCompanyId,
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const incomeOptions: ReferenceOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type && INCOME_TYPES.includes(a.account_type))
        .map((a) => ({ value: a.id, label: a.account_name, type: a.account_number ?? undefined })),
    [accounts]
  );
  const expenseOptions: ReferenceOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type && EXPENSE_TYPES.includes(a.account_type))
        .map((a) => ({ value: a.id, label: a.account_name, type: a.account_number ?? undefined })),
    [accounts]
  );

  function refreshAccounts() {
    void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId] });
  }

  // Carrier default: on a sellable item with nothing chosen, preselect "Sales of Service Income".
  useEffect(() => {
    if (form.incomeAccountId || !form.sellEnabled) return;
    const dflt = accounts.find((a) => a.account_name === CARRIER_DEFAULT_INCOME_NAME && a.account_type && INCOME_TYPES.includes(a.account_type));
    if (dflt) setForm((prev) => (prev.incomeAccountId ? prev : { ...prev, incomeAccountId: dflt.id }));
  }, [accounts, form.incomeAccountId, form.sellEnabled]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { pushToast("Item name is required.", "error"); return; }
    if (form.sellEnabled && !form.incomeAccountId) {
      pushToast("Income account is required when selling this item.", "error");
      return;
    }
    if (form.buyEnabled && !form.expenseAccountId) {
      pushToast("Expense account is required when purchasing this item.", "error");
      return;
    }
    setSaving(true);
    try {
      // M-1: sellPrice stays a DOLLAR number → unit_price_cents = round(price*100) unchanged (byte-for-byte).
      // QB-STD-5: canonical catalogs.items — survives reload.
      // FIX-03: PERSIST the chosen GL accounts — default_income_account_id (sell) + default_expense_account_id
      // (buy). The backend /catalogs/accounting/items maps these metadata keys straight to columns and
      // validates account-type server-side. Buy-side desc/cost/vendor remain form-only (separate columns).
      const priceCents = form.sellPrice != null ? Math.round(form.sellPrice * 100) : 0;
      const nameSlug = (form.sku.trim() || form.name.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 20) || "ITEM").slice(0, 120);
      const res = await itemsCatalogClient.create(operatingCompanyId, {
        code: nameSlug || "ITEM",
        display_name: form.name.trim(),
        metadata: {
          item_type: form.itemType,
          unit_price_cents: priceCents,
          default_income_account_id: form.sellEnabled ? form.incomeAccountId : null,
          default_expense_account_id: form.buyEnabled ? form.expenseAccountId : null,
        },
      });
      onCreated({ id: String(res.id), label: form.name.trim() });
      pushToast("Item created", "success");
      onClose();
    } catch (err) {
      pushToast(String((err as Error).message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Name *</span>
        <input
          className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Line Haul"
          autoFocus
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Item type</span>
          <select
            className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
            value={form.itemType}
            onChange={(e) => set("itemType", e.target.value)}
          >
            {ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">SKU</span>
          <input
            className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
            value={form.sku}
            onChange={(e) => set("sku", e.target.value)}
          />
        </label>
      </div>

      {/* SELL SIDE */}
      <div className="rounded-sm border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={form.sellEnabled}
            onChange={(e) => set("sellEnabled", e.target.checked)}
            className="h-4 w-4 rounded-sm border-gray-300"
          />
          I sell this product/service to my customers
        </label>
        {form.sellEnabled && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Sales description</span>
              <textarea
                className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
                rows={2}
                value={form.sellDescription}
                onChange={(e) => set("sellDescription", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Sales price / rate</span>
              {/* M-1: dollars-mode QBO money entry; unit_price_cents byte-for-byte. */}
              <MoneyInput
                valueDollars={form.sellPrice}
                onChangeDollars={(d) => set("sellPrice", d)}
                ariaLabel="Sales price / rate"
                className="mt-1 w-full"
              />
            </label>
            <label className="block" data-testid="service-income-account-select">
              <span className="text-xs font-medium text-gray-700">
                Income account *{" "}
                <span className="font-normal text-gray-400">(carrier: defaults to Service income)</span>
              </span>
              <div className="mt-1">
                {/* LST-PICKER-01 (guard 1872): match ItemEditorModal — ReferenceSelect createKind=account */}
                <ReferenceSelect
                  options={incomeOptions}
                  value={form.incomeAccountId}
                  onChange={(v) => set("incomeAccountId", v)}
                  createKind="account"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select income account"
                  loading={accountsQuery.isLoading}
                  onOptionCreated={() => refreshAccounts()}
                />
              </div>
            </label>
          </div>
        )}
      </div>

      {/* BUY SIDE */}
      <div className="rounded-sm border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={form.buyEnabled}
            onChange={(e) => set("buyEnabled", e.target.checked)}
            className="h-4 w-4 rounded-sm border-gray-300"
          />
          I purchase this product/service from a vendor
        </label>
        {form.buyEnabled && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Purchase description</span>
              <textarea
                className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
                rows={2}
                value={form.buyDescription}
                onChange={(e) => set("buyDescription", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Cost</span>
              {/* M-1: dollars-mode QBO money entry. FIX-03 persists the expense ACCOUNT; cost/vendor stay form-only. */}
              <MoneyInput
                valueDollars={form.buyCost}
                onChangeDollars={(d) => set("buyCost", d)}
                ariaLabel="Cost"
                className="mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Preferred vendor</span>
              <input
                className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
                value={form.preferredVendor}
                onChange={(e) => set("preferredVendor", e.target.value)}
              />
            </label>
            <label className="block" data-testid="service-expense-account-select">
              <span className="text-xs font-medium text-gray-700">Expense account *</span>
              <div className="mt-1">
                <ReferenceSelect
                  options={expenseOptions}
                  value={form.expenseAccountId}
                  onChange={(v) => set("expenseAccountId", v)}
                  createKind="account"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select expense account"
                  loading={accountsQuery.isLoading}
                  onOptionCreated={() => refreshAccounts()}
                />
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0f1729]">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
