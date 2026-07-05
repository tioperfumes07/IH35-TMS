import { useState } from "react";
import { apiRequest } from "../../api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";

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
      //
      // D5-1: route through the shared apiRequest helper instead of a raw fetch(). apiRequest adds
      // credentials:"include" (the prod API is cross-origin — a raw fetch dropped the session cookie
      // and 401'd before the body was read → "Failed to create part"), applies the API base URL, and
      // attaches a POST Idempotency-Key. category/notes/is_active are forwarded (forward-compatible;
      // the current backend createSchema strips them until columns exist).
      return apiRequest<{ id: string }>(
        `/api/v1/maintenance/parts?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        {
          method: "POST",
          body: {
            part_number: data.sku.trim() || data.name.trim(),
            name: data.name.trim(),
            category: data.category.trim() || undefined,
            qty_on_hand: Number(data.on_hand_qty) || 0,
            reorder_threshold: Number(data.reorder_point) || 0,
            unit_cost: Number(data.unit_cost) || 0,
            location: data.location.trim() || undefined,
            notes: data.notes.trim() || undefined,
            is_active: data.is_active,
          },
        }
      );
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
          <button onClick={onClose} className="rounded-sm p-1 hover:bg-gray-100">
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
                className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">SKU</label>
              <input
                className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Category</label>
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
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
                className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
                value={formData.on_hand_qty}
                onChange={(e) => setFormData({ ...formData, on_hand_qty: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Reorder point</label>
              <input
                type="number"
                className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
                value={formData.reorder_point}
                onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Unit cost</label>
              {/* M-1: dollars-mode QBO money entry; backend /maintenance/parts unit_cost = numeric(10,2) DOLLARS.
                  Bridged over the all-strings formData so submit Number(data.unit_cost) is byte-for-byte. */}
              <MoneyInput
                valueDollars={formData.unit_cost ? Number(formData.unit_cost) : null}
                onChangeDollars={(d) => setFormData({ ...formData, unit_cost: d == null ? "" : String(d) })}
                ariaLabel="Unit cost"
                className="mt-1 w-full"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Location/Bin</label>
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Notes</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2">
            {/* D5-1: the checkbox reads "Make inactive", so a checked box must mean inactive. It was
                bound directly to is_active (checked => active) — inverted vs its own label. Bind to the
                negation so the default (is_active:true) renders unchecked. */}
            <input
              type="checkbox"
              checked={!formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: !e.target.checked })}
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
