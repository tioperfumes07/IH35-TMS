import { useCallback, useEffect, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";

export type QuickAssignTarget = {
  equipmentKind: "truck" | "trailer";
  equipmentId: string;
  equipmentLabel: string;
};

type Props = {
  open: boolean;
  companyId: string;
  target: QuickAssignTarget | null;
  onClose: () => void;
  onConfirm: (driverId: string) => Promise<void>;
};

export function QuickAssignModal({ open, companyId, target, onClose, onConfirm }: Props) {
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetDraft = useCallback(() => {
    setDriverId("");
    setError(null);
  }, []);

  useEffect(() => {
    if (open) resetDraft();
  }, [open, companyId, target?.equipmentId, resetDraft]);

  const handleClose = useCallback(() => {
    resetDraft();
    onClose();
  }, [onClose, resetDraft]);

  if (!target) return null;

  return (
    <Modal open={open} onClose={handleClose} title={`Quick assign ${target.equipmentLabel}`}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!driverId) return;
          setLoading(true);
          setError(null);
          try {
            await onConfirm(driverId);
            handleClose();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Couldn't assign this driver. Try again.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="text-xs text-gray-600">
          Assign an eligible active driver to this {target.equipmentKind === "truck" ? "truck" : "trailer"}.
        </p>
        <DriverPickerWithCreate
          operatingCompanyId={companyId}
          value={driverId || null}
          onChange={(next) => setDriverId(next ?? "")}
          open={open}
          placeholder="Select driver…"
          className="h-9 w-full text-sm"
          allowClear={false}
          // Standalone Modal chrome → default shell="modal".
        />
        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!driverId}>
            Confirm assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
