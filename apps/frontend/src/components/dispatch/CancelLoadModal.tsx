import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLoadCancellationReasons, type LoadCancellationReason } from "../../api/catalogs";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSubmit: (reason: LoadCancellationReason, notes: string) => Promise<void>;
};

export function CancelLoadModal({ open, operatingCompanyId, onClose, onSubmit }: Props) {
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonsQuery = useQuery({
    queryKey: ["catalogs", "load-cancellation-reasons", operatingCompanyId],
    queryFn: () => listLoadCancellationReasons(operatingCompanyId).then((value) => value.reasons),
    enabled: open && Boolean(operatingCompanyId),
  });

  const reasons = reasonsQuery.data ?? [];
  const selectedReason = reasons.find((reason) => reason.id === reasonId) ?? null;

  return (
    <Modal open={open} onClose={onClose} title="Cancel Load">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!selectedReason) return;
          setSubmitting(true);
          try {
            await onSubmit(selectedReason, notes.trim());
            setReasonId(null);
            setNotes("");
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
              value: reason.id,
              label: reason.display_name,
              sublabel: `${reason.reason_code} · ${reason.category}`,
            }))}
            value={reasonId}
            onChange={(nextReasonId) => setReasonId(nextReasonId)}
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
            className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Optional notes"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="danger" loading={submitting} disabled={!selectedReason}>
            Confirm Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
