import { useState, useMemo } from "react";
import { apiRequest } from "../../api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { listVendors } from "../../api/mdata";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../components/parity/referenceOptionLabels";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import {
  PART_INVENTORY_CATEGORIES,
  formatPartInventoryCategoryLabel,
} from "./partInventoryCategories";
import { capNotice, listCapInfo } from "../../lib/list-cap";

// CLS-SILENT-CAP: named so the fetch and the truncation check read the SAME number.
// 2,836 vendors on prod, so an unsearched 200-row fetch hides 2,636 of them.
const VENDOR_PICKER_CAP = 200;


interface PartCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  operatingCompanyId: string;
}

export function PartCreateDrawer({ isOpen, onClose, onCreated, operatingCompanyId }: PartCreateDrawerProps) {
  const queryClient = useQueryClient();
  const [vendorSearch, setVendorSearch] = useState("");
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

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", operatingCompanyId, "part-create", vendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: operatingCompanyId,
        status: "active",
        limit: VENDOR_PICKER_CAP,
        search: vendorSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId) && isOpen,
  });

  // CLS-SILENT-CAP: EXACT truncation — listVendors returns the server's real `total`.
  const vendorCap = useMemo(
    () => listCapInfo(vendorsQuery.data?.vendors?.length ?? 0, VENDOR_PICKER_CAP, vendorsQuery.data?.total ?? null),
    [vendorsQuery.data],
  );
  const vendorCapNotice = capNotice(vendorCap, "vendors");
  const vendorOptions = (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption);

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
      await queryClient.invalidateQueries({ queryKey: ["inventory", "parts", operatingCompanyId] });
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
            e.stopPropagation();
            if (!formData.category.trim()) return;
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
              {/* CLS-SILENT-CAP: say so when the picker is not showing every vendor. */}
              {vendorCapNotice ? <p className="text-[10px] text-slate-700">{vendorCapNotice}</p> : null}
              <ReferenceSelect
                value={formData.vendor_id || null}
                onChange={(next) => setFormData({ ...formData, vendor_id: next ?? "" })}
                options={vendorOptions}
                createKind="vendor"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select vendor…"
                loading={vendorsQuery.isLoading}
                onSearch={setVendorSearch}
                onOptionCreated={(opt) => {
                  setFormData((v) => ({ ...v, vendor_id: opt.value }));
                  void vendorsQuery.refetch();
                }}
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
            <Button type="submit" loading={createMutation.isPending}>Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
