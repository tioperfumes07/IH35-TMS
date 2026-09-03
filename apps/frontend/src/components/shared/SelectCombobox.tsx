import { Children, isValidElement, useMemo, useState, type ChangeEvent, type FocusEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { SimpleCombobox as Combobox } from "../Combobox";
import { singleFrameLayoutClassName } from "../../lib/single-frame-classname";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue"> & {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
  // SelectHTMLAttributes does not itself declare data-testid (it is a JSX-level allowance, not a
  // typed HTML attribute) -- declared explicitly so it can be captured and forwarded below.
  "data-testid"?: string;
};

type OptionRow = {
  value: string;
  label: string;
  disabled?: boolean;
};

function normalizeValue(value: Props["value"] | Props["defaultValue"]): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value);
}

function flattenOptions(children: ReactNode): OptionRow[] {
  const out: OptionRow[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    // React 19 types ReactElement.props as `unknown`; narrow to the option/optgroup shape we read.
    const props = child.props as { value?: unknown; children?: ReactNode; disabled?: boolean };
    if (child.type === "option") {
      const val = props.value == null ? "" : String(props.value);
      const raw = props.children;
      const label = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(" ") : String(raw ?? "");
      out.push({ value: val, label, disabled: Boolean(props.disabled) });
      return;
    }
    if (child.type === "optgroup") {
      out.push(...flattenOptions(props.children));
    }
  });
  return out;
}

// CLS-BOX-IN-BOX — SelectCombobox is an adapter around the canonical Combobox, whose input shell
// already owns its border, background, rounding, focus ring, and shadow. Most call sites predate the
// adapter and still pass native-<select> chrome in className. Applying those tokens to Combobox's
// OUTER positioning wrapper draws a second box around the real control (especially obvious inside
// right drawers such as Lists > Accounting > Detail Type). Keep layout/spacing/typography hooks, but
// discard frame chrome at this one shared boundary so every module gets one control frame.
//
// FLT-01-COMBOBOX-SWEEP-ARIA-TESTID-GAP: this adapter's own Props type is `Omit<SelectHTMLAttributes,
// ...>`, which lets TypeScript accept `aria-label` / `data-testid` on a call site silently -- but the
// destructuring below never captured either one, so both were dropped without a type error. A raw
// <select aria-label="…" data-testid="…"> converted to <SelectCombobox aria-label="…"
// data-testid="…"> compiled clean and looked identical in a diff, but lost its accessible name and
// its test hook. Now explicitly captured and forwarded to Combobox's own `ariaLabel`/`dataTestId`
// props (which already existed and already render real `aria-label`/`data-testid` DOM attributes).
export function SelectCombobox({
  value,
  defaultValue,
  onChange,
  children,
  disabled,
  required,
  className,
  name,
  id,
  onBlur,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: Props) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string | null>(() => normalizeValue(defaultValue));
  const options = useMemo(() => flattenOptions(children), [children]);
  const selected = controlled ? normalizeValue(value) : internalValue;
  // A native <select> treats `<option value="">Select X…</option>` as its placeholder row whether or not it
  // is disabled — SelectCombobox exists to be a drop-in for exactly that markup. Requiring `disabled` meant
  // the authored label was silently DROPPED and the generic "Select..." rendered instead, on 80 such options
  // across 47 files. Prefer a disabled empty option (the explicit form), then fall back to any empty-value
  // option, then the generic default.
  const placeholder =
    options.find((opt) => opt.disabled && opt.value === "")?.label ||
    options.find((opt) => opt.value === "")?.label ||
    "Select...";
  const layoutClassName = singleFrameLayoutClassName(className);

  return (
    <div
      onBlur={() => {
        if (!onBlur) return;
        onBlur({
          target: { value: selected ?? "", name: name ?? "", id: id ?? "" },
          currentTarget: { value: selected ?? "", name: name ?? "", id: id ?? "" },
        } as unknown as FocusEvent<HTMLSelectElement>);
      }}
    >
      <Combobox
        id={id}
        ariaLabel={ariaLabel}
        dataTestId={dataTestId}
        options={options
          .filter((opt) => !opt.disabled)
          .map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        value={selected}
        onChange={(nextValue) => {
          if (!controlled) setInternalValue(nextValue);
          if (!onChange) return;
          onChange({
            target: {
              value: nextValue ?? "",
              name: name ?? "",
              id: id ?? "",
              required: Boolean(required),
              disabled: Boolean(disabled),
            },
            currentTarget: {
              value: nextValue ?? "",
              name: name ?? "",
              id: id ?? "",
              required: Boolean(required),
              disabled: Boolean(disabled),
            },
          } as unknown as ChangeEvent<HTMLSelectElement>);
        }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={layoutClassName}
      />
    </div>
  );
}
