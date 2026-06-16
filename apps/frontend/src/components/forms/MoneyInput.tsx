import { useEffect, useState } from "react";

// Shared QuickBooks-style money entry: leading $, thousands separators, 2 decimals,
// right-aligned. Stores integer cents. While focused it shows a raw editable number;
// on blur it reformats. (Block P — reused by Load Wizard, accounting, scheduler.)
type Props = {
  valueCents: number | null;
  onChangeCents: (cents: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
};

export function formatCentsDisplay(cents: number | null): string {
  if (cents == null || Number.isNaN(cents)) return "";
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseToCents(text: string): number | null {
  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function MoneyInput({ valueCents, onChangeCents, placeholder, className = "", disabled, id, ariaLabel }: Props) {
  const [text, setText] = useState<string>(formatCentsDisplay(valueCents));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatCentsDisplay(valueCents));
  }, [valueCents, focused]);

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
          setText(valueCents == null ? "" : String(valueCents / 100));
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChangeCents(parseToCents(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          setText(formatCentsDisplay(valueCents));
        }}
      />
    </div>
  );
}
