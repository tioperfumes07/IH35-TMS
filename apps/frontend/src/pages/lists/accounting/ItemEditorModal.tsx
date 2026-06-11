/**
 * ITEM1 — Two-sided item editor modal.
 *
 * An item carries both sides of a GL mapping:
 *   SELL side: "I sell this" → Description · Price/rate · Income account*
 *   BUY side:  "I purchase this from a vendor" → Purchase description ·
 *              Purchase cost · Preferred vendor · Expense account*
 *
 * Income account defaults to "Sales of Service Income" for carrier services
 * (TMS over QBO default — never "Sales of Product Income").
 *
 * Data stored in catalogs.items.metadata:
 *   item_type, sku, sell_enabled, sell_description, sell_price_cents,
 *   income_account, buy_enabled, buy_description, buy_cost_cents,
 *   preferred_vendor, expense_account
 *
 * NON-FINANCIAL gate: catalog data, no posting.
 */
import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import type { AccountingCatalogCreateBody, AccountingCatalogRow, AccountingCatalogUpdateBody } from "../../../api/catalogs-accounting";
import type { AccountingCatalogClient } from "./AccountingCatalogModal";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";

const ITEM_TYPES = [
  { value: "Service", label: "Service" },
  { value: "NonInventory", label: "Non-inventory" },
  { value: "Inventory", label: "Inventory" },
  { value: "Bundle", label: "Bundle" },
];

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
  itemType: string;
  sku: string;
  isActive: boolean;
  sellEnabled: boolean;
  sellDescription: string;
  sellPriceDollars: string;
  incomeAccount: string;
  buyEnabled: boolean;
  buyDescription: string;
  buyCostDollars: string;
  preferredVendor: string;
  expenseAccount: string;
};

function rowToForm(row: AccountingCatalogRow | null): FormState {
  const m = row?.metadata ?? {};
  return {
    code: row?.code ?? "",
    displayName: row?.display_name ?? "",
    itemType: String(m.item_type ?? "Service"),
    sku: String(m.sku ?? ""),
    isActive: row?.is_active ?? true,
    sellEnabled: m.sell_enabled !== false,
    sellDescription: String(m.sell_description ?? ""),
    sellPriceDollars: m.sell_price_cents ? String(Number(m.sell_price_cents) / 100) : "",
    incomeAccount: String(m.income_account ?? "Sales of Service Income"),
    buyEnabled: Boolean(m.buy_enabled),
    buyDescription: String(m.buy_description ?? ""),
    buyCostDollars: m.buy_cost_cents ? String(Number(m.buy_cost_cents) / 100) : "",
    preferredVendor: String(m.preferred_vendor ?? ""),
    expenseAccount: String(m.expense_account ?? ""),
  };
}

export function ItemEditorModal({ open, mode, row, operatingCompanyId, client, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(rowToForm(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(rowToForm(row));
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  function set<K extends keyof FormState>(key: K, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next.code = "Code is required.";
    if (!form.displayName.trim()) next.displayName = "Name is required.";
    if (form.sellEnabled && !form.incomeAccount.trim()) next.incomeAccount = "Income account is required.";
    if (form.buyEnabled && !form.expenseAccount.trim()) next.expenseAccount = "Expense account is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    setSubmitError("");
    const metadata: Record<string, unknown> = {
      item_type: form.itemType,
      sku: form.sku.trim() || null,
      sell_enabled: form.sellEnabled,
      sell_description: form.sellDescription.trim() || null,
      sell_price_cents: form.sellPriceDollars ? Math.round(parseFloat(form.sellPriceDollars) * 100) : null,
      income_account: form.incomeAccount.trim() || null,
      buy_enabled: form.buyEnabled,
      buy_description: form.buyDescription.trim() || null,
      buy_cost_cents: form.buyCostDollars ? Math.round(parseFloat(form.buyCostDollars) * 100) : null,
      preferred_vendor: form.preferredVendor.trim() || null,
      expense_account: form.expenseAccount.trim() || null,
    };
    const body: AccountingCatalogCreateBody & AccountingCatalogUpdateBody = {
      code: form.code.trim(),
      display_name: form.displayName.trim(),
      is_active: form.isActive,
      metadata,
    };
    try {
      if (mode === "create") await client.create(operatingCompanyId, body);
      else if (row) await client.update(row.id, operatingCompanyId, body);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = (err.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? err.message));
      } else {
        setSubmitError("Failed to save item.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!row) return;
    setSaving(true);
    try {
      await client.deactivate(row.id, operatingCompanyId);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = (err.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? err.message));
      } else {
        setSubmitError("Failed to deactivate item.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New product/service" : `Edit: ${row?.display_name ?? ""}`}
      sizePreset="lg"
    >
      <div className="flex flex-col gap-3 text-sm">
        {/* Basic fields */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Name *</span>
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              autoFocus
            />
            {errors.displayName ? <p className="mt-1 text-[11px] text-red-700">{errors.displayName}</p> : null}
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Code / ID *</span>
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
            {errors.code ? <p className="mt-1 text-[11px] text-red-700">{errors.code}</p> : null}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Item type</span>
            <select
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.itemType}
              onChange={(e) => set("itemType", e.target.value)}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">SKU</span>
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
            />
          </label>
        </div>

        {/* SELL SIDE */}
        <div className="rounded border border-gray-200 p-3">
          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.sellEnabled}
              onChange={(e) => set("sellEnabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            I sell this product/service to my customers
          </label>
          {form.sellEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold text-gray-600">Sales description</span>
                <textarea
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  rows={2}
                  value={form.sellDescription}
                  onChange={(e) => set("sellDescription", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Sales price / rate ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.sellPriceDollars}
                  onChange={(e) => set("sellPriceDollars", e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  Income account *{" "}
                  <span className="font-normal text-gray-400">(carrier default: Service income)</span>
                </span>
                <input
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.incomeAccount}
                  onChange={(e) => set("incomeAccount", e.target.value)}
                  placeholder="Sales of Service Income"
                />
                {errors.incomeAccount ? <p className="mt-1 text-[11px] text-red-700">{errors.incomeAccount}</p> : null}
              </label>
            </div>
          )}
        </div>

        {/* BUY SIDE */}
        <div className="rounded border border-gray-200 p-3">
          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.buyEnabled}
              onChange={(e) => set("buyEnabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            I purchase this product/service from a vendor
          </label>
          {form.buyEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold text-gray-600">Purchase description</span>
                <textarea
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  rows={2}
                  value={form.buyDescription}
                  onChange={(e) => set("buyDescription", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Purchase cost ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.buyCostDollars}
                  onChange={(e) => set("buyCostDollars", e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Preferred vendor</span>
                <input
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.preferredVendor}
                  onChange={(e) => set("preferredVendor", e.target.value)}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold text-gray-600">Expense account *</span>
                <input
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                  value={form.expenseAccount}
                  onChange={(e) => set("expenseAccount", e.target.value)}
                  placeholder="e.g. Operating Expenses"
                />
                {errors.expenseAccount ? <p className="mt-1 text-[11px] text-red-700">{errors.expenseAccount}</p> : null}
              </label>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active
        </label>

        {submitError ? (
          <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            {mode === "edit" ? (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleDeactivate()}>
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
              {mode === "create" ? "+ Create" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
