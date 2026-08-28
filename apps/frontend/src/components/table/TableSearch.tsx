import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// GLOBAL-TABLE-CONTROLS — shared free-text filter box. Narrows a list as you type.
// DISPATCH-SEARCH-BOX-KEYSTROKE-LOSS: do not drive the visible value through a
// per-keystroke URL round-trip. Local buffer + debounced parent emit. Native
// listeners stay for LV-FLEET-SEARCH-NO-FILTER (CDP sets .value without React).
const EMIT_MS = 300;

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Optional override; defaults to placeholder. Call sites may pass the same string for static a11y guards. */
  "aria-label"?: string;
  "data-testid"?: string;
};

export function TableSearch({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  "aria-label": ariaLabel,
  "data-testid": testId,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [local, setLocal] = useState(value);
  const lastEmittedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      setLocal(value);
    }
  }, [value]);

  const flush = (next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastEmittedRef.current = next;
    onChangeRef.current(next);
  };

  const scheduleEmit = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(next), EMIT_MS);
  };

  const handleTyped = (next: string) => {
    setLocal(next);
    scheduleEmit(next);
  };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onNativeInput = () => {
      const next = el.value;
      setLocal(next);
      scheduleEmit(next);
    };
    const onNativeChange = () => {
      const next = el.value;
      setLocal(next);
      flush(next);
    };
    el.addEventListener("input", onNativeInput);
    el.addEventListener("change", onNativeChange);
    return () => {
      el.removeEventListener("input", onNativeInput);
      el.removeEventListener("change", onNativeChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={`relative ${className}`} data-testid={testId}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => handleTyped(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        data-testid={testId ? `${testId}-input` : undefined}
        className="h-8 w-full rounded-sm border border-gray-300 pl-7 pr-2 text-[13px]"
      />
    </div>
  );
}
