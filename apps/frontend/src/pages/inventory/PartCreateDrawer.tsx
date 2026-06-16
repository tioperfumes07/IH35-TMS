import { useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "../../components/Button";

interface PartCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  operatingCompanyId: string;
}

export function PartCreateDrawer({ isOpen, onClose, operatingCompanyId }: PartCreateDrawerProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "",
    on_hand_qty: "",
    reorder_point: "",
    unit_cost: "",
    location: "",
    notes: "",
    is_active: true,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // B1: create against the real maintenance.parts_inventory backend (no /api/v1/inventory/parts route exists).
      // Company id goes in the query string (the POST handler reads it from req.query); map this drawer's
      // field names onto the maintenance createSchema (sku -> part_number, on_hand_qty -> qty_on_hand, etc.).
      const res = await fetch(resolveApiUrl(`/api/v1/maintenance/parts?operating_company_id=${encodeURIComponent(operatingCompanyId)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_number: data.sku.trim() || data.name.trim(),
          name: data.name.trim(),
          qty_on_hand: Number(data.on_hand_qty) || 0,
          reorder_threshold: Number(data.reorder_point) || 0,
          unit_cost: Number(data.unit_cost) || 0,
          location: data.location.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create part");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "parts", operatingCompanyId] });
      onClose();
      setFormData({
        name: "",
        sku: "",
        category: "",
        on_hand_qty: "",
        reorder_point: "",
        unit_cost: "",
        location: "",
        notes: "",
        is_active: true,
      });
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold">+ Create part</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(formData);
          }}
          className="space-y-4 p-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Name *</label>
              <input
                required
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">SKU</label>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Category</label>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Select or add category"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">On-hand qty</label>
              <input
                type="number"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                value={formData.on_hand_qty}
                onChange={(e) => setFormData({ ...formData, on_hand_qty: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Reorder point</label>
              <input
                type="number"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                value={formData.reorder_point}
                onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Unit cost</label>
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                value={formData.unit_cost}
                onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Location/Bin</label>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Notes</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            <span className="text-sm">Make inactive</span>
          </label>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
