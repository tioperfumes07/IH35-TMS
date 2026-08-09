import { Children, isValidElement, useMemo, useState, type ChangeEvent, type FocusEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { Combobox } from "./Combobox";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue"> & {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
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
        className={className}
      />
    </div>
  );
}
