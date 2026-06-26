import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { SelectCombobox } from "../shared/SelectCombobox";

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

  const driversQuery = useQuery({
    queryKey: ["quick-assign-drivers", companyId],
    queryFn: () => listDrivers({ operating_company_id: companyId, status: "Active", limit: 200 }), // full active set (endpoint default 50 truncates >50)
    enabled: open && Boolean(companyId),
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((d) => ({
        value: d.id,
        label: [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.id.slice(0, 8),
      })),
    [driversQuery.data?.drivers]
  );

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
        <SelectCombobox
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
          className="h-9 w-full text-sm"
          required
        >
          <option value="">Select driver…</option>
          {driverOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectCombobox>
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
