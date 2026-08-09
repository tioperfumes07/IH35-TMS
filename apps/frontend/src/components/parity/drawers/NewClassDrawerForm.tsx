/**
 * BK7 — New Class drawer form (minimal — Class name only).
 * QB-STD-5: writes to catalogs.classes (canonical) via classesCatalogClient. Previously used
 * createQboAccount with account_type:"Class" which wrote to mdata.qbo_accounts (wrong table AND
 * would have triggered a live QBO push). InlineCreateDrawer still holds the "class" kind wiring
 * until ReferenceSelect adds kind:"class" support.
 */
import { useState } from "react";
import { classesCatalogClient } from "../../../api/catalogs-accounting";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";
import { userFacingApiError } from "../../../lib/api-error-message";

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
    // INLINE-CREATE-NESTED-FORM: React events bubble through the REACT tree even across the
    // ParityDrawer portal, so without this the parent wizard form's onSubmit fires too.
    e.stopPropagation();
    if (!name.trim()) { pushToast("Class name is required.", "error"); return; }
    setSaving(true);
    try {
      const nameSlug = name.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 20) || "CLASS";
      const res = await classesCatalogClient.create(operatingCompanyId, {
        code: nameSlug,
        display_name: name.trim(),
      });
      onCreated({ id: String(res.id), label: name.trim() });
      pushToast("Class created", "success");
      onClose();
    } catch (err) {
      pushToast(userFacingApiError(err, "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Class name *</span>
        <input
          className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Owner-Operator"
          autoFocus
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0f1729]">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
