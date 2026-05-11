import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { UploadZone } from "../../../components/UploadZone";
import { Button } from "../../../components/Button";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  entityId?: string;
  onClose: () => void;
};

export function SevereRepairEstimateModal({ open, operatingCompanyId, entityId, onClose }: Props) {
  const [laborCents, setLaborCents] = useState("0");
  const [partsCents, setPartsCents] = useState("0");
  const [outsideCents, setOutsideCents] = useState("0");
  const [notes, setNotes] = useState("");
  const safeEntityId = entityId ?? crypto.randomUUID();
  return (
    <Modal open={open} onClose={onClose} title="Severe Repair Estimate">
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">
            Labor (cents)
            <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm" value={laborCents} onChange={(event) => setLaborCents(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Parts (cents)
            <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm" value={partsCents} onChange={(event) => setPartsCents(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Outside services (cents)
            <input className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm" value={outsideCents} onChange={(event) => setOutsideCents(event.target.value)} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-slate-600">
          Notes
          <textarea className="mt-1 min-h-24 w-full rounded border border-slate-300 px-2 py-1 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="severe_repair"
          entityId={safeEntityId}
          defaultCategory="vendor_estimate"
          title="Estimate Attachments"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onClose}>
            Save Estimate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
