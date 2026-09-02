import { useEffect, useState } from "react";
import { singleFrameLayoutClassName } from "../../lib/single-frame-classname";

// GO-21-J1: plain-number sibling to MoneyInput — same QuickBooks display convention (thousands
// separators, right-aligned digits, no browser spinner) but NO leading $, for non-money numeric
// fields (weight, quantities, counts). A raw `<input type="number">` shows no separators past
// 999 and exposes the native up/down spinner every money/quantity field in this app has already
// been told to drop (see MoneyInput's own header comment) — this closes that gap for the
// non-dollar half of the same defect class.
type Props = {
  value?: number | null;
  onChange?: (value: number | null) => void;
  /** Decimal places to format/round to. 0 for integer counts (default; e.g. weight in whole lbs). */
  decimals?: number;
  /** Short unit suffix rendered inside the box, e.g. "lbs". Omit for unitless counts. */
  unit?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
};

function formatNumber(value: number | null, decimals: number): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseNumber(text: string, decimals: number): number | null {
  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return decimals === 0 ? Math.round(n) : Number(n.toFixed(decimals));
}

export function NumberInput({
  value,
  onChange,
  decimals = 0,
  unit,
  placeholder,
  className = "",
  disabled,
  id,
  name,
  ariaLabel,
}: Props) {
  const display = formatNumber(value ?? null, decimals);
  const [text, setText] = useState<string>(display);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);

  const layoutClassName = singleFrameLayoutClassName(className);

  return (
    <div className={`relative ${layoutClassName ?? ""}`}>
      <input
        id={id}
        name={name}
        aria-label={ariaLabel}
        inputMode="decimal"
        disabled={disabled}
        className={`h-7 w-full rounded-sm border border-gray-300 px-2 text-right text-xs ${unit ? "pr-9" : ""}`}
        placeholder={placeholder ?? "0"}
        value={text}
        onFocus={() => {
          setFocused(true);
          setText(value ? String(value) : "");
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange?.(parseNumber(e.target.value, decimals));
        }}
        onBlur={() => {
          setFocused(false);
          setText(display);
        }}
      />
      {unit ? (
        // GLOBAL-TYPE-SIZE-BASELINE.md (locked): body 12px — this unit suffix is body text, not a
        // column/section header. Tailwind's own text-xs (no custom theme override in this app) is
        // already exactly 12px, so this is the locked size via a real utility class, not another
        // one-off arbitrary bracket for the ratchet guard to count.
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">{unit}</span>
      ) : null}
    </div>
  );
}
