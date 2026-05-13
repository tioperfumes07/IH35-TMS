import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import type { LegalTemplateDraft } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (draft: LegalTemplateDraft) => Promise<void>;
};

const DEFAULT_VARIABLE_SCHEMA = `{
  "fields": {
    "effective_date": { "type": "date", "required": true },
    "employee_full_legal_name": { "type": "text", "required": true }
  }
}`;

export function LegalTemplateNewModal({ open, onClose, onCreate }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState({
    template_code: "",
    display_name_en: "",
    display_name_es: "",
    category: "employment",
    requires_witness: false,
    content_html_en: "<h1>Draft template</h1><p>Replace with attorney-reviewed text.</p>",
    content_html_es: "<!-- Spanish translation pending certified legal review -->",
    variable_schema_json: DEFAULT_VARIABLE_SCHEMA,
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError("");
  }, [open]);

  async function submit() {
    setIsSaving(true);
    setSubmitError("");
    try {
      const variableSchema = JSON.parse(form.variable_schema_json) as LegalTemplateDraft["variable_schema"];
      await onCreate({
        template_code: form.template_code.trim(),
        display_name_en: form.display_name_en.trim(),
        display_name_es: form.display_name_es.trim(),
        category: form.category.trim(),
        requires_witness: form.requires_witness,
        content_html_en: form.content_html_en,
        content_html_es: form.content_html_es,
        variable_schema: variableSchema,
      });
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(payload.error ?? payload.message ?? error.message));
      } else if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Failed to create legal template.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Legal Template">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Template code
          <input
            value={form.template_code}
            onChange={(event) => setForm((prev) => ({ ...prev, template_code: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
            placeholder="employee_nda"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display Name (EN)
          <input
            value={form.display_name_en}
            onChange={(event) => setForm((prev) => ({ ...prev, display_name_en: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display Name (ES)
          <input
            value={form.display_name_es}
            onChange={(event) => setForm((prev) => ({ ...prev, display_name_es: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Category
          <input
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={form.requires_witness}
            onChange={(event) => setForm((prev) => ({ ...prev, requires_witness: event.target.checked }))}
          />
          Requires witness
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          English HTML
          <textarea
            value={form.content_html_en}
            onChange={(event) => setForm((prev) => ({ ...prev, content_html_en: event.target.value }))}
            rows={5}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Spanish HTML
          <textarea
            value={form.content_html_es}
            onChange={(event) => setForm((prev) => ({ ...prev, content_html_es: event.target.value }))}
            rows={5}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Variable schema (JSON)
          <textarea
            value={form.variable_schema_json}
            onChange={(event) => setForm((prev) => ({ ...prev, variable_schema_json: event.target.value }))}
            rows={8}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
          />
        </label>

        {submitError ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={isSaving}>
            + Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
