import { useState } from "react";
import type { DriversReferenceCatalogCreateBody } from "../../../api/lists-drivers-catalogs";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";

export type DriversReferenceCatalogClient = {
  create: (body: DriversReferenceCatalogCreateBody) => Promise<unknown>;
};

type Props = {
  open: boolean;
  displayName: string;
  client: DriversReferenceCatalogClient;
  onClose: () => void;
  onSaved: () => void;
};

export function DriversReferenceCatalogModal({ open, displayName, client, onClose, onSaved }: Props) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await client.create({
        code: code.trim(),
        label: label.trim(),
        sort_order: Number(sortOrder),
      });
      setCode("");
      setLabel("");
      setSortOrder("50");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create catalog row");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={`Create ${displayName}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Code</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Label</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Sort order</span>
          <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} type="number" className="h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || !code.trim() || !label.trim()} onClick={() => void handleSave()}>
            {saving ? "Saving..." : "+ Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
