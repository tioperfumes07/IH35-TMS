import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { recordLoadAbandonment } from "../../api/abandonment";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

type Props = {
  loadId: string;
  operatingCompanyId: string;
  defaultDriverId?: string | null;
  onClose: () => void;
  onRecorded?: () => void;
};

export function AbandonmentReportModal({ loadId, operatingCompanyId, defaultDriverId, onClose, onRecorded }: Props) {
  const { pushToast } = useToast();
  const [driverId, setDriverId] = useState(defaultDriverId ?? "");
  const [abandonmentEventAt, setAbandonmentEventAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState("");
  const [towing, setTowing] = useState("");
  const [deadheadMiles, setDeadheadMiles] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      recordLoadAbandonment(loadId, operatingCompanyId, {
        driver_id: driverId.trim(),
        abandonment_event_at: new Date(abandonmentEventAt).toISOString(),
        abandonment_location: location.trim() || null,
        towing_cost_cents: towing.trim() ? Number(towing) : null,
        deadhead_miles: deadheadMiles.trim() ? Number(deadheadMiles) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: (data) => {
      pushToast(`Chargeback recorded (${String(data.computed?.status ?? "")})`, "success");
      onRecorded?.();
      onClose();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Failed to record abandonment"), "error"),
  });

  return (
    <Modal open title="Report load abandonment" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">Creates a chargeback line and marks the load abandoned.</p>
      <div className="space-y-3 text-sm">
        <label className="block text-xs font-semibold text-slate-600">
          Driver ID (uuid)
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2 font-mono text-[12px]" value={driverId} onChange={(e) => setDriverId(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Abandonment time (local)
          <input type="datetime-local" className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={abandonmentEventAt} onChange={(e) => setAbandonmentEventAt(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Location (optional)
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold text-slate-600">
            Towing (¢ override)
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={towing} onChange={(e) => setTowing(e.target.value.replace(/[^\d]/g, ""))} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Deadhead miles
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={deadheadMiles} onChange={(e) => setDeadheadMiles(e.target.value)} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-slate-600">
          Notes
          <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void mut.mutateAsync()} loading={mut.isPending} disabled={!driverId.trim()}>
          Submit
        </Button>
      </div>
    </Modal>
  );
}
