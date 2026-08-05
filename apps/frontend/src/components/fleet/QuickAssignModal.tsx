import { useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { EntityPicker } from "../parity/EntityPicker";

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

  if (!target) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Quick assign ${target.equipmentLabel}`}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!driverId) return;
          setLoading(true);
          try {
            await onConfirm(driverId);
            setDriverId("");
            onClose();
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="text-xs text-gray-600">
          Assign an eligible active driver to this {target.equipmentKind === "truck" ? "truck" : "trailer"}.
        </p>
        {/* SAF-B29: EntityPicker kind=driver — not DriverPickerWithCreate Combobox+listDrivers page. */}
        <EntityPicker
          kind="driver"
          operatingCompanyId={companyId}
          value={driverId || null}
          onChange={(next) => setDriverId(next ?? "")}
          enabled={open}
          placeholder="Select driver…"
          className="h-9 w-full text-sm"
          allowClear={false}
          dataTestId="fleet-quick-assign-driver"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
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
