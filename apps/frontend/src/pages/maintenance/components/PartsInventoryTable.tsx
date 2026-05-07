import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adjustPartsInventory, listPartsInventory, recordPartsPurchase, type PartsInventoryRow } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";

type Props = {
  companyId: string;
  rows: PartsInventoryRow[];
};

export function PartsInventoryTable({ companyId, rows }: Props) {
  const queryClient = useQueryClient();
  const [openPurchase, setOpenPurchase] = useState(false);
  const [form, setForm] = useState({ part_description: "", qty_received: 1, vendor_invoice_number: "", purchase_amount: 0, location: "" });
  const [adjustRow, setAdjustRow] = useState<PartsInventoryRow | null>(null);
  const [deltaQty, setDeltaQty] = useState(0);
  const [reason, setReason] = useState<"used" | "discarded" | "shrinkage" | "recount">("recount");

  const purchaseMutation = useMutation({
    mutationFn: () => recordPartsPurchase(companyId, form),
    onSuccess: async () => {
      setOpenPurchase(false);
      setForm({ part_description: "", qty_received: 1, vendor_invoice_number: "", purchase_amount: 0, location: "" });
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-inventory", companyId] });
    },
  });
  const adjustMutation = useMutation({
    mutationFn: () => {
      if (!adjustRow) {
        throw new Error("No parts inventory row selected");
      }
      return adjustPartsInventory(adjustRow.id, companyId, { delta_qty: deltaQty, reason });
    },
    onSuccess: async () => {
      setAdjustRow(null);
      setDeltaQty(0);
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-inventory", companyId] });
    },
  });

  return (
    <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Parts Inventory</h3>
        <Button size="sm" onClick={() => setOpenPurchase(true)}>+ Record Purchase</Button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-700">
          No parts on hand. Click + Record Purchase to track daily purchases. Anti-theft pattern: minimal stock kept on hand.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-2 py-1">Part</th>
                <th className="px-2 py-1">On Hand</th>
                <th className="px-2 py-1">Last Invoice</th>
                <th className="px-2 py-1">Location</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-2 py-1">{row.part_description}</td>
                  <td className="px-2 py-1">{row.on_hand_qty}</td>
                  <td className="px-2 py-1">{row.last_purchase_invoice_number ?? "—"}</td>
                  <td className="px-2 py-1">{row.location ?? "—"}</td>
                  <td className="px-2 py-1">
                    <button className="text-blue-600 underline" onClick={() => setAdjustRow(row)} type="button">Adjust Qty</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={openPurchase} onClose={() => setOpenPurchase(false)} title="Record Purchase">
        <div className="space-y-2">
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-sm" placeholder="Part description" value={form.part_description} onChange={(e) => setForm((v) => ({ ...v, part_description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-sm" type="number" min={1} value={form.qty_received} onChange={(e) => setForm((v) => ({ ...v, qty_received: Number(e.target.value || 1) }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-sm" placeholder="Invoice #" value={form.vendor_invoice_number} onChange={(e) => setForm((v) => ({ ...v, vendor_invoice_number: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-sm" type="number" min={0} step="0.01" value={form.purchase_amount} onChange={(e) => setForm((v) => ({ ...v, purchase_amount: Number(e.target.value || 0) }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-sm" placeholder="Location" value={form.location} onChange={(e) => setForm((v) => ({ ...v, location: e.target.value }))} />
          </div>
          <Button onClick={() => purchaseMutation.mutate()} disabled={!form.part_description.trim() || purchaseMutation.isPending}>
            Save Purchase
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(adjustRow)} onClose={() => setAdjustRow(null)} title="Adjust Quantity">
        <div className="space-y-2">
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-sm" type="number" value={deltaQty} onChange={(e) => setDeltaQty(Number(e.target.value || 0))} />
          <select className="h-8 w-full rounded border border-gray-300 px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            <option value="used">used</option>
            <option value="discarded">discarded</option>
            <option value="shrinkage">shrinkage</option>
            <option value="recount">recount</option>
          </select>
          <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>Apply Adjustment</Button>
        </div>
      </Modal>
    </div>
  );
}

export async function preloadPartsInventory(companyId: string) {
  return listPartsInventory(companyId);
}
