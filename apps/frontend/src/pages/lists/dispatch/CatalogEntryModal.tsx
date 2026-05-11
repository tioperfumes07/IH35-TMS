import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import type { DispatchCatalogCreateBody, DispatchCatalogRow, DispatchCatalogUpdateBody } from "../../../api/catalogs-dispatch";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  title: string;
  initialRow?: DispatchCatalogRow | null;
  duplicateCodeError?: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: DispatchCatalogCreateBody | DispatchCatalogUpdateBody) => Promise<void>;
  onDeactivate?: () => Promise<void>;
};

type FormState = {
  code: string;
  display_name: string;
  description: string;
  sort_order: string;
  is_active: boolean;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const CODE_REGEX = /^[A-Z][A-Z0-9-]+$/;

function toInitial(row?: DispatchCatalogRow | null): FormState {
  return {
    code: row?.code ?? "",
    display_name: row?.display_name ?? "",
    description: row?.description ?? "",
    sort_order: String(row?.sort_order ?? 50),
    is_active: row?.is_active ?? true,
  };
}

export function CatalogEntryModal({ open, mode, title, initialRow, duplicateCodeError, saving, onClose, onSave, onDeactivate }: Props) {
  const [form, setForm] = useState<FormState>(toInitial(initialRow));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(toInitial(initialRow));
    setFieldErrors({});
    setSubmitError(null);
  }, [open, initialRow]);

  const normalizedCode = useMemo(() => form.code.trim().toUpperCase(), [form.code]);

  function validate(next: FormState): FieldErrors {
    const errors: FieldErrors = {};
    if (!CODE_REGEX.test(next.code.trim())) errors.code = "Code must be uppercase letters, numbers, and dashes only.";
    if (!next.display_name.trim()) errors.display_name = "Display name is required.";
    if (!next.sort_order.trim() || Number.isNaN(Number(next.sort_order))) errors.sort_order = "Sort order is required.";
    return errors;
  }

  async function submit() {
    const next = { ...form, code: normalizedCode };
    const errors = validate(next);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitError(null);
    await onSave({
      code: next.code,
      display_name: next.display_name.trim(),
      description: next.description.trim() || null,
      sort_order: Number(next.sort_order),
      metadata: initialRow?.metadata ?? {},
      ...(mode === "create" ? { is_active: next.is_active } : {}),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Code
            <input
              value={form.code}
              onChange={(event) => {
                const nextCode = event.target.value.toUpperCase();
                setForm((current) => ({ ...current, code: nextCode }));
              }}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
              placeholder="EXAMPLE-CODE"
            />
            {fieldErrors.code ? <span className="text-xs text-red-600">{fieldErrors.code}</span> : null}
            {duplicateCodeError ? <span className="text-xs text-red-600">{duplicateCodeError}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Display Name
            <input
              value={form.display_name}
              onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
              placeholder="Display name"
            />
            {fieldErrors.display_name ? <span className="text-xs text-red-600">{fieldErrors.display_name}</span> : null}
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="Optional description"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Sort Order
            <input
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            />
            {fieldErrors.sort_order ? <span className="text-xs text-red-600">{fieldErrors.sort_order}</span> : null}
          </label>

          {mode === "create" ? (
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
              Active
            </label>
          ) : null}
        </div>

        {submitError ? <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{submitError}</div> : null}

        <div className="flex items-center justify-between gap-2">
          <div>
            {mode === "edit" && onDeactivate ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  void onDeactivate();
                }}
                disabled={saving || !initialRow?.is_active}
              >
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {mode === "create" ? "Create Entry" : "Save Changes"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
