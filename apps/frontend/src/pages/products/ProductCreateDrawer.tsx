/**
 * ProductCreateDrawer — A3 ParityDrawer for create/edit of Products & Services.
 * Non-financial: no GL posting, no accounting.* reads.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ParityDrawer } from "../../components/parity/ParityDrawer";

type ProductItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  type: "Service" | "Inventory" | "Non-inventory" | "Bundle";
  price: number | null;
  cost: number | null;
  qty_on_hand: number | null;
  reorder_point: number | null;
  is_active: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  operatingCompanyId: string;
  editItem: ProductItem | null;
  onSaved: () => void;
};

const ITEM_TYPES: ProductItem["type"][] = ["Service", "Inventory", "Non-inventory", "Bundle"];

const emptyForm = {
  name: "",
  description: "",
  sku: "",
  category: "",
  type: "Service" as ProductItem["type"],
  price: "",
  cost: "",
  qty_on_hand: "",
  reorder_point: "",
  is_active: true,
};

export function ProductCreateDrawer({ isOpen, onClose, operatingCompanyId, editItem, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        description: editItem.description ?? "",
        sku: editItem.sku ?? "",
        category: editItem.category ?? "",
        type: editItem.type,
        price: editItem.price !== null ? String(editItem.price) : "",
        cost: editItem.cost !== null ? String(editItem.cost) : "",
        qty_on_hand: editItem.qty_on_hand !== null ? String(editItem.qty_on_hand) : "",
        reorder_point: editItem.reorder_point !== null ? String(editItem.reorder_point) : "",
        is_active: editItem.is_active,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editItem, isOpen]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editItem ? `/api/v1/products/${editItem.id}` : "/api/v1/products";
      const method = editItem ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          operating_company_id: operatingCompanyId,
          price: data.price !== "" ? Number(data.price) : null,
          cost: data.cost !== "" ? Number(data.cost) : null,
          qty_on_hand: data.qty_on_hand !== "" ? Number(data.qty_on_hand) : null,
          reorder_point: data.reorder_point !== "" ? Number(data.reorder_point) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const footer = (
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={!form.is_active}
          onChange={(e) => set("is_active", !e.target.checked)}
        />
        Make inactive
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          form="product-form"
          disabled={saveMutation.isPending}
          className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <ParityDrawer
      open={isOpen}
      title={editItem ? "Edit item" : "New product / service"}
      subtitle="Products & Services"
      onClose={onClose}
      footer={footer}
    >
      <form
        id="product-form"
        onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
        className="space-y-4"
      >
        {saveMutation.isError ? (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">Failed to save. Please try again.</p>
        ) : null}
        <div>
          <label className="block text-sm font-medium text-gray-700">Name *</label>
          <input
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Item type</label>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
          >
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">SKU</label>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Add or select category"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Sales description</label>
          <textarea
            rows={2}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Sales price</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Purchase cost</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
            />
          </div>
        </div>
        {(form.type === "Inventory") ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Qty on hand</label>
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                value={form.qty_on_hand}
                onChange={(e) => set("qty_on_hand", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Reorder point</label>
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                value={form.reorder_point}
                onChange={(e) => set("reorder_point", e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </form>
    </ParityDrawer>
  );
}
