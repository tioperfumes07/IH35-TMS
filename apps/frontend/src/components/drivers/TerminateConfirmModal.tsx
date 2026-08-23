import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createSafetyEvent, listTerminationReasons } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { DatePicker } from "../forms/DatePicker";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { companyToday } from "../../lib/businessDate";
import { ListErrorState } from "../ListErrorState";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  driverId: string;
  driverName: string;
  operatingCompanyId: string;
  onClose: () => void;
  onTerminated?: () => void;
};

export function TerminateConfirmModal({
  open,
  driverId,
  driverName,
  operatingCompanyId,
  onClose,
  onTerminated,
}: Props) {
  const queryClient = useQueryClient();
  const [terminationReasonId, setTerminationReasonId] = useState("");
  const [summary, setSummary] = useState("");
  const [eventDate, setEventDate] = useState(companyToday());
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const reasonsQ = useQuery({
    queryKey: ["driver-termination-reasons", operatingCompanyId],
    queryFn: () => listTerminationReasons(operatingCompanyId).then((result) => result.reasons),
    enabled: open,
  });

  const selectedReason = reasonsQ.data?.find((reason) => reason.id === terminationReasonId) ?? null;

  const submit = async () => {
    setError("");
    if (reasonsQ.isError) {
      setError("Termination reasons are unavailable. Retry before terminating this driver.");
      return;
    }
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
    reasonsQ.data?.map((reason) => ({
      value: reason.id,
      label: reason.label,
      type: reason.severity,
    })) ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`Terminate — ${driverName}`}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Creates a termination safety event and updates driver status to Terminated.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Termination reason</label>
          {/*
            LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.driver_termination_reasons.
          */}
          <ReferenceSelect
            value={terminationReasonId || null}
            onChange={(value) => setTerminationReasonId(value ?? "")}
            options={reasonOptions}
            createKind="driver_termination_reason"
            operatingCompanyId={operatingCompanyId}
            createExtras={{ severity: selectedReason?.severity ?? "warning" }}
            placeholder={reasonsQ.isLoading ? "Loading reasons…" : "Select reason"}
            loading={reasonsQ.isLoading}
            onOptionCreated={() => {
              void queryClient.invalidateQueries({ queryKey: ["driver-termination-reasons"] });
            }}
          />
          {reasonsQ.isError ? (
            <ListErrorState
              title="Couldn't load termination reasons"
              status={0}
              message={(reasonsQ.error as Error)?.message}
              onRetry={() => void reasonsQ.refetch()}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Event date</label>
          <DatePicker
            max={todayIso()}
            value={eventDate}
            onChange={setEventDate}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Summary</label>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={3}
            data-testid="terminate-summary"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} loading={pending} disabled={reasonsQ.isError} data-testid="terminate-confirm">
            Terminate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
