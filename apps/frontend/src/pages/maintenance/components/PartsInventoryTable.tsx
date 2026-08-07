import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adjustPartsInventory, listPartsInventory, recordPartsPurchase, type PartsInventoryRow } from "../../../api/maintenance";
import { listVendors } from "../../../api/mdata";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { capNotice, listCapInfo } from "../../../lib/list-cap";

// CLS-SILENT-CAP: named so the fetch and the truncation check read the SAME number.
// 2,836 vendors on prod, so an unsearched 200-row fetch hides 2,636 of them.
const VENDOR_PICKER_CAP = 200;


type Props = {
  companyId: string;
  rows: PartsInventoryRow[];
};

type PurchaseForm = {
  part_description: string;
  qty_received: number;
  vendor_id: string;
  vendor_invoice_number: string;
  purchase_amount: number;
  location: string;
};

const EMPTY_PURCHASE: PurchaseForm = {
  part_description: "",
  qty_received: 1,
  vendor_id: "",
  vendor_invoice_number: "",
  purchase_amount: 0,
  location: "",
};

export function PartsInventoryTable({ companyId, rows }: Props) {
  const queryClient = useQueryClient();
  const [openPurchase, setOpenPurchase] = useState(false);
  const [search, setSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [form, setForm] = useState<PurchaseForm>(EMPTY_PURCHASE);
  const [adjustRow, setAdjustRow] = useState<PartsInventoryRow | null>(null);
  const [deltaQty, setDeltaQty] = useState(0);
  const [reason, setReason] = useState<"used" | "discarded" | "shrinkage" | "recount">("recount");

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", companyId, "parts-inventory", vendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: companyId,
        status: "active",
        limit: VENDOR_PICKER_CAP,
        search: vendorSearch || undefined,
      }),
    enabled: Boolean(companyId),
  });

  // CLS-SILENT-CAP: EXACT truncation — listVendors returns the server's real `total`.
  const vendorCap = useMemo(
    () => listCapInfo(vendorsQuery.data?.vendors?.length ?? 0, VENDOR_PICKER_CAP, vendorsQuery.data?.total ?? null),
    [vendorsQuery.data],
  );
  const vendorCapNotice = capNotice(vendorCap, "vendors");
  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption),
    [vendorsQuery.data?.vendors],
  );
  const vendorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vendorsQuery.data?.vendors ?? []) {
      map.set(v.id, v.name);
    }
    return map;
  }, [vendorsQuery.data?.vendors]);

  const purchaseMutation = useMutation({
    mutationFn: () =>
      recordPartsPurchase(companyId, {
        part_description: form.part_description,
        qty_received: form.qty_received,
        vendor_id: form.vendor_id || undefined,
        vendor_invoice_number: form.vendor_invoice_number || undefined,
        purchase_amount: form.purchase_amount,
        location: form.location || undefined,
      }),
    onSuccess: async () => {
      setOpenPurchase(false);
      setForm(EMPTY_PURCHASE);
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
      [r.part_description, r.last_purchase_invoice_number, r.location, r.vendor_id, vendorNameById.get(r.vendor_id ?? "")].some(
        (v) => String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, search, vendorNameById]);

  const columns: Array<ParityColumn<PartsInventoryRow>> = [
    // Part # is its OWN column, matching how McLeod and NetSuite parts grids are laid out: a scannable
    // identifier column beside a human description. The column already exists on
    // maintenance.parts_inventory and the endpoint SELECT *s it — it was just never typed or rendered,
    // so the SKU ended up embedded in part_description and wrapped across eight lines.
    { key: "part_number", label: "Part #", sortable: true, render: (row) => row.part_number ?? "—" },
    { key: "part_description", label: "Description", sortable: true },
    { key: "on_hand_qty", label: "On Hand", sortable: true },
    {
      key: "vendor_id",
      label: "Vendor",
      sortable: true,
      render: (row) =>
        row.vendor_id ? (
          <EntityLink kind="vendor" id={row.vendor_id} label={vendorNameById.get(row.vendor_id) ?? row.vendor_id.slice(0, 8)} />
        ) : (
          "—"
        ),
    },
    { key: "last_purchase_invoice_number", label: "Last Invoice", render: (row) => row.last_purchase_invoice_number ?? "—" },
    { key: "location", label: "Location", sortable: true, render: (row) => row.location ?? "—" },
  ];

  const rowActions = (row: PartsInventoryRow) => (
    // whitespace-nowrap: the actions column is narrow, so "Adjust Qty" wrapped to two lines and the
    // second line was clipped by the table edge — the control rendered as "Adjus / Qty", cut off.
    <button className="whitespace-nowrap text-slate-600 underline" onClick={() => setAdjustRow(row)} type="button">
      Adjust Qty
    </button>
  );

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="parts-inventory-table">
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
            className="min-h-12 w-full max-w-xs rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
            placeholder="Search part / vendor / invoice / location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      />

      <Modal open={openPurchase} onClose={() => setOpenPurchase(false)} title="Record Purchase">
        <div className="space-y-2">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            placeholder="Part description"
            value={form.part_description}
            onChange={(e) => setForm((v) => ({ ...v, part_description: e.target.value }))}
          />
          <label className="block text-xs font-semibold text-gray-700">
            Vendor
            <div className="mt-1" data-testid="parts-inventory-vendor-picker">
              {/* CLS-SILENT-CAP: say so when the picker is not showing every vendor. */}
              {vendorCapNotice ? <p className="text-[10px] text-slate-700">{vendorCapNotice}</p> : null}
              <ReferenceSelect
                value={form.vendor_id || null}
                onChange={(next) => setForm((v) => ({ ...v, vendor_id: next ?? "" }))}
                options={vendorOptions}
                createKind="vendor"
                operatingCompanyId={companyId}
                placeholder="Select vendor…"
                loading={vendorsQuery.isLoading}
                onSearch={setVendorSearch}
                onOptionCreated={(opt) => {
                  setForm((v) => ({ ...v, vendor_id: opt.value }));
                  void vendorsQuery.refetch();
                }}
              />
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-8 rounded-sm border border-gray-300 px-2 text-sm"
              type="number"
              min={1}
              value={form.qty_received}
              onChange={(e) => setForm((v) => ({ ...v, qty_received: Number(e.target.value || 1) }))}
            />
            <input
              className="h-8 rounded-sm border border-gray-300 px-2 text-sm"
              placeholder="Invoice #"
              value={form.vendor_invoice_number}
              onChange={(e) => setForm((v) => ({ ...v, vendor_invoice_number: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* M-1: dollars-mode QBO money entry; backend purchase_amount = numeric(10,2) DOLLARS, byte-for-byte. */}
            <MoneyInput valueDollars={form.purchase_amount} onChangeDollars={(d) => setForm((v) => ({ ...v, purchase_amount: d ?? 0 }))} ariaLabel="Purchase amount" />
            <input
              className="h-8 rounded-sm border border-gray-300 px-2 text-sm"
              placeholder="Location"
              value={form.location}
              onChange={(e) => setForm((v) => ({ ...v, location: e.target.value }))}
            />
          </div>
          <Button onClick={() => purchaseMutation.mutate()} disabled={!form.part_description.trim() || purchaseMutation.isPending}>
            Save Purchase
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(adjustRow)} onClose={() => setAdjustRow(null)} title="Adjust Quantity">
        <div className="space-y-2">
          <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" type="number" value={deltaQty} onChange={(e) => setDeltaQty(Number(e.target.value || 0))} />
          <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
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
