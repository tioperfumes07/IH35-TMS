/**
 * Block 8 gap 1 — TWO-SIDED VENDOR-INVOICE RECONCILE (render-v5 signature control).
 * Captures the vendor invoice's parts + labor totals and shows the variance vs the WO's own parts + labor
 * totals. The modal HARD-GATES Create until both tie (see reconcileOk in CreateWorkOrderModal). Read-only
 * math here; the gating + disabled-save live in the parent so the validation checklist stays the source of
 * truth. §7 palette only (navy/slate + the single red for the blocking variance).
 */

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

  const row = (
    label: string,
    woC: number,
    input: string,
    onChange: (v: string) => void,
    variance: number,
    ok: boolean,
    testid: string
  ) => (
    <tr className="border-t border-slate-200">
      <td className="px-2 py-1 font-medium text-slate-700">{label}</td>
      <td className="px-2 py-1 text-right tabular-nums text-slate-900">{fmt(woC)}</td>
      <td className="px-2 py-1 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          data-testid={testid}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-28 rounded border border-gray-300 px-2 text-right text-xs tabular-nums"
          placeholder="0.00"
        />
      </td>
      <td className={`px-2 py-1 text-right tabular-nums font-semibold ${ok ? "text-slate-500" : "text-[#A32D2D]"}`}>
        {ok ? "tie" : fmt(variance)}
      </td>
    </tr>
  );

  return (
    <section data-testid="wo-vendor-invoice-reconcile" className="rounded border border-slate-300 bg-slate-50 p-2 text-xs">
      <div className="mb-1 font-semibold text-[#1F2A44]">Vendor Invoice Reconcile</div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            <th className="px-2 py-0.5 text-left font-semibold"> </th>
            <th className="px-2 py-0.5 text-right font-semibold">WO total</th>
            <th className="px-2 py-0.5 text-right font-semibold">Invoice total</th>
            <th className="px-2 py-0.5 text-right font-semibold">Variance</th>
          </tr>
        </thead>
        <tbody>
          {row("Parts", woPartsC, invoicePartsInput, onInvoicePartsChange, partsVar, partsOk, "invoice-parts-input")}
          {row("Labor", woLaborC, invoiceLaborInput, onInvoiceLaborChange, laborVar, laborOk, "invoice-labor-input")}
        </tbody>
      </table>
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
