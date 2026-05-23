import { useId, type KeyboardEvent } from "react";

export type AccountingBasis = "accrual" | "cash";

type BasisSelectorProps = {
  value: AccountingBasis;
  onChange: (basis: AccountingBasis) => void;
  disabled?: boolean;
};

const ORDERED_BASIS: AccountingBasis[] = ["accrual", "cash"];

export function BasisSelector({ value, onChange, disabled = false }: BasisSelectorProps) {
  const groupId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = ORDERED_BASIS.indexOf(value);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + delta + ORDERED_BASIS.length) % ORDERED_BASIS.length;
    onChange(ORDERED_BASIS[nextIndex]);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span id={groupId} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        Basis
      </span>
      <div role="group" aria-labelledby={groupId} className="inline-flex rounded border border-slate-300 bg-white p-0.5" onKeyDown={onKeyDown}>
        <button
          type="button"
          aria-pressed={value === "accrual"}
          disabled={disabled}
          className={`rounded px-2.5 py-1 text-xs font-semibold ${value === "accrual" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"} disabled:opacity-60`}
          onClick={() => onChange("accrual")}
        >
          Accrual
        </button>
        <button
          type="button"
          aria-pressed={value === "cash"}
          disabled={disabled}
          className={`rounded px-2.5 py-1 text-xs font-semibold ${value === "cash" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"} disabled:opacity-60`}
          onClick={() => onChange("cash")}
        >
          Cash
        </button>
      </div>
    </div>
  );
}
