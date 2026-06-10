/**
 * BK7 — New Service (Product/Service item) drawer form — two-sided GL mapping.
 * SELL side: income account (defaults to Service income, not Product income — carrier fix).
 * BUY side: expense account + preferred vendor.
 * OPERATIONAL gate: item create is non-financial.
 */
import { useState } from "react";
import { createQboItem } from "../../../api/qbo-mdata";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";

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
  sellPrice: string;
  incomeAccount: string;
  buyEnabled: boolean;
  buyDescription: string;
  buyCost: string;
  preferredVendor: string;
  expenseAccount: string;
};

export function NewServiceDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    itemType: "Service",
    sku: "",
    category: "",
    sellEnabled: true,
    sellDescription: "",
    sellPrice: "",
    incomeAccount: "Sales of Service Income",
    buyEnabled: false,
    buyDescription: "",
    buyCost: "",
    preferredVendor: "",
    expenseAccount: "",
  });

  function set<K extends keyof FormState>(key: K, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { pushToast("Item name is required.", "error"); return; }
    if (form.sellEnabled && !form.incomeAccount.trim()) {
      pushToast("Income account is required when selling this item.", "error");
      return;
    }
    setSaving(true);
    try {
      const priceCents = form.sellPrice ? Math.round(parseFloat(form.sellPrice) * 100) : 0;
      const res = await createQboItem(operatingCompanyId, {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        unit_price_cents: priceCents,
        income_account_qbo_id: form.incomeAccount.trim() || "Sales of Service Income",
      });
      onCreated({ id: String(res.item.id), label: form.name.trim() });
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
          className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
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
            className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
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
            className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
            value={form.sku}
            onChange={(e) => set("sku", e.target.value)}
          />
        </label>
      </div>

      {/* SELL SIDE */}
      <div className="rounded border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={form.sellEnabled}
            onChange={(e) => set("sellEnabled", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          I sell this product/service to my customers
        </label>
        {form.sellEnabled && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Sales description</span>
              <textarea
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                rows={2}
                value={form.sellDescription}
                onChange={(e) => set("sellDescription", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Sales price / rate</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                value={form.sellPrice}
                onChange={(e) => set("sellPrice", e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">
                Income account *{" "}
                <span className="font-normal text-gray-400">(carrier: defaults to Service income)</span>
              </span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                value={form.incomeAccount}
                onChange={(e) => set("incomeAccount", e.target.value)}
                placeholder="Sales of Service Income"
              />
            </label>
          </div>
        )}
      </div>

      {/* BUY SIDE */}
      <div className="rounded border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={form.buyEnabled}
            onChange={(e) => set("buyEnabled", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          I purchase this product/service from a vendor
        </label>
        {form.buyEnabled && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Purchase description</span>
              <textarea
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                rows={2}
                value={form.buyDescription}
                onChange={(e) => set("buyDescription", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Cost</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                value={form.buyCost}
                onChange={(e) => set("buyCost", e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Preferred vendor</span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                value={form.preferredVendor}
                onChange={(e) => set("preferredVendor", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Expense account *</span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
                value={form.expenseAccount}
                onChange={(e) => set("expenseAccount", e.target.value)}
                placeholder="e.g. Operating Expenses"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-700">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
