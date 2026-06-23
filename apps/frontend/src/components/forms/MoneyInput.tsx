import { useEffect, useState } from "react";

// Shared QuickBooks-style money entry: leading $, thousands separators, 2 decimals, right-aligned,
// no spinner. TWO modes — each with exactly ONE conversion seam (documented so a future agent does not
// "unify" them and break a working financial money-path):
//   • CENTS mode  (valueCents/onChangeCents)   — for cents-origin fields (e.g. mdata.loads.*_cents,
//     Book Load §A). Typed dollars ↔ stored integer cents. parseToCents("350") = 35000.
//   • DOLLARS mode (valueDollars/onChangeDollars) — for dollars-origin financial fields that ALREADY
//     store dollars correctly (CostBreakdownBox, shared by Create WO + bills + expenses). Display-only
//     QBO format; the emitted/stored number stays dollars UNCHANGED (no ×100). M-1 ruling 2026-06-23
//     (option a): do NOT migrate these to cents — they have no 100x bug; forcing cents would touch a
//     working financial storage path for zero correctness gain. Byte-for-byte payload must be identical.
type Props = {
  valueCents?: number | null;
  onChangeCents?: (cents: number | null) => void;
  valueDollars?: number | null;
  onChangeDollars?: (dollars: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
};

function formatTwoDecimals(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCentsDisplay(cents: number | null): string {
  return formatTwoDecimals(cents == null || Number.isNaN(cents) ? null : cents / 100);
}

export function formatDollarsDisplay(dollars: number | null): string {
  return formatTwoDecimals(dollars);
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseToCents(text: string): number | null {
  const n = parseNumber(text);
  return n == null ? null : Math.round(n * 100);
}

export function parseToDollars(text: string): number | null {
  return parseNumber(text);
}

export function MoneyInput({
  valueCents,
  onChangeCents,
  valueDollars,
  onChangeDollars,
  placeholder,
  className = "",
  disabled,
  id,
  ariaLabel,
}: Props) {
  // DOLLARS mode is selected when a dollars prop is supplied; otherwise CENTS mode (the default).
  const isDollars = valueDollars !== undefined || onChangeDollars !== undefined;
  const display = isDollars ? formatDollarsDisplay(valueDollars ?? null) : formatCentsDisplay(valueCents ?? null);
  const rawValue = isDollars ? valueDollars ?? null : valueCents == null ? null : (valueCents ?? 0) / 100;

  const [text, setText] = useState<string>(display);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        disabled={disabled}
        className="h-7 w-full rounded border border-gray-300 pl-5 pr-2 text-right text-xs"
        placeholder={placeholder ?? "0.00"}
        value={text}
        onFocus={() => {
          setFocused(true);
          setText(rawValue == null ? "" : String(rawValue));
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (isDollars) onChangeDollars?.(parseToDollars(e.target.value));
          else onChangeCents?.(parseToCents(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          setText(display);
        }}
      />
    </div>
  );
}
