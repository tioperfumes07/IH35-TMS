/**
 * BK7 — New Class drawer form (minimal — Class name only).
 * OPERATIONAL gate: class create is non-financial.
 */
import { useState } from "react";
import { createQboAccount } from "../../../api/qbo-mdata";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewClassDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { pushToast("Class name is required.", "error"); return; }
    setSaving(true);
    try {
      const res = await createQboAccount(operatingCompanyId, {
        name: name.trim(),
        account_type: "Class",
        full_qualified_name: name.trim(),
      });
      onCreated({ id: String(res.account.id), label: name.trim() });
      pushToast("Class created", "success");
      onClose();
    } catch (err) {
      pushToast(String((err as Error).message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Class name *</span>
        <input
          className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Owner-Operator"
          autoFocus
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-700">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
