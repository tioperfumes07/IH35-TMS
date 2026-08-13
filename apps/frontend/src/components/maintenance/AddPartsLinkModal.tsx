import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listVendors } from "../../api/mdata";
import { createPartsAssignment } from "../../api/maintenance";
import { Button } from "../Button";
import { MoneyInput } from "../forms/MoneyInput";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { vendorReferenceOption } from "../parity/referenceOptionLabels";

// CLS-SILENT-CAP: named so the fetch and the truncation check read the SAME number (same pattern
// as inventory/PartCreateDrawer.tsx's vendor picker).
const VENDOR_PICKER_CAP = 200;

type Props = {
  open: boolean;
  workOrderId: string;
  operatingCompanyId: string;
  onClose: () => void;
};

// LST-INVENTORY-WRITE-PATH: maintenance.parts_invoice_links had a real, working POST route
// (BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY) that no frontend surface ever called — the read side
// (WorkOrderDetailModal's Parts Links section, InventoryAssignmentsPage, UnitPartsHistorySection,
// VendorPartsHistorySection) was all built and wired, but a row could only ever be created by a
// direct DB insert. This modal is the missing write path.
export function AddPartsLinkModal({ open, workOrderId, operatingCompanyId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amountDollars, setAmountDollars] = useState<number | null>(null);
  const [qty, setQty] = useState("1");
  const [partDescription, setPartDescription] = useState("");

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", operatingCompanyId, "parts-link", vendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: operatingCompanyId,
        status: "active",
        limit: VENDOR_PICKER_CAP,
        search: vendorSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId) && open,
  });
  const vendorOptions = (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption);

  const reset = () => {
    setVendorId("");
    setInvoiceNumber("");
    setAmountDollars(null);
    setQty("1");
    setPartDescription("");
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createPartsAssignment(workOrderId, operatingCompanyId, {
        vendor_id: vendorId,
        vendor_invoice_number: invoiceNumber.trim(),
        vendor_invoice_amount: Number(amountDollars ?? 0),
        qty_used: Math.max(1, Number(qty) || 1),
        part_description: partDescription.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-assignments", operatingCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["vendor-parts-history", operatingCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["unit-parts-history"] });
      reset();
      onClose();
    },
  });

  if (!open) return null;

  const canSubmit = Boolean(vendorId) && invoiceNumber.trim().length > 0 && partDescription.trim().length > 0 && (amountDollars ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-y-auto rounded-sm bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold">+ Add parts link</h2>
          <button type="button" onClick={onClose} className="rounded-sm p-1 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) createMutation.mutate();
          }}
          className="space-y-3 p-4"
        >
          {createMutation.isError ? (
            <p className="rounded-sm bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {(createMutation.error as { message?: string })?.message ?? "Couldn't save this parts link."}
            </p>
          ) : null}
          <div>
            <label className="block text-xs font-medium text-gray-700">Vendor *</label>
            <div className="mt-1" data-testid="parts-link-vendor-picker">
              <ReferenceSelect
                value={vendorId || null}
                onChange={(next) => setVendorId(next ?? "")}
                options={vendorOptions}
                createKind="vendor"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select vendor…"
                loading={vendorsQuery.isLoading}
                onSearch={setVendorSearch}
                onOptionCreated={(opt) => {
                  setVendorId(opt.value);
                  void vendorsQuery.refetch();
                }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Part description *</label>
            <input
              required
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
              value={partDescription}
              onChange={(e) => setPartDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Vendor invoice # *</label>
              <input
                required
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Qty used</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Invoice amount *</label>
            <MoneyInput valueDollars={amountDollars} onChangeDollars={setAmountDollars} ariaLabel="Invoice amount" className="mt-1 w-full" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={createMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
