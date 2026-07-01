import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import type { AccountingCatalogCreateBody, AccountingCatalogRow, AccountingCatalogUpdateBody } from "../../../api/catalogs-accounting";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

export type AccountingCatalogClient = {
  create: (operating_company_id: string, body: AccountingCatalogCreateBody) => Promise<{ id: string }>;
  update: (id: string, operating_company_id: string, body: AccountingCatalogUpdateBody) => Promise<{ id: string }>;
  deactivate: (id: string, operating_company_id: string) => Promise<{ ok: true }>;
};

export type AccountingMetadataField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
};

type Props = {
  open: boolean;
  readOnly?: boolean;
  operatingCompanyId: string;
  displayName: string;
  codeLabel?: string;
  client: AccountingCatalogClient;
  mode: "create" | "edit";
  row: AccountingCatalogRow | null;
  metadataFields?: AccountingMetadataField[];
  // Default sort order for a NEW row = max(existing)+1, computed by the list page.
  nextSortOrder?: number;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  code: string;
  display_name: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export function AccountingCatalogModal({
  open,
  readOnly = false,
  operatingCompanyId,
  displayName,
  codeLabel = "Code",
  client,
  mode,
  row,
  metadataFields = [],
  nextSortOrder,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>({ code: "", display_name: "", description: "", is_active: true, sort_order: 0, metadata: {} });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      code: row?.code ?? "",
      display_name: row?.display_name ?? "",
      description: row?.description ?? "",
      is_active: row?.is_active ?? true,
      sort_order: row?.sort_order ?? nextSortOrder ?? 0,
      metadata: row?.metadata ?? {},
    });
    setErrors({});
    setSubmitError("");
  }, [open, row, nextSortOrder]);

  // Disabled-until-valid: Create/Save is disabled until code + name + every required metadata field
  // is present (the on-submit validate() below still produces per-field error messages).
  const canSubmit =
    Boolean(form.code.trim()) &&
    Boolean(form.display_name.trim()) &&
    metadataFields.every((field) => !field.required || String(form.metadata[field.key] ?? "").trim() !== "");

  function validate() {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next.code = "Code is required.";
    if (!form.display_name.trim()) next.display_name = "Display Name is required.";
    for (const field of metadataFields) {
      if (!field.required) continue;
      const value = form.metadata[field.key];
      if (value === undefined || value === null || String(value).trim() === "") {
        next[`metadata.${field.key}`] = `${field.label} is required.`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setIsSaving(true);
    setSubmitError("");
    const body: AccountingCatalogCreateBody = {
      code: form.code.trim(),
      display_name: form.display_name.trim(),
      description: form.description.trim() || undefined,
      is_active: form.is_active,
      sort_order: Number.isFinite(form.sort_order) ? form.sort_order : undefined,
      metadata: form.metadata,
    };
    try {
      if (mode === "create") await client.create(operatingCompanyId, body);
      else if (row) await client.update(row.id, operatingCompanyId, body);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError(`Failed to save ${displayName}.`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate() {
    if (!row) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      await client.deactivate(row.id, operatingCompanyId);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError(`Failed to deactivate ${displayName}.`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "create" ? `New ${displayName}` : `Edit ${displayName}`}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          {codeLabel}
          <input
            data-testid="catalog-code-input"
            value={form.code}
            disabled={readOnly || mode === "edit"}
            onChange={(event) => setForm((value) => ({ ...value, code: event.target.value.toUpperCase() }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm disabled:bg-slate-100"
          />
          {mode === "edit" ? (
            <span className="mt-1 block text-[10px] font-normal text-slate-400">Stable identifier — immutable after create.</span>
          ) : null}
          {errors.code ? <div className="mt-1 text-[11px] text-red-700">{errors.code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display Name
          <input
            data-testid="catalog-name-input"
            value={form.display_name}
            disabled={readOnly}
            onChange={(event) => setForm((value) => ({ ...value, display_name: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm disabled:bg-slate-100"
          />
          {errors.display_name ? <div className="mt-1 text-[11px] text-red-700">{errors.display_name}</div> : null}
        </label>

        {metadataFields.map((field) => {
          const value = form.metadata[field.key];
          if (field.type === "select") {
            return (
              <label key={field.key} className="block text-xs font-semibold text-gray-600">
                {field.label}
                <SelectCombobox
                  value={String(value ?? "")}
                  disabled={readOnly}
                  onChange={(event) => setForm((current) => ({ ...current, metadata: { ...current.metadata, [field.key]: event.target.value } }))}
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">Select...</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectCombobox>
                {errors[`metadata.${field.key}`] ? <div className="mt-1 text-[11px] text-red-700">{errors[`metadata.${field.key}`]}</div> : null}
              </label>
            );
          }
          return (
            <label key={field.key} className="block text-xs font-semibold text-gray-600">
              {field.label}
              <input
                type={field.type === "number" ? "number" : "text"}
                value={value === undefined || value === null ? "" : String(value)}
                disabled={readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    metadata: {
                      ...current.metadata,
                      [field.key]: field.type === "number" ? Number(event.target.value || 0) : event.target.value,
                    },
                  }))
                }
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm disabled:bg-slate-100"
              />
              {errors[`metadata.${field.key}`] ? <div className="mt-1 text-[11px] text-red-700">{errors[`metadata.${field.key}`]}</div> : null}
            </label>
          );
        })}

        <label className="block text-xs font-semibold text-gray-600">
          Description
          <textarea
            value={form.description}
            disabled={readOnly}
            onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-slate-100"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Sort order
          <input
            type="number"
            value={form.sort_order}
            disabled={readOnly}
            onChange={(event) => setForm((value) => ({ ...value, sort_order: Number(event.target.value || 0) }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm disabled:bg-slate-100"
          />
          <span className="mt-1 block text-[10px] font-normal text-slate-400">Dropdown display order (lower = earlier). Defaults to next available.</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={form.is_active}
            disabled={readOnly}
            onChange={(event) => setForm((value) => ({ ...value, is_active: event.target.checked }))}
          />
          Active
        </label>

        {mode === "edit" && row ? (
          <div className="border-t border-gray-100 pt-2 text-[10px] text-slate-400">
            Created {new Date(row.created_at).toLocaleString()} · Updated {new Date(row.updated_at).toLocaleString()}
          </div>
        ) : null}

        {submitError ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}

        <div className="flex items-center justify-between">
          <div>
            {!readOnly && mode === "edit" ? (
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => void deactivate()}>
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Close
            </Button>
            {!readOnly ? (
              <Button type="button" data-testid="catalog-submit" onClick={() => void submit()} disabled={isSaving || !canSubmit}>
                {mode === "create" ? "Create" : "Save Changes"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
