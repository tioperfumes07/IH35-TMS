/**
 * Block 8 gap 1 — TWO-SIDED VENDOR-INVOICE RECONCILE (render-v5 signature control).
 * Captures the vendor invoice's parts + labor + other totals and shows the variance vs the WO's own
 * parts + labor + other totals. The modal HARD-GATES Create until all three tie (see reconcileOk in
 * CreateWorkOrderModal). Read-only math here; the gating + disabled-save live in the parent so the
 * validation checklist stays the source of truth. §7 palette only (navy/slate + the single red for the
 * blocking variance).
 *
 * LV-WO-RECONCILE-EXCLUDES-SECTION-A / LV-WO-RECONCILE-LINE-TYPE-DOMAIN-LEAK — the "Other / Category"
 * row is a RESIDUAL bucket (WO grand total − parts − labor), computed in the parent by subtraction,
 * not by enumerating a third literal type here. It exists precisely so Section A category lines and
 * any sub-row whose line_type isn't 'parts'/'part'/'labor' (disposal, other, or any future value)
 * cannot silently vanish from the tie-out the way they did before this fix — see the parent's own
 * comment at the woGrandTotalDollars computation for the full root-cause writeup.
 */
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

function toCents(dollars: number): number {
  return Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
}

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

type Props = {
  woPartsDollars: number;
  woLaborDollars: number;
  woOtherDollars: number;
  invoicePartsInput: string;
  invoiceLaborInput: string;
  invoiceOtherInput: string;
  onInvoicePartsChange: (v: string) => void;
  onInvoiceLaborChange: (v: string) => void;
  onInvoiceOtherChange: (v: string) => void;
};

type ReconcileRow = {
  id: "parts" | "labor" | "other";
  label: string;
  woTotalCents: number;
  invoiceInput: string;
  onInvoiceChange: (value: string) => void;
  varianceCents: number;
  isTied: boolean;
  inputTestId: string;
};

export function CreateWOSectionReconcile({
  woPartsDollars,
  woLaborDollars,
  woOtherDollars,
  invoicePartsInput,
  invoiceLaborInput,
  invoiceOtherInput,
  onInvoicePartsChange,
  onInvoiceLaborChange,
  onInvoiceOtherChange,
}: Props) {
  const woPartsC = toCents(woPartsDollars);
  const woLaborC = toCents(woLaborDollars);
  const woOtherC = toCents(woOtherDollars);
  const invPartsC = toCents(Number(invoicePartsInput));
  const invLaborC = toCents(Number(invoiceLaborInput));
  const invOtherC = toCents(Number(invoiceOtherInput));
  const partsVar = woPartsC - invPartsC;
  const laborVar = woLaborC - invLaborC;
  const otherVar = woOtherC - invOtherC;
  const partsOk = partsVar === 0;
  const laborOk = laborVar === 0;
  const otherOk = otherVar === 0;
  const tied = partsOk && laborOk && otherOk;

  const rows: ReconcileRow[] = [
    {
      id: "parts",
      label: "Parts",
      woTotalCents: woPartsC,
      invoiceInput: invoicePartsInput,
      onInvoiceChange: onInvoicePartsChange,
      varianceCents: partsVar,
      isTied: partsOk,
      inputTestId: "invoice-parts-input",
    },
    {
      id: "labor",
      label: "Labor",
      woTotalCents: woLaborC,
      invoiceInput: invoiceLaborInput,
      onInvoiceChange: onInvoiceLaborChange,
      varianceCents: laborVar,
      isTied: laborOk,
      inputTestId: "invoice-labor-input",
    },
    // Only rendered when there's actually something in it, so a normal WO with no Section A / no
    // disposal / no stray line_type sees the same two-row panel it always has — this row only ever
    // appears when there is real money it would otherwise hide.
    ...(woOtherC !== 0 || invOtherC !== 0
      ? [
          {
            id: "other" as const,
            label: "Other / Category",
            woTotalCents: woOtherC,
            invoiceInput: invoiceOtherInput,
            onInvoiceChange: onInvoiceOtherChange,
            varianceCents: otherVar,
            isTied: otherOk,
            inputTestId: "invoice-other-input",
          },
        ]
      : []),
  ];

  const columns: Array<ParityColumn<ReconcileRow>> = [
    {
      key: "label",
      label: " ",
      alwaysVisible: true,
      render: (row) => <span className="font-medium text-slate-700">{row.label}</span>,
    },
    {
      key: "woTotalCents",
      label: "WO total",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums text-slate-900",
      render: (row) => fmt(row.woTotalCents),
    },
    {
      key: "invoiceInput",
      label: "Invoice total",
      className: "text-right",
      cellClass: "text-right",
      render: (row) => (
        // SYS-MONEY STEP 2: vendor-invoice total inputs retain the $ prefix and numeric value/onChange contract.
        <div className="relative inline-block w-28 align-middle">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            data-testid={row.inputTestId}
            value={row.invoiceInput}
            onChange={(event) => row.onInvoiceChange(event.target.value)}
            className="h-7 w-full rounded-sm border border-gray-300 pl-4 pr-2 text-right text-xs tabular-nums"
            placeholder="0.00"
          />
        </div>
      ),
    },
    {
      key: "varianceCents",
      label: "Variance",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums font-semibold",
      render: (row) => (
        <span className={row.isTied ? "text-slate-500" : "text-[#A32D2D]"}>
          {row.isTied ? "tie" : fmt(row.varianceCents)}
        </span>
      ),
    },
  ];

  return (
    <section data-testid="wo-vendor-invoice-reconcile" className="rounded-sm border border-slate-300 bg-slate-50 p-2 text-xs">
      <div className="mb-1 font-semibold text-[#1F2A44]">Vendor Invoice Reconcile</div>
      <div className="min-w-[360px] overflow-x-auto">
        <ParityTable<ReconcileRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          density="ultra"
          pageSizeOptions={[3]}
          initialPageSize={3}
          storageKey="maintenance-create-wo-vendor-invoice-reconcile"
          tableTestId="wo-vendor-invoice-reconcile-table"
          stickyHeader={false}
        />
      </div>
      {tied ? (
        <div data-testid="reconcile-status-ok" className="mt-1 text-[11px] font-semibold text-slate-600">
          Reconciled — WO parts &amp; labor tie to the vendor invoice.
        </div>
      ) : (
        <div data-testid="reconcile-status-blocked" className="mt-1 text-[11px] font-semibold text-[#A32D2D]">
          Create is blocked — WO totals must tie to the vendor invoice. Resolve the variance above.
        </div>
      )}
    </section>
  );
}
