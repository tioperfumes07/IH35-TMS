type Props = {
  subtotal: number;
  taxRate?: number;
  grandLabel: string;
  taxRateMode?: "editable" | "readonly";
  onTaxRateChange?: (next: number) => void;
};

export function TotalsStack({ subtotal, taxRate = 8.25, grandLabel, taxRateMode = "editable", onTaxRateChange }: Props) {
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;
  const readonly = taxRateMode === "readonly";

  return (
    <div className="totals-stack overflow-hidden rounded border border-gray-300 bg-white text-xs">
      <div className="totals-row flex items-center justify-end gap-6 px-[18px] py-[7px]">
        <span className="font-semibold text-slate-600">Subtotal</span>
        <span className="font-semibold text-slate-900">${subtotal.toFixed(2)}</span>
      </div>
      <div className="totals-row flex items-center justify-end gap-6 border-t border-gray-200 px-[18px] py-[7px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600">Tax %</span>
          <input
            className="tax-input w-[60px] rounded border border-gray-300 px-[6px] py-[3px] text-right"
            type="number"
            step="0.01"
            value={taxRate}
            readOnly={readonly}
            onChange={(event) => onTaxRateChange?.(Number(event.target.value || 0))}
          />
        </div>
        <span className="font-semibold text-slate-900">${taxAmount.toFixed(2)}</span>
      </div>
      <div className="totals-row grand flex items-center justify-end gap-6 bg-[#1b2333] px-[18px] py-3 text-white">
        <span className="font-semibold">{grandLabel}</span>
        <span className="text-sm font-semibold">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}
