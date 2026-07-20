/**
 * Block 8 gap 1 — TWO-SIDED VENDOR-INVOICE RECONCILE (render-v5 signature control).
 * Captures the vendor invoice's parts + labor totals and shows the variance vs the WO's own parts + labor
 * totals. The modal HARD-GATES Create until both tie (see reconcileOk in CreateWorkOrderModal). Read-only
 * math here; the gating + disabled-save live in the parent so the validation checklist stays the source of
 * truth. §7 palette only (navy/slate + the single red for the blocking variance).
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
  invoicePartsInput: string;
  invoiceLaborInput: string;
  onInvoicePartsChange: (v: string) => void;
  onInvoiceLaborChange: (v: string) => void;
};

type ReconcileRow = {
  id: "parts" | "labor";
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
  invoicePartsInput,
  invoiceLaborInput,
  onInvoicePartsChange,
  onInvoiceLaborChange,
}: Props) {
  const woPartsC = toCents(woPartsDollars);
  const woLaborC = toCents(woLaborDollars);
  const invPartsC = toCents(Number(invoicePartsInput));
  const invLaborC = toCents(Number(invoiceLaborInput));
  const partsVar = woPartsC - invPartsC;
  const laborVar = woLaborC - invLaborC;
  const partsOk = partsVar === 0;
  const laborOk = laborVar === 0;
  const tied = partsOk && laborOk;

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
          pageSizeOptions={[2]}
          initialPageSize={2}
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
