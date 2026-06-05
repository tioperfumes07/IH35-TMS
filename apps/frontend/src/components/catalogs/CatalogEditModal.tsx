import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api/client";
import type { CatalogFieldConfig, CatalogRow } from "../../hooks/useCatalogQuery";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { SelectCombobox } from "../shared/SelectCombobox";

type Props = {
  open: boolean;
  catalogName: string;
  displayName: string;
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
  onChange,
}: {
  field: CatalogFieldConfig;
  value: unknown;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
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
        className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
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
    return (
      <input
        type="text"
        value={String(value ?? "")}
        disabled={disabled}
        placeholder={field.placeholder ?? "Foreign key ID"}
        className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <input
      type={inputType}
      value={field.type === "number" ? String(value ?? "") : String(value ?? "")}
      disabled={disabled}
      placeholder={field.placeholder}
      className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
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
        } else if (field.type === "text" && typeof value === "string") {
          body[field.key] = value.trim();
        } else {
          body[field.key] = value;
        }
      }
      await onSave(body, row);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.data as { error?: string } | undefined;
        setSubmitError(payload?.error ?? error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : "Failed to save catalog row");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} confirmDiscardOnClose isDirty={isDirty}>
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
