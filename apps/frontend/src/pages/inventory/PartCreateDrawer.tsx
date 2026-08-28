import { useState } from "react";
import { apiRequest } from "../../api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
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

interface PartCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  operatingCompanyId: string;
}

export function PartCreateDrawer({ isOpen, onClose, onCreated, operatingCompanyId }: PartCreateDrawerProps) {
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // B1: create against the real maintenance.parts_inventory backend (no /api/v1/inventory/parts route exists).
      // Company id goes in the query string (the POST handler reads it from req.query); map this drawer's
      // field names onto the maintenance createSchema (sku -> part_number, on_hand_qty -> qty_on_hand, etc.).
      //
      // D5-1: route through the shared apiRequest helper instead of a raw fetch(). apiRequest adds
      // credentials:"include" (the prod API is cross-origin — a raw fetch dropped the session cookie
      // and 401'd before the body was read → "Failed to create part"), applies the API base URL, and
      // attaches a POST Idempotency-Key.
      // INV-1: SKU/category/notes are now REAL, persisted backend columns. Send the SKU only when the
      // user typed one — leaving it blank lets the backend generate a stable "PART-XXXXXXXX" SKU (no
      // longer falls back to the part name, and no longer a fake id::text SKU). category + notes persist.
      // INV-2: is_active is NOT sent — maintenance.parts_inventory has no is_active/archive column, and
      // the backend zod schema only accepts-and-ignores it (see parts.routes.ts createSchema comment:
      // "forward-compat: the drawer also posts is_active; accept + ignore"). Sending it made the "Make
      // inactive" checkbox a dead control that silently did nothing. Removed here; re-add once a real
      // archive/is_active column + persistence ship (needs a migration — queued for Jorge).
      return apiRequest<{ id: string }>(
        `/api/v1/maintenance/parts?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        {
          method: "POST",
          body: {
            part_number: data.sku.trim() || undefined,
            name: data.name.trim(),
            category: data.category.trim(),
            qty_on_hand: Number(data.on_hand_qty) || 0,
            reorder_threshold: Number(data.reorder_point) || 0,
            unit_cost: Number(data.unit_cost) || 0,
            location: data.location.trim() || undefined,
            notes: data.notes.trim() || undefined,
            vendor_id: data.vendor_id.trim() || undefined,
          },
        }
      );
    },
    onSuccess: async (created) => {
      await invalidatePartsStockQueries(queryClient, operatingCompanyId);
      onCreated?.(created.id);
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
        vendor_id: "",
      });
    },
    // INV-F6323: zero error handling anywhere in this file — no onError, no isError render, no
    // try/catch at the fire-and-forget .mutate() call site. A rejected create (validation error,
    // 500, network failure) silently did nothing: the drawer just sat there with no explanation.
    onError: (err) => pushToast(userFacingApiError(err, "Could not create the part"), "error"),
  });

  const canSubmit = Boolean(formData.name.trim() && formData.category.trim());

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
            e.stopPropagation();
            if (!canSubmit || createMutation.isPending) return;
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
            {/* INV-CAT-01: real SelectCombobox — not free-text with a picker-shaped placeholder.
                Options = PART_INVENTORY_CATEGORIES (maintenance.parts_inventory.category taxonomy).
                Do not seed/read deprecated catalogs.parts. */}
            <label className="block text-sm font-medium" htmlFor="inv-part-category">
              Category *
            </label>
            <SelectCombobox
              id="inv-part-category"
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
            <div className="mt-1" data-testid="inv-part-create-vendor-picker">
              {/* CLS-SILENT-CAP: EntityPicker server-search — no 200-row listVendors page. */}
              <EntityPicker
                kind="vendor"
                operatingCompanyId={operatingCompanyId}
                value={formData.vendor_id || null}
                onChange={(next) => setFormData({ ...formData, vendor_id: next ?? "" })}
                placeholder="Search vendor…"
                dataTestId="inv-part-create-vendor"
                allowCreate
                allowClear
                enabled={isOpen}
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
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={!canSubmit || createMutation.isPending}
              data-testid="inv-part-create-save"
            >
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
