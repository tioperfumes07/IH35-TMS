import { useId, type KeyboardEvent } from "react";
import { V3Segmented } from "../v3/V3Segmented";

export type AccountingBasis = "accrual" | "cash";

type BasisSelectorProps = {
  value: AccountingBasis;
  onChange: (basis: AccountingBasis) => void;
  disabled?: boolean;
  /** V3 board filter bar: the drawn Accrual | Cash segmented control (no "Basis" caption), as on every report .dc.html. */
  board?: boolean;
};

const ORDERED_BASIS: AccountingBasis[] = ["accrual", "cash"];

export function BasisSelector({ value, onChange, disabled = false, board = false }: BasisSelectorProps) {
  const groupId = useId();
  if (board) {
    return (
      <V3Segmented<AccountingBasis>
        value={value}
        options={[{ id: "accrual", label: "Accrual" }, { id: "cash", label: "Cash" }]}
        onChange={(next) => { if (!disabled) onChange(next); }}
        testId="basis-selector"
      />
    );
  }

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
      <span id={groupId} className="text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
        Basis
      </span>
      <div role="group" aria-labelledby={groupId} className="inline-flex rounded-sm border border-[#E5E7EB] bg-[var(--surface-unselected)] p-0.5" onKeyDown={onKeyDown}>
        <button
          type="button"
          aria-pressed={value === "accrual"}
          disabled={disabled}
          className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${value === "accrual" ? "bg-[#0F1219] text-white" : "text-[#1F2A44] hover:bg-[var(--surface-hover)]"} disabled:opacity-60`}
          onClick={() => onChange("accrual")}
        >
          Accrual
        </button>
        <button
          type="button"
          aria-pressed={value === "cash"}
          disabled={disabled}
          className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${value === "cash" ? "bg-[#0F1219] text-white" : "text-[#1F2A44] hover:bg-[var(--surface-hover)]"} disabled:opacity-60`}
          onClick={() => onChange("cash")}
        >
          Cash
        </button>
      </div>
    </div>
  );
}
