import { useEffect, useMemo, useState } from "react";
import type { CatalogFieldConfig, CatalogRow } from "../../hooks/useCatalogQuery";
import { useCatalogQuery } from "../../hooks/useCatalogQuery";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";
import { Combobox, type ComboboxOption } from "../Combobox";
import { DatePicker } from "../forms/DatePicker";
import { Modal } from "../Modal";
import { SelectCombobox } from "../shared/SelectCombobox";

type Props = {
  open: boolean;
  catalogName: string;
  displayName: string;
  companyId: string;
  row: CatalogRow | null;
  fields: CatalogFieldConfig[];
  readOnly?: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>, row: CatalogRow | null) => Promise<void>;
};

function initialFormState(fields: CatalogFieldConfig[], row: CatalogRow | null): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    const existing = row?.[field.key];
    if (existing !== undefined && existing !== null) {
      next[field.key] = existing;
      continue;
    }
    if (field.type === "boolean") {
      next[field.key] = true;
    } else if (field.type === "number") {
      next[field.key] = 50;
    } else {
      next[field.key] = "";
    }
  }
  return next;
}

function FieldInput({
  field,
  value,
  disabled,
  companyId,
  onChange,
}: {
  field: CatalogFieldConfig;
  value: unknown;
  disabled: boolean;
  companyId: string;
  onChange: (next: unknown) => void;
}) {
  // LST-F-FOREIGN-KEY-RAW-INPUT (2026-08-21): field.foreignKey already carries the referenced
  // catalog's name + which columns hold the label/value — enough to render a real picker — but this
  // branch used to render a bare <input type="text"> demanding the operator hand-type the raw FK
  // UUID. No catalog in GENERIC_CATALOG_REGISTRY currently declares a "foreign_key" field (confirmed
  // by grep — 0 live call sites), so this was never live-reachable, but it's exactly the picker_law
  // gap this modal's own field-type system was built to prevent for every OTHER type (enum uses a
  // real dropdown, not raw text). Hook called unconditionally (rules of hooks) — enabled only when
  // this field genuinely is a foreign_key with its catalogName populated.
  const referencedCatalogQuery = useCatalogQuery({
    catalogName: field.type === "foreign_key" ? field.foreignKey?.catalogName ?? "" : "",
    companyId,
    enabled: field.type === "foreign_key" && Boolean(field.foreignKey?.catalogName) && Boolean(companyId),
  });

  if (field.type === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "enum" && field.enumOptions) {
    return (
      <SelectCombobox
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
      >
        <option value="">Select…</option>
        {field.enumOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectCombobox>
    );
  }

  if (field.type === "foreign_key") {
    if (!field.foreignKey?.catalogName) {
      // Misconfigured field (foreignKey metadata missing) — fail honestly rather than fall back to
      // the old raw-ID box, which would silently reintroduce the picker_law gap this fix closes.
      return (
        <p className="text-xs text-red-600">
          {field.label}: no referenced catalog configured (foreignKey.catalogName missing).
        </p>
      );
    }
    const rows = referencedCatalogQuery.data?.rows ?? [];
    const { labelField, valueField } = field.foreignKey;
    const options: ComboboxOption[] = rows.map((row) => ({
      value: String(row[valueField] ?? row.id ?? ""),
      label: String(row[labelField] ?? row.display_name ?? row.code ?? row.id ?? ""),
    }));
    return (
      <Combobox
        options={options}
        value={value != null ? String(value) : null}
        onChange={onChange}
        loading={referencedCatalogQuery.isLoading}
        disabled={disabled}
        allowClear
        placeholder={field.placeholder ?? `Search ${field.label.toLowerCase()}…`}
        dataField={field.key}
      />
    );
  }

  if (field.type === "date") {
    return (
      <DatePicker
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(next) => onChange(next)}
        className="h-9 w-full"
      />
    );
  }

  if (field.type === "color") {
    // Native color picker is a real "pick" surface (not free text) while still allowing the exact
    // #RRGGBB entry these catalogs store — the <input type="color"> requires a full 6-digit hex, which
    // matches every live row's format; an invalid/partial hex in the paired text field just leaves the
    // swatch showing the last valid color until a full value is typed, never silently corrupting it.
    const hex = /^#[0-9a-fA-F]{6}$/.test(String(value ?? "")) ? String(value) : "#000000";
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${field.label} swatch`}
          value={hex}
          disabled={disabled}
          className="h-9 w-11 shrink-0 rounded-sm border border-gray-300 p-0.5"
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          type="text"
          value={String(value ?? "")}
          disabled={disabled}
          placeholder={field.placeholder}
          className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  const inputType = field.type === "number" ? "number" : "text";

  return (
    <input
      type={inputType}
      value={field.type === "number" ? String(value ?? "") : String(value ?? "")}
      disabled={disabled}
      placeholder={field.placeholder}
      className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
      onChange={(event) => {
        if (field.type === "number") {
          const parsed = event.target.value === "" ? "" : Number(event.target.value);
          onChange(parsed);
          return;
        }
        onChange(event.target.value);
      }}
    />
  );
}

export function CatalogEditModal({
  open,
  catalogName,
  displayName,
  companyId,
  row,
  fields,
  readOnly = false,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const mode = row ? "edit" : "create";
  const title = mode === "create" ? `Create ${displayName}` : `Edit ${displayName}`;

  useEffect(() => {
    if (!open) return;
    setForm(initialFormState(fields, row));
    setErrors({});
    setSubmitError("");
  }, [fields, open, row]);

  const isDirty = useMemo(() => {
    const baseline = initialFormState(fields, row);
    return JSON.stringify(baseline) !== JSON.stringify(form);
  }, [fields, form, row]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const value = form[field.key];
      if (field.required) {
        if (field.type === "boolean") continue;
        if (value === "" || value === null || value === undefined) {
          next[field.key] = `${field.label} is required.`;
        }
      }
      if (field.type === "number" && value !== "" && value !== null && value !== undefined) {
        if (!Number.isFinite(Number(value))) {
          next[field.key] = `${field.label} must be a number.`;
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (readOnly) return;
    if (!validate()) return;
    setSaving(true);
    setSubmitError("");
    try {
      const body: Record<string, unknown> = {};
      for (const field of fields) {
        if (mode === "edit" && field.readOnlyOnEdit) continue;
        const value = form[field.key];
        if (field.type === "number" && value !== "") {
          body[field.key] = Number(value);
        } else if ((field.type === "text" || field.type === "color") && typeof value === "string") {
          body[field.key] = value.trim();
        } else {
          body[field.key] = value;
        }
      }
      await onSave(body, row);
      onClose();
    } catch (error) {
      setSubmitError(userFacingApiError(error, "Failed to save catalog row"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title={title} confirmDiscardOnClose isDirty={isDirty}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Catalog: {catalogName}</p>
        {fields.map((field) => {
          const disabled = Boolean(readOnly || (mode === "edit" && field.readOnlyOnEdit));
          if (field.type === "boolean") {
            return (
              <div key={field.key}>
                <FieldInput
                  field={field}
                  value={form[field.key]}
                  disabled={disabled}
                  companyId={companyId}
                  onChange={(next) => setForm((current) => ({ ...current, [field.key]: next }))}
                />
                {errors[field.key] ? <p className="mt-1 text-xs text-red-600">{errors[field.key]}</p> : null}
              </div>
            );
          }
          return (
            <label key={field.key} className="block space-y-1">
              <span className="text-xs font-semibold text-gray-700">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <FieldInput
                field={field}
                value={form[field.key]}
                disabled={disabled}
                companyId={companyId}
                onChange={(next) => setForm((current) => ({ ...current, [field.key]: next }))}
              />
              {errors[field.key] ? <p className="text-xs text-red-600">{errors[field.key]}</p> : null}
            </label>
          );
        })}
        {submitError ? <p className="text-xs text-red-700">{submitError}</p> : null}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {!readOnly ? (
            <Button size="sm" loading={saving} onClick={() => void submit()}>
              {mode === "create" ? "Create" : "Save changes"}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
