import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listDispatchCancellationReasons } from "../../api/dispatch";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSubmit: (payload: {
    reason_code: string;
    cancellation_notes: string;
    billable_to_customer: boolean;
    cancellation_charge_cents?: number;
  }) => Promise<void>;
};

export function CancelLoadModal({ open, operatingCompanyId, onClose, onSubmit }: Props) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(false);
  const [charge, setCharge] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonsQuery = useQuery({
    queryKey: ["dispatch", "cancellation-reasons"],
    queryFn: () => listDispatchCancellationReasons().then((value) => value.reasons),
    enabled: open && Boolean(operatingCompanyId),
  });

  const reasons = reasonsQuery.data ?? [];
  const selectedReason = reasons.find((reason) => String(reason.reason_code) === reasonCode) ?? null;

  return (
    <Modal open={open} onClose={onClose} title="Cancel Load">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!selectedReason || notes.trim().length < 20) return;
          setSubmitting(true);
          try {
            await onSubmit({
              reason_code: String(selectedReason.reason_code),
              cancellation_notes: notes.trim(),
              billable_to_customer: billable,
              cancellation_charge_cents: charge.trim() ? Math.round(Number(charge) * 100) : undefined,
            });
            setReasonCode(null);
            setNotes("");
            setBillable(false);
            setCharge("");
            onClose();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Cancellation Reason</label>
          <Combobox
            options={reasons.map((reason) => ({
              value: String(reason.reason_code),
              label: String(reason.reason_label),
              sublabel: `${String(reason.reason_code)}${reason.requires_owner_approval ? " · Owner approval" : ""}`,
            }))}
            value={reasonCode}
            onChange={(nextCode) => setReasonCode(nextCode)}
            placeholder="Select reason"
            loading={reasonsQuery.isLoading}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            placeholder="Required notes (min 20 chars)"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} />
          Billable to customer
        </label>
        <input
          value={charge}
          onChange={(event) => setCharge(event.target.value)}
          className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          placeholder="Cancellation charge (USD, optional)"
        />
        {selectedReason && Boolean(selectedReason.requires_owner_approval) ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            This reason requires Owner approval before load status flips to cancelled.
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="danger" loading={submitting} disabled={!selectedReason || notes.trim().length < 20}>
            Confirm Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
