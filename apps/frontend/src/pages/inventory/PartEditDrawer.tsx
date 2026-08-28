import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { updateMaintenancePart, type MaintenancePartRow } from "../../api/maintenance";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { invalidatePartsStockQueries } from "./partsStockQueryKeys";
import {
  PART_INVENTORY_CATEGORIES,
  formatPartInventoryCategoryLabel,
} from "./partInventoryCategories";

interface PartEditDrawerProps {
  part: MaintenancePartRow | null;
  onClose: () => void;
  operatingCompanyId: string;
}

export function PartEditDrawer({ part, onClose, operatingCompanyId }: PartEditDrawerProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "",
    on_hand_qty: "",
    reorder_point: "",
    unit_cost: "",
    location: "",
    notes: "",
    vendor_id: "",
  });

  useEffect(() => {
    if (!part) return;
    setFormData({
      name: part.name ?? "",
      sku: part.part_number ?? "",
      category: part.category ?? "",
      on_hand_qty: String(part.qty_on_hand ?? 0),
      reorder_point: String(part.reorder_threshold ?? 0),
      unit_cost: part.unit_cost != null ? String(part.unit_cost) : "",
      location: part.location ?? "",
      notes: part.notes ?? "",
      vendor_id: part.vendor_id ?? "",
    });
  }, [part]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!part) throw new Error("No part selected");
      return updateMaintenancePart(part.id, operatingCompanyId, {
        part_number: data.sku.trim() || undefined,
        name: data.name.trim(),
        category: data.category.trim() || undefined,
        qty_on_hand: Number(data.on_hand_qty) || 0,
        reorder_threshold: Number(data.reorder_point) || 0,
        unit_cost: Number(data.unit_cost) || 0,
        location: data.location.trim() || null,
        notes: data.notes.trim() || null,
        vendor_id: data.vendor_id.trim() || null,
      });
    },
    onSuccess: async () => {
      await invalidatePartsStockQueries(queryClient, operatingCompanyId);
      onClose();
    },
    // INV-F6323: zero error handling anywhere in this file — no onError, no isError render, no
    // try/catch at the fire-and-forget .mutate() call site. A rejected update (validation error,
    // 500, network failure) silently did nothing: the drawer just sat there with no explanation.
    onError: (err) => pushToast(userFacingApiError(err, "Could not update the part"), "error"),
  });

  if (!part) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold">Edit part</h2>
          <button onClick={onClose} className="rounded-sm p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!formData.category.trim()) return;
            updateMutation.mutate(formData);
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
            <label className="block text-sm font-medium" htmlFor="inv-part-edit-category">
              Category *
            </label>
            <SelectCombobox
              id="inv-part-edit-category"
              required
              className="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              aria-label="Part category"
            >
              <option value="">Select category…</option>
              {PART_INVENTORY_CATEGORIES.map((code) => (
                <option key={code} value={code}>
                  {formatPartInventoryCategoryLabel(code)}
                </option>
              ))}
            </SelectCombobox>
          </div>
          <div>
            <label className="block text-sm font-medium">Preferred vendor</label>
            <div className="mt-1" data-testid="inv-part-edit-vendor-picker">
              {/* CLS-SILENT-CAP: EntityPicker server-search — no 200-row listVendors page. */}
              <EntityPicker
                kind="vendor"
                operatingCompanyId={operatingCompanyId}
                value={formData.vendor_id || null}
                onChange={(next) => setFormData({ ...formData, vendor_id: next ?? "" })}
                placeholder="Search vendor…"
                dataTestId="inv-part-edit-vendor"
                allowCreate
                allowClear
                enabled={Boolean(part)}
              />
            </div>
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
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={updateMutation.isPending}>Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
