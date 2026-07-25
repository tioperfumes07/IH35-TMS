/**
 * LST-PICKER-03 — the ONE generic inline-create surface for config-driven catalogs.
 *
 * This component is deliberately catalog-AGNOSTIC: it contains no catalog name, no endpoint, no
 * per-kind branch. Everything it renders and everything it POSTs comes from the CatalogPickerConfig
 * handed to it. That is the whole point of LST-PICKER-01: adding the 12th catalog must not add a
 * 12th component, and this file must never grow an `if (kind === …)`.
 *
 * CHROME-11: create nests in a right ParityDrawer, never a centered Modal stacked on a money drawer.
 * Entity scoping: operatingCompanyId is required before any write is attempted.
 */
import { useEffect, useState } from "react";
import { ParityDrawer } from "./ParityDrawer";
import { useToast } from "../Toast";
import type { CatalogCreateResult, CatalogPickerConfig } from "./catalogPickerRegistry";

type Props = {
  open: boolean;
  config: CatalogPickerConfig;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (created: CatalogCreateResult) => void;
};

type FieldValues = Record<string, string>;

export function CatalogQuickCreateDrawer({ open, config, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<FieldValues>({});

  // A reopened drawer must never show the previous catalog's half-typed values.
  useEffect(() => {
    if (!open) setValues({});
  }, [open]);

  const fields = config.fields ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!config.create) {
      pushToast("This catalog has no inline create configured.", "error");
      return;
    }
    if (!operatingCompanyId) {
      pushToast("Select an operating company first.", "error");
      return;
    }
    const displayName = (values.display_name ?? "").trim();
    if (!displayName) {
      pushToast("Name is required.", "error");
      return;
    }

    setSaving(true);
    try {
      const created = await config.create(operatingCompanyId, {
        display_name: displayName,
        code: values.code?.trim() || undefined,
        description: values.description?.trim() || undefined,
      });
      pushToast("Created successfully", "success");
      setValues({});
      onCreated(created);
      onClose();
    } catch (error) {
      // No silent retry: surface the real server message so a 400 on the code format is diagnosable.
      pushToast(String((error as Error)?.message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ParityDrawer open={open} onClose={onClose} title={`Create ${config.label}`}>
      <form className="space-y-3 text-sm" onSubmit={submit} data-testid="catalog-quick-create-drawer">
        {/* Provenance, visible to the operator: this create writes the same table the list reads. */}
        <p className="text-[10px] text-[#64748b]" data-testid="catalog-quick-create-target">
          Saves to {config.writeTable}
        </p>

        {fields.map((field) => (
          <label className="block" key={field.name}>
            <span className="text-xs font-medium text-[#334155]">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.multiline ? (
              <textarea
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                rows={2}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                aria-label={`Create ${config.label} ${field.label}`}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
              />
            ) : (
              <input
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                aria-label={`Create ${config.label} ${field.label}`}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
              />
            )}
            {field.help ? <span className="mt-0.5 block text-[10px] text-[#64748b]">{field.help}</span> : null}
          </label>
        ))}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-3 py-1.5"
            onClick={onClose}
            aria-label="Cancel catalog quick create"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 font-medium text-white hover:bg-[#0f1729] disabled:opacity-60"
            disabled={saving}
            aria-label="Save catalog quick create"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </ParityDrawer>
  );
}
