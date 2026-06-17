import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createSafetyEvent, listTerminationReasons } from "../../api/mdata";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  driverId: string;
  driverName: string;
  onClose: () => void;
  onTerminated?: () => void;
};

export function TerminateConfirmModal({ open, driverId, driverName, onClose, onTerminated }: Props) {
  const [terminationReasonId, setTerminationReasonId] = useState("");
  const [summary, setSummary] = useState("");
  const [eventDate, setEventDate] = useState(todayIso());
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const reasonsQ = useQuery({
    queryKey: ["termination-reasons"],
    queryFn: () => listTerminationReasons().then((result) => result.reasons),
    enabled: open,
  });

  const selectedReason = reasonsQ.data?.find((reason) => reason.id === terminationReasonId) ?? null;

  const submit = async () => {
    setError("");
    if (!terminationReasonId || !selectedReason) {
      setError("Termination reason is required.");
      return;
    }
    if (!summary.trim()) {
      setError("Summary is required.");
      return;
    }
    setPending(true);
    try {
      await createSafetyEvent(driverId, {
        event_type: "termination",
        event_date: eventDate,
        severity: selectedReason.severity,
        summary: summary.trim(),
        termination_reason_id: terminationReasonId,
      });
      setSummary("");
      setTerminationReasonId("");
      onTerminated?.();
      onClose();
    } catch {
      setError("Failed to terminate driver.");
    } finally {
      setPending(false);
    }
  };

  const reasonOptions =
    reasonsQ.data?.map((reason) => ({ value: reason.id, label: reason.label })) ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`Terminate — ${driverName}`}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Creates a termination safety event and updates driver status to Terminated.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Termination reason</label>
          <Combobox
            options={reasonOptions}
            value={terminationReasonId || null}
            onChange={(value) => setTerminationReasonId(value ?? "")}
            placeholder="Select reason"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Event date</label>
          <input
            type="date"
            max={todayIso()}
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Summary</label>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={3}
            data-testid="terminate-summary"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} loading={pending} data-testid="terminate-confirm">
            Terminate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
