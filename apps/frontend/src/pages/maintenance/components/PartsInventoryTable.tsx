import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adjustPartsInventory, listPartsInventory, recordPartsPurchase, type PartsInventoryRow, type PartsPurchaseGlPosting } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { invalidatePartsStockQueries } from "../../inventory/partsStockQueryKeys";

type Props = {
  companyId: string;
  rows: PartsInventoryRow[];
  /** Inventory Purchase History deep-link opens the one canonical creator, not a duplicate form. */
  openPurchaseOnMount?: boolean;
  /** MAINT-S19 — ParityTable emptyText only when settled. */
  loading?: boolean;
  // CLS-LIST-ERROR-STATE-UNGUARDED. This component owns no query — the parent does — so it could not
  // know a fetch had failed and rendered its empty state instead, i.e. "no parts in inventory" when the
  // truth was "we could not ask". The contract is extended the same way `loading` already is: the owner
  // of the query passes the outcome down. Threading two more props is the ROOT fix; special-casing the
  // empty text inside this component would have been the patch.
  isError?: boolean;
  // REQUIRED, not optional: ListErrorState needs a retry, and an error state you cannot retry is a
  // dead end. Making it optional would have let a future caller wire isError without a way out.
  onRetry: () => void;
  highlightedRowId?: string;
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

export function PartsInventoryTable({ companyId, rows, openPurchaseOnMount = false, loading = false, isError = false, onRetry, highlightedRowId = "" }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [openPurchase, setOpenPurchase] = useState(openPurchaseOnMount);
  // Search is ONLY ParityTable UniversalListToolbar (LV-PARTS-INVENTORY-DUPLICATE-SEARCH).
  const [form, setForm] = useState<PurchaseForm>(EMPTY_PURCHASE);
  const [adjustRow, setAdjustRow] = useState<PartsInventoryRow | null>(null);
  // LINK-F5186 (parts_inventory.record_purchase): surfaces the real gl_posting result the backend
  // already returns (MNT-ECON-01) but the frontend previously discarded entirely.
  const [lastGlPosting, setLastGlPosting] = useState<PartsPurchaseGlPosting | null>(null);
  const [deltaQty, setDeltaQty] = useState(0);
  const [reason, setReason] = useState<"used" | "discarded" | "shrinkage" | "recount">("recount");
  const adjustmentGenerationRef = useRef(0);

  // MAINT-MONEY-F6631-PARTS-PURCHASE-MUTABLE-COMPANY-DRAFT-SCOPE — this was a zero-argument
  // mutation whose writer closed over the LIVE (mutable) companyId AND every live `form` field,
  // and whose onSuccess closed over the current companyId for stock/purchase-history
  // invalidation and published the returned GL result unconditionally. A company switch or a
  // draft edit while the request was pending could submit/refresh a different scope than the
  // operator confirmed, or surface stale GL feedback on the next entity. Reuses the SAME
  // company-scoped generation ref adjustMutation below already established (bumped on companyId
  // change) — one scope boundary, two mutations.
  const purchaseMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; draft: PurchaseForm }) =>
      recordPartsPurchase(input.companyId, {
        part_description: input.draft.part_description,
        qty_received: input.draft.qty_received,
        vendor_id: input.draft.vendor_id || undefined,
        vendor_invoice_number: input.draft.vendor_invoice_number || undefined,
        purchase_amount: input.draft.purchase_amount,
        location: input.draft.location || undefined,
      }),
    onSuccess: async (created, input) => {
      if (input.generation !== adjustmentGenerationRef.current) return;
      setOpenPurchase(false);
      setForm(EMPTY_PURCHASE);
      setLastGlPosting(created.gl_posting ?? null);
      await invalidatePartsStockQueries(queryClient, input.companyId);
      // INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT: keep Purchase History fresh for the same session.
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-purchases", input.companyId] });
    },
    onError: (err, input) => {
      if (input.generation !== adjustmentGenerationRef.current) return;
      pushToast(userFacingApiError(err, "Could not record parts purchase"), "error");
    },
  });
  const adjustMutation = useMutation({
    mutationFn: (input: {
      rowId: string;
      companyId: string;
      generation: number;
      deltaQty: number;
      reason: "used" | "discarded" | "shrinkage" | "recount";
    }) => adjustPartsInventory(input.rowId, input.companyId, { delta_qty: input.deltaQty, reason: input.reason }),
    onSuccess: async (_result, input) => {
      if (input.generation !== adjustmentGenerationRef.current) return;
      setAdjustRow(null);
      setDeltaQty(0);
      await invalidatePartsStockQueries(queryClient, input.companyId);
    },
    onError: (err, input) => {
      if (input.generation === adjustmentGenerationRef.current) {
        pushToast(userFacingApiError(err, "Could not apply inventory adjustment"), "error");
      }
    },
  });

  useEffect(() => {
    adjustmentGenerationRef.current += 1;
    adjustMutation.reset();
    setAdjustRow(null);
    setDeltaQty(0);
    setReason("recount");
    // MAINT-MONEY-F6631 — retire any in-flight/pending purchase action and its GL feedback on a
    // company transition too; both mutations share this same generation boundary.
    purchaseMutation.reset();
    setOpenPurchase(false);
    setForm(EMPTY_PURCHASE);
    setLastGlPosting(null);
  }, [companyId]);

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
          <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />
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

      {/* LINK-F5186 (parts_inventory.record_purchase): the backend already returns gl_posting on
      every purchase create -- surface it honestly instead of discarding it. */}
      {lastGlPosting ? (
        <div
          className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs"
          data-testid="parts-purchase-gl-posting-result"
        >
          {lastGlPosting.posted && lastGlPosting.journal_entry_id ? (
            <>
              <span className="text-gray-600">Purchase posted to GL.</span>
              <EntityLink
                kind="journal_entry"
                id={lastGlPosting.journal_entry_id}
                label="View journal entry →"
                className="font-semibold text-slate-700 underline"
              />
            </>
          ) : (
            <span className="text-gray-500">
              Not posted to GL{lastGlPosting.reason ? ` (${lastGlPosting.reason.replace(/_/g, " ")})` : ""} — inventory row saved.
            </span>
          )}
          <button type="button" className="ml-3 text-gray-400 hover:text-gray-600" onClick={() => setLastGlPosting(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {isError ? (
        <ListErrorState
          title="Couldn't load parts inventory"
          status={0}
          message={undefined}
          onRetry={onRetry}
        />
      ) : (
      <ParityTable<PartsInventoryRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowClassName={(row) => highlightedRowId && row.id === highlightedRowId ? "bg-slate-100 ring-1 ring-slate-400" : ""}
        loading={loading}
        emptyText="No parts on hand. Click + Record Purchase to track daily purchases. Anti-theft pattern: minimal stock kept on hand."
        storageKey="maint-parts-inventory"
        exportFilename="parts-inventory"
        rowActions={rowActions}
      />
      )}

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
              {/* CLS-SILENT-CAP: EntityPicker server-search — no 200-row listVendors page. */}
              <EntityPicker
                kind="vendor"
                operatingCompanyId={companyId}
                value={form.vendor_id || null}
                onChange={(next) => setForm((v) => ({ ...v, vendor_id: next ?? "" }))}
                placeholder="Search vendor…"
                dataTestId="parts-inventory-vendor"
                allowCreate
                allowClear
                enabled={openPurchase}
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
          <Button
            onClick={() => purchaseMutation.mutate({ companyId, generation: adjustmentGenerationRef.current, draft: { ...form } })}
            disabled={!form.part_description.trim() || purchaseMutation.isPending}
          >
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
          <Button
            onClick={() => {
              if (!adjustRow) return;
              adjustMutation.mutate({
                rowId: adjustRow.id,
                companyId,
                generation: adjustmentGenerationRef.current,
                deltaQty,
                reason,
              });
            }}
            disabled={adjustMutation.isPending}
          >
            Apply Adjustment
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export async function preloadPartsInventory(companyId: string) {
  return listPartsInventory(companyId);
}
