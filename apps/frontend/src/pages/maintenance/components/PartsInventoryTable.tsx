import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adjustPartsInventory, listPartsInventory, recordPartsPurchase, type PartsInventoryRow } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Props = {
  companyId: string;
  rows: PartsInventoryRow[];
};

export function PartsInventoryTable({ companyId, rows }: Props) {
  const queryClient = useQueryClient();
  const [openPurchase, setOpenPurchase] = useState(false);
  const [search, setSearch] = useState("");
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.part_description, r.last_purchase_invoice_number, r.location].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  // Parts are not a linkable entity (no part-detail route), so there are no record-cell links here —
  // this is the universal-list upgrade (sort/gear/pagination/resize/sticky/export/filter) + Adjust-Qty.
  const columns: Array<ParityColumn<PartsInventoryRow>> = [
    { key: "part_description", label: "Part", sortable: true },
    { key: "on_hand_qty", label: "On Hand", sortable: true },
    { key: "last_purchase_invoice_number", label: "Last Invoice", render: (row) => row.last_purchase_invoice_number ?? "—" },
    { key: "location", label: "Location", sortable: true, render: (row) => row.location ?? "—" },
  ];

  const rowActions = (row: PartsInventoryRow) => (
    <button className="text-slate-600 underline" onClick={() => setAdjustRow(row)} type="button">
      Adjust Qty
    </button>
  );

  return (
    <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Parts Inventory</h3>
        <Button size="sm" onClick={() => setOpenPurchase(true)}>+ Record Purchase</Button>
      </div>

      <ParityTable<PartsInventoryRow>
        columns={columns}
        rows={filteredRows}
        rowKey={(row) => row.id}
        emptyText="No parts on hand. Click + Record Purchase to track daily purchases. Anti-theft pattern: minimal stock kept on hand."
        storageKey="maint-parts-inventory"
        exportFilename="parts-inventory"
        rowActions={rowActions}
        filterBar={
          <input
            className="min-h-12 w-full max-w-xs rounded border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
            placeholder="Search part / invoice / location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      />

      <Modal open={openPurchase} onClose={() => setOpenPurchase(false)} title="Record Purchase">
        <div className="space-y-2">
          <input className="h-8 w-full rounded border border-gray-300 px-2 text-sm" placeholder="Part description" value={form.part_description} onChange={(e) => setForm((v) => ({ ...v, part_description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-sm" type="number" min={1} value={form.qty_received} onChange={(e) => setForm((v) => ({ ...v, qty_received: Number(e.target.value || 1) }))} />
            <input className="h-8 rounded border border-gray-300 px-2 text-sm" placeholder="Invoice #" value={form.vendor_invoice_number} onChange={(e) => setForm((v) => ({ ...v, vendor_invoice_number: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* M-1: dollars-mode QBO money entry; backend purchase_amount = numeric(10,2) DOLLARS, byte-for-byte. */}
            <MoneyInput valueDollars={form.purchase_amount} onChangeDollars={(d) => setForm((v) => ({ ...v, purchase_amount: d ?? 0 }))} ariaLabel="Purchase amount" />
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
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            <option value="used">used</option>
            <option value="discarded">discarded</option>
            <option value="shrinkage">shrinkage</option>
            <option value="recount">recount</option>
          </SelectCombobox>
          <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>Apply Adjustment</Button>
        </div>
      </Modal>
    </div>
  );
}

export async function preloadPartsInventory(companyId: string) {
  return listPartsInventory(companyId);
}
