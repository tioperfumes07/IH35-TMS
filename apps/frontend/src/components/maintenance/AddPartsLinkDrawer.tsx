import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPartsAssignment } from "../../api/maintenance";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { EntityPicker } from "../parity/EntityPicker";

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
export function AddPartsLinkDrawer({ open, workOrderId, operatingCompanyId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amountDollars, setAmountDollars] = useState<number | null>(null);
  const [qty, setQty] = useState("1");
  const [partDescription, setPartDescription] = useState("");

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

  const canSubmit = Boolean(vendorId) && invoiceNumber.trim().length > 0 && partDescription.trim().length > 0 && (amountDollars ?? 0) > 0;

  return (
    <Modal open={open} onClose={onClose} title="+ Add parts link" variant="drawer">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canSubmit) createMutation.mutate();
        }}
        className="space-y-3"
      >
        {createMutation.isError ? (
          <p className="rounded-sm bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {(createMutation.error as { message?: string })?.message ?? "Couldn't save this parts link."}
          </p>
        ) : null}
        <div>
          <label className="block text-xs font-medium text-gray-700">Vendor *</label>
          <div className="mt-1" data-testid="parts-link-vendor-picker">
            {/* CLS-SILENT-CAP: EntityPicker server-search — no 200-row listVendors page. */}
            <EntityPicker
              kind="vendor"
              allowCreate
              operatingCompanyId={operatingCompanyId}
              value={vendorId || null}
              onChange={(next) => setVendorId(next ?? "")}
              enabled={open}
              placeholder="Select vendor…"
              dataField="parts-link-vendor"
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
    </Modal>
  );
}
