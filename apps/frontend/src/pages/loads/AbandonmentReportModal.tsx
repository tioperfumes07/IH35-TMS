import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { recordLoadAbandonment } from "../../api/abandonment";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { useToast } from "../../components/Toast";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  loadId: string;
  loadNumber?: string | null;
  operatingCompanyId: string;
  defaultDriverId?: string | null;
  defaultDriverLabel?: string | null;
  onClose: () => void;
  onRecorded?: () => void;
};

export function AbandonmentReportModal({
  loadId,
  loadNumber,
  operatingCompanyId,
  defaultDriverId,
  defaultDriverLabel,
  onClose,
  onRecorded,
}: Props) {
  const { pushToast } = useToast();
  const [driverId, setDriverId] = useState(defaultDriverId ?? "");
  const [driverLabel, setDriverLabel] = useState(defaultDriverLabel ?? "");
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
      {/* Exact Leaves dispatch.modal.abandonment_report:load|driver —
          loadId was API-only; driver was picker-only — expose EntityLinks. */}
      <div
        className="mb-3 flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
        data-testid="abandonment-report-modal-entitylinks"
      >
        <span>
          Load: <EntityLink kind="load" id={loadId} label={entityLabel(loadNumber ?? null, loadId, "Load")} />
        </span>
        {driverId ? (
          <span>
            Driver: <EntityLink kind="driver" id={driverId} label={entityLabel(driverLabel, driverId, "Driver")} />
          </span>
        ) : null}
      </div>
      <div className="space-y-3 text-sm">
        <label className="block text-xs font-semibold text-slate-600">
          Driver
          <DriverPickerWithCreate
            operatingCompanyId={operatingCompanyId}
            value={driverId || null}
            onChange={(next, option) => {
              setDriverId(next ?? "");
              setDriverLabel(option?.label ?? "");
            }}
            onSelectedOptionResolved={(option) => setDriverLabel(option?.label ?? "")}
            placeholder="Search driver…"
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Abandonment time (local)
          <DateTimePicker className="mt-1 w-full" aria-label="Abandonment time (local)" value={abandonmentEventAt} onChange={setAbandonmentEventAt} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Location (optional)
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-2" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold text-slate-600">
            Towing (¢ override)
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-2" value={towing} onChange={(e) => setTowing(e.target.value.replace(/[^\d]/g, ""))} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Deadhead miles
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-2" value={deadheadMiles} onChange={(e) => setDeadheadMiles(e.target.value)} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-slate-600">
          Notes
          <textarea className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
